import { db } from '../config/database.js';

export const deliveryRepository = {
  /**
   * Record a notification delivery attempt with deduplication support
   */
  async create({
    destination_id,
    detected_change_id = null,
    monitor_id = null,
    dedup_key = null,
    trigger_type = 'change',
    payload = {},
    status = 'pending',
    http_status_code = null,
    error_message = null,
    sent_at = null,
    attempt_count = 1,
    retry_count = 0,
    max_retries = 3,
    next_retry_at = null
  }) {
    const query = `
      INSERT INTO notification_deliveries (
        destination_id,
        detected_change_id,
        monitor_id,
        dedup_key,
        trigger_type,
        payload,
        status,
        http_status_code,
        error_message,
        sent_at,
        attempt_count,
        retry_count,
        max_retries,
        next_retry_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (dedup_key) DO UPDATE SET
        status = EXCLUDED.status,
        http_status_code = EXCLUDED.http_status_code,
        error_message = EXCLUDED.error_message,
        sent_at = EXCLUDED.sent_at,
        attempt_count = notification_deliveries.attempt_count + 1,
        retry_count = EXCLUDED.retry_count,
        next_retry_at = EXCLUDED.next_retry_at
      RETURNING *
    `;

    const res = await db.query(query, [
      destination_id,
      detected_change_id,
      monitor_id,
      dedup_key,
      trigger_type,
      JSON.stringify(payload),
      status,
      http_status_code,
      error_message,
      sent_at,
      attempt_count,
      retry_count,
      max_retries,
      next_retry_at
    ]);

    return res.rows[0];
  },

  /**
   * Find delivery by ID
   */
  async findById(id) {
    const query = `
      SELECT nd.*, d.name AS destination_name, d.channel, d.target_destination, m.name AS monitor_name, m.url AS monitor_url
      FROM notification_deliveries nd
      JOIN notification_destinations d ON nd.destination_id = d.id
      LEFT JOIN monitors m ON nd.monitor_id = m.id
      WHERE nd.id = $1
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find delivery by deduplication key
   */
  async findByDedupKey(dedupKey) {
    if (!dedupKey) return null;
    const query = 'SELECT * FROM notification_deliveries WHERE dedup_key = $1';
    const res = await db.query(query, [dedupKey]);
    return res.rows[0] || null;
  },

  /**
   * Update delivery record status and attempt details
   */
  async update(id, updates) {
    const allowed = [
      'status',
      'http_status_code',
      'error_message',
      'sent_at',
      'attempt_count',
      'retry_count',
      'next_retry_at'
    ];
    const setClauses = [];
    const params = [id];
    let idx = 2;

    for (const [key, val] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        setClauses.push(`${key} = $${idx++}`);
        params.push(val);
      }
    }

    if (setClauses.length === 0) return this.findById(id);

    const query = `
      UPDATE notification_deliveries
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, params);
    return res.rows[0] || null;
  },

  /**
   * List deliveries for a workspace with pagination and filters
   */
  async listDeliveries(workspaceId, { destination_id, status, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['d.workspace_id = $1'];
    const params = [workspaceId];
    let paramIdx = 2;

    if (destination_id) {
      conditions.push(`nd.destination_id = $${paramIdx++}`);
      params.push(destination_id);
    }
    if (status) {
      conditions.push(`nd.status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM notification_deliveries nd
       JOIN notification_destinations d ON nd.destination_id = d.id
       WHERE ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const query = `
      SELECT 
        nd.*,
        d.name AS destination_name,
        d.channel,
        d.target_destination,
        m.name AS monitor_name,
        m.url AS monitor_url
      FROM notification_deliveries nd
      JOIN notification_destinations d ON nd.destination_id = d.id
      LEFT JOIN monitors m ON nd.monitor_id = m.id
      WHERE ${whereClause}
      ORDER BY nd.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(query, params);

    return {
      deliveries: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Find deliveries scheduled for retry
   */
  async findPendingRetries(limit = 10) {
    const query = `
      SELECT nd.*, d.workspace_id, d.channel, d.target_destination, d.config, d.is_active
      FROM notification_deliveries nd
      JOIN notification_destinations d ON nd.destination_id = d.id
      WHERE nd.status = 'pending'
        AND nd.retry_count < nd.max_retries
        AND (nd.next_retry_at IS NULL OR nd.next_retry_at <= NOW())
        AND d.is_active = true
      ORDER BY nd.created_at ASC
      LIMIT $1
    `;
    const res = await db.query(query, [limit]);
    return res.rows;
  }
};

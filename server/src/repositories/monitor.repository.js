import crypto from 'node:crypto';
import { db } from '../config/database.js';

export const monitorRepository = {
  /**
   * List monitors with filtering, search, sorting, and pagination
   */
  async findAll(options = {}, legacyOptions = {}) {
    let workspaceId;
    let search = '';
    let status = '';
    let isActive = null;
    let page = 1;
    let limit = 20;
    let sortBy = 'created_at';
    let order = 'DESC';

    if (typeof options === 'string') {
      workspaceId = options;
      search = legacyOptions.search || '';
      status = legacyOptions.status || '';
      limit = legacyOptions.limit || 20;
      const offset = legacyOptions.offset || 0;
      page = Math.floor(offset / limit) + 1;
      sortBy = legacyOptions.sortBy || 'created_at';
    } else {
      workspaceId = options.workspace_id || options.workspaceId;
      search = options.search || '';
      status = options.status || '';
      isActive = options.is_active;
      page = parseInt(options.page || '1', 10);
      limit = parseInt(options.limit || '20', 10);
      sortBy = options.sortBy || options.sort_by || 'created_at';
      order = options.order || 'DESC';
    }

    const conditions = [];
    const params = [];
    let pIdx = 1;

    if (workspaceId) {
      conditions.push(`m.workspace_id = $${pIdx++}`);
      params.push(workspaceId);
    }

    if (status && status !== 'all') {
      conditions.push(`m.status = $${pIdx++}`);
      params.push(status);
    }

    if (typeof isActive === 'boolean') {
      conditions.push(`m.is_active = $${pIdx++}`);
      params.push(isActive);
    }

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      conditions.push(`(LOWER(m.name) LIKE $${pIdx} OR LOWER(m.url) LIKE $${pIdx} OR LOWER(COALESCE(m.last_change_summary, '')) LIKE $${pIdx})`);
      params.push(term);
      pIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination
    const countQuery = `SELECT COUNT(*)::int AS total FROM monitors m ${whereClause}`;
    const countRes = await db.query(countQuery, params);
    const total = countRes.rows[0]?.total || 0;

    // Sorting
    let safeSort = 'm.created_at';
    if (sortBy === 'name' || sortBy === 'name-asc') safeSort = 'm.name';
    else if (sortBy === 'status') safeSort = 'm.status';
    else if (sortBy === 'last_checked_at') safeSort = 'm.last_checked_at';

    const safeOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const offset = (page - 1) * limit;

    const query = `
      SELECT m.*, ct.normalized_url, ct.last_fetch_status
      FROM monitors m
      JOIN canonical_targets ct ON m.canonical_target_id = ct.id
      ${whereClause}
      ORDER BY ${safeSort} ${safeOrder}
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(query, params);

    return {
      monitors: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Find single monitor by ID
   */
  async findById(id, workspaceId = null) {
    let query = `
      SELECT m.*, ct.normalized_url, ct.last_fetch_status
      FROM monitors m
      JOIN canonical_targets ct ON m.canonical_target_id = ct.id
      WHERE m.id = $1
    `;
    const params = [id];
    if (workspaceId) {
      query += ` AND m.workspace_id = $2`;
      params.push(workspaceId);
    }

    const res = await db.query(query, params);
    return res.rows[0] || null;
  },

  /**
   * Create monitor
   */
  async create(data) {
    const feedToken = data.feed_token !== undefined
      ? data.feed_token
      : crypto.randomBytes(32).toString('hex');
    const feedEnabled = data.feed_enabled !== undefined
      ? Boolean(data.feed_enabled)
      : true;

    const res = await db.query(
      `INSERT INTO monitors (
        workspace_id, canonical_target_id, name, url, mode, check_cadence,
        css_selector, ignored_selectors, ignore_patterns, noise_threshold_percent, status, previous_status,
        is_active, is_reviewed, last_checked_at, last_change_at, last_change_summary,
        numeric_selector, numeric_unit, feed_token, feed_enabled
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        data.workspace_id,
        data.canonical_target_id,
        data.name,
        data.url,
        data.mode || 'both',
        data.check_cadence || '15m',
        data.css_selector || '',
        data.ignored_selectors || '',
        JSON.stringify(data.ignore_patterns || []),
        data.noise_threshold_percent ?? 5,
        data.status || 'pending',
        data.previous_status || 'healthy',
        data.is_active ?? true,
        data.is_reviewed ?? true,
        data.last_checked_at || null,
        data.last_change_at || null,
        data.last_change_summary || null,
        data.numeric_selector || null,
        data.numeric_unit || null,
        feedToken,
        feedEnabled
      ]
    );
    return res.rows[0];
  },

  /**
   * Update monitor
   */
  async update(id, updates = {}, workspaceId = null) {
    const allowed = [
      'canonical_target_id', 'name', 'url', 'mode', 'check_cadence', 'css_selector',
      'ignored_selectors', 'ignore_patterns',
      'noise_threshold_percent', 'status', 'previous_status',
      'is_active', 'is_reviewed', 'last_checked_at', 'last_change_at',
      'last_change_summary', 'consecutive_failures',
      'numeric_selector', 'numeric_unit', 'feed_token', 'feed_enabled'
    ];

    const setClauses = [];
    const params = [id];
    let pIdx = 2;

    for (const [key, val] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        params.push(val);
        setClauses.push(`${key} = $${pIdx++}`);
      }
    }

    if (setClauses.length === 0) {
      return this.findById(id, workspaceId);
    }

    setClauses.push('updated_at = NOW()');

    let query = `
      UPDATE monitors
      SET ${setClauses.join(', ')}
      WHERE id = $1
    `;

    if (workspaceId) {
      query += ` AND workspace_id = $${pIdx++}`;
      params.push(workspaceId);
    }

    query += ' RETURNING *';

    const res = await db.query(query, params);
    return res.rows[0] || null;
  },

  /**
   * Update status helper
   */
  async updateStatus(id, newStatus, previousStatus = null) {
    const res = await db.query(
      `UPDATE monitors
       SET status = $1, previous_status = COALESCE($2, status), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newStatus, previousStatus, id]
    );
    return res.rows[0] || null;
  },

  /**
   * Delete monitor
   */
  async delete(id, workspaceId = null) {
    let query = 'DELETE FROM monitors WHERE id = $1';
    const params = [id];
    if (workspaceId) {
      query += ' AND workspace_id = $2';
      params.push(workspaceId);
    }
    const res = await db.query(query, params);
    return res.rowCount > 0;
  },

  /**
   * Find monitor by valid unguessable feed token
   */
  async findByFeedToken(token) {
    if (!token || typeof token !== 'string') return null;
    const query = `
      SELECT m.*, ct.normalized_url
      FROM monitors m
      JOIN canonical_targets ct ON m.canonical_target_id = ct.id
      WHERE m.feed_token = $1 AND m.feed_enabled = true
    `;
    const res = await db.query(query, [token.trim()]);
    return res.rows[0] || null;
  },

  /**
   * Rotate feed token with fresh 256-bit cryptographically secure token
   */
  async rotateFeedToken(id, workspaceId = null) {
    const newToken = crypto.randomBytes(32).toString('hex');
    let query = `
      UPDATE monitors
      SET feed_token = $1, feed_enabled = true, updated_at = NOW()
      WHERE id = $2
    `;
    const params = [newToken, id];
    if (workspaceId) {
      query += ` AND workspace_id = $3`;
      params.push(workspaceId);
    }
    query += ' RETURNING *';
    const res = await db.query(query, params);
    return res.rows[0] || null;
  },

  /**
   * Revoke feed token
   */
  async revokeFeedToken(id, workspaceId = null) {
    let query = `
      UPDATE monitors
      SET feed_token = NULL, updated_at = NOW()
      WHERE id = $1
    `;
    const params = [id];
    if (workspaceId) {
      query += ` AND workspace_id = $2`;
      params.push(workspaceId);
    }
    query += ' RETURNING *';
    const res = await db.query(query, params);
    return res.rows[0] || null;
  }
};

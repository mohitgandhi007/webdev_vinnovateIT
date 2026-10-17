import { db } from '../config/database.js';

export const snapshotRepository = {
  /**
   * Insert a captured snapshot
   */
  async create({
    canonical_target_id,
    scan_number = 1,
    http_status_code = 200,
    response_time_ms = 0,
    text_content = '',
    text_hash,
    screenshot_path = null,
    screenshot_hash = null,
    dom_node_count = 0,
    status_category = 'NOMINAL_CLEAN'
  }) {
    const query = `
      INSERT INTO snapshots (
        canonical_target_id,
        scan_number,
        http_status_code,
        response_time_ms,
        text_content,
        text_hash,
        screenshot_path,
        screenshot_hash,
        dom_node_count,
        status_category
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const res = await db.query(query, [
      canonical_target_id,
      scan_number,
      http_status_code,
      response_time_ms,
      text_content,
      text_hash,
      screenshot_path,
      screenshot_hash,
      dom_node_count,
      status_category
    ]);
    return res.rows[0];
  },

  /**
   * Find snapshot by ID
   */
  async findById(id) {
    const query = `
      SELECT s.*, ct.normalized_url, ct.css_selector
      FROM snapshots s
      JOIN canonical_targets ct ON s.canonical_target_id = ct.id
      WHERE s.id = $1
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find snapshots for a specific monitor (via canonical_target_id)
   */
  async findByMonitorId(monitorId, { page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    
    // First verify monitor exists and get canonical_target_id
    const monitorRes = await db.query(
      'SELECT canonical_target_id FROM monitors WHERE id = $1',
      [monitorId]
    );
    if (!monitorRes.rows[0]) return null;

    const targetId = monitorRes.rows[0].canonical_target_id;

    const countRes = await db.query(
      'SELECT COUNT(*)::int AS total FROM snapshots WHERE canonical_target_id = $1',
      [targetId]
    );
    const total = countRes.rows[0]?.total || 0;

    const dataRes = await db.query(
      `SELECT * FROM snapshots 
       WHERE canonical_target_id = $1 
       ORDER BY captured_at DESC 
       LIMIT $2 OFFSET $3`,
      [targetId, limit, offset]
    );

    return {
      snapshots: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Get latest snapshot for a canonical target
   */
  async findLatestByCanonicalTargetId(canonicalTargetId) {
    const query = `
      SELECT * FROM snapshots
      WHERE canonical_target_id = $1
      ORDER BY captured_at DESC
      LIMIT 1
    `;
    const res = await db.query(query, [canonicalTargetId]);
    return res.rows[0] || null;
  }
};

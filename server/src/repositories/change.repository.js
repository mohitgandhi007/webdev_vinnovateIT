import { db } from '../config/database.js';

export const changeRepository = {
  /**
   * Insert a detected change
   */
  async create({
    monitor_id,
    baseline_snapshot_id,
    current_snapshot_id,
    change_type = 'content',
    title,
    description = '',
    dom_nodes_modified = 0,
    text_diff_json = null,
    visual_diff_percent = 0,
    diff_overlay_path = null,
    is_reviewed = false
  }) {
    const query = `
      INSERT INTO detected_changes (
        monitor_id,
        baseline_snapshot_id,
        current_snapshot_id,
        change_type,
        title,
        description,
        dom_nodes_modified,
        text_diff_json,
        visual_diff_percent,
        diff_overlay_path,
        is_reviewed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `;
    const res = await db.query(query, [
      monitor_id,
      baseline_snapshot_id,
      current_snapshot_id,
      change_type,
      title,
      description,
      dom_nodes_modified,
      text_diff_json ? JSON.stringify(text_diff_json) : null,
      visual_diff_percent,
      diff_overlay_path,
      is_reviewed
    ]);
    return res.rows[0];
  },

  /**
   * Find change by ID with monitor metadata
   */
  async findById(id) {
    const query = `
      SELECT 
        c.*,
        m.name AS monitor_name,
        m.url AS monitor_url,
        m.workspace_id,
        bs.captured_at AS baseline_captured_at,
        cs.captured_at AS current_captured_at,
        bs.screenshot_path AS baseline_screenshot_path,
        cs.screenshot_path AS current_screenshot_path
      FROM detected_changes c
      JOIN monitors m ON c.monitor_id = m.id
      JOIN snapshots bs ON c.baseline_snapshot_id = bs.id
      JOIN snapshots cs ON c.current_snapshot_id = cs.id
      WHERE c.id = $1
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find changes for a specific monitor
   */
  async findByMonitorId(monitorId, { page = 1, limit = 20, is_reviewed } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['c.monitor_id = $1'];
    const params = [monitorId];
    let paramIdx = 2;

    if (typeof is_reviewed === 'boolean') {
      conditions.push(`c.is_reviewed = $${paramIdx++}`);
      params.push(is_reviewed);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM detected_changes c WHERE ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const query = `
      SELECT 
        c.*,
        bs.captured_at AS baseline_captured_at,
        cs.captured_at AS current_captured_at
      FROM detected_changes c
      JOIN snapshots bs ON c.baseline_snapshot_id = bs.id
      JOIN snapshots cs ON c.current_snapshot_id = cs.id
      WHERE ${whereClause}
      ORDER BY c.detected_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(query, params);

    return {
      changes: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * List changes across all monitors with optional filters and pagination
   */
  async listAll({ monitor_id, is_reviewed, from_date, to_date, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (monitor_id) {
      conditions.push(`c.monitor_id = $${paramIdx++}`);
      params.push(monitor_id);
    }

    if (typeof is_reviewed === 'boolean') {
      conditions.push(`c.is_reviewed = $${paramIdx++}`);
      params.push(is_reviewed);
    }

    if (from_date) {
      conditions.push(`c.detected_at >= $${paramIdx++}`);
      params.push(from_date);
    }

    if (to_date) {
      conditions.push(`c.detected_at <= $${paramIdx++}`);
      params.push(to_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total FROM detected_changes c ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const query = `
      SELECT 
        c.*,
        m.name AS monitor_name,
        m.url AS monitor_url,
        bs.captured_at AS baseline_captured_at,
        cs.captured_at AS current_captured_at
      FROM detected_changes c
      JOIN monitors m ON c.monitor_id = m.id
      JOIN snapshots bs ON c.baseline_snapshot_id = bs.id
      JOIN snapshots cs ON c.current_snapshot_id = cs.id
      ${whereClause}
      ORDER BY c.detected_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(query, params);

    return {
      changes: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Update review status
   */
  async updateReviewStatus(id, isReviewed) {
    const query = `
      UPDATE detected_changes
      SET 
        is_reviewed = $1,
        reviewed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END
      WHERE id = $2
      RETURNING *
    `;
    const res = await db.query(query, [isReviewed, id]);
    return res.rows[0] || null;
  },


  /**
   * Get summary for a change, including any AI insight
   */
  async getSummary(id) {
    const query = `
      SELECT 
        c.id AS change_id,
        c.monitor_id,
        c.title,
        c.description,
        c.change_type,
        c.dom_nodes_modified,
        c.visual_diff_percent,
        c.detected_at,
        c.is_reviewed,
        ai.headline AS ai_headline,
        ai.category AS ai_category,
        ai.impact_level AS ai_impact_level,
        ai.business_inference AS ai_business_inference,
        ai.executive_summary AS ai_executive_summary
      FROM detected_changes c
      LEFT JOIN ai_insights ai ON ai.detected_change_id = c.id
      WHERE c.id = $1
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find changes for RSS feed with AI insights and snapshot timestamps
   */
  async findChangesForFeed(monitorId, limit = 50) {
    const query = `
      SELECT 
        c.id,
        c.monitor_id,
        c.change_type,
        c.title,
        c.description,
        c.dom_nodes_modified,
        c.visual_diff_percent,
        c.detected_at,
        c.baseline_snapshot_id,
        c.current_snapshot_id,
        bs.captured_at AS baseline_captured_at,
        cs.captured_at AS current_captured_at,
        ai.headline AS ai_headline,
        ai.executive_summary AS ai_summary,
        ai.impact_level AS ai_impact,
        ai.category AS ai_category
      FROM detected_changes c
      JOIN snapshots bs ON c.baseline_snapshot_id = bs.id
      JOIN snapshots cs ON c.current_snapshot_id = cs.id
      LEFT JOIN ai_insights ai ON ai.detected_change_id = c.id
      WHERE c.monitor_id = $1
      ORDER BY c.detected_at DESC
      LIMIT $2
    `;
    const res = await db.query(query, [monitorId, limit]);
    return res.rows;
  }
};

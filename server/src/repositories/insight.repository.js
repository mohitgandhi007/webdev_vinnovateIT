import { db } from '../config/database.js';

export const insightRepository = {
  /**
   * Upsert an AI intelligence record for a detected change
   */
  async upsert({
    detected_change_id,
    workspace_id,
    title,
    summary,
    category = 'content',
    importance = 'medium',
    evidence = [],
    status = 'success',
    model_version = 'gemini-2.5-flash',
    raw_response = null,
    error_message = null,
    headline = null,
    executive_summary = null,
    impact_level = null,
    observed_facts = null,
    business_inference = '',
    prompt_tokens = 0,
    completion_tokens = 0
  }) {
    const finalHeadline = headline || title || 'Observed Change';
    const finalTitle = title || headline || 'Observed Change';
    const finalSummary = summary || executive_summary || '';
    const finalExecSummary = executive_summary || summary || '';
    const finalImportance = importance || impact_level || 'medium';
    const finalImpactLevel = impact_level || importance || 'medium';
    const finalEvidence = Array.isArray(evidence) ? evidence : (observed_facts || []);
    const finalObservedFacts = Array.isArray(observed_facts) ? observed_facts : finalEvidence;

    const query = `
      INSERT INTO ai_insights (
        detected_change_id,
        workspace_id,
        title,
        summary,
        category,
        importance,
        evidence,
        status,
        model_version,
        raw_response,
        error_message,
        headline,
        executive_summary,
        impact_level,
        observed_facts,
        business_inference,
        prompt_tokens,
        completion_tokens
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (detected_change_id) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        category = EXCLUDED.category,
        importance = EXCLUDED.importance,
        evidence = EXCLUDED.evidence,
        status = EXCLUDED.status,
        model_version = EXCLUDED.model_version,
        raw_response = EXCLUDED.raw_response,
        error_message = EXCLUDED.error_message,
        headline = EXCLUDED.headline,
        executive_summary = EXCLUDED.executive_summary,
        impact_level = EXCLUDED.impact_level,
        observed_facts = EXCLUDED.observed_facts,
        created_at = NOW()
      RETURNING *
    `;

    const res = await db.query(query, [
      detected_change_id,
      workspace_id,
      finalTitle,
      finalSummary,
      category,
      finalImportance,
      JSON.stringify(finalEvidence),
      status,
      model_version,
      raw_response,
      error_message,
      finalHeadline,
      finalExecSummary,
      finalImpactLevel,
      JSON.stringify(finalObservedFacts),
      business_inference,
      prompt_tokens,
      completion_tokens
    ]);

    return res.rows[0];
  },

  /**
   * Alias create to upsert to prevent duplicate key errors on same change
   */
  async create(data) {
    return this.upsert(data);
  },

  /**
   * Find insight by ID
   */
  async findById(id) {
    const query = `
      SELECT 
        ai.*,
        c.title AS change_title,
        c.id AS change_id,
        c.baseline_snapshot_id,
        c.current_snapshot_id,
        c.monitor_id,
        c.text_diff_json,
        m.name AS monitor_name,
        m.url AS monitor_url
      FROM ai_insights ai
      JOIN detected_changes c ON ai.detected_change_id = c.id
      JOIN monitors m ON c.monitor_id = m.id
      WHERE ai.id = $1
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find insight by detected change ID
   */
  async findByChangeId(changeId) {
    const query = `
      SELECT 
        ai.*,
        c.title AS change_title,
        c.id AS change_id,
        c.baseline_snapshot_id,
        c.current_snapshot_id,
        c.monitor_id,
        c.text_diff_json,
        m.name AS monitor_name,
        m.url AS monitor_url
      FROM ai_insights ai
      JOIN detected_changes c ON ai.detected_change_id = c.id
      JOIN monitors m ON c.monitor_id = m.id
      WHERE ai.detected_change_id = $1
      ORDER BY ai.created_at DESC
      LIMIT 1
    `;
    const res = await db.query(query, [changeId]);
    return res.rows[0] || null;
  },

  /**
   * List insights for a workspace with pagination and filters
   */
  async findByWorkspaceId(workspaceId, {
    page = 1,
    limit = 20,
    category,
    importance,
    impact_level,
    monitor_id,
    status
  } = {}) {
    const offset = (page - 1) * limit;
    const conditions = ['ai.workspace_id = $1'];
    const params = [workspaceId];
    let paramIdx = 2;

    if (category) {
      conditions.push(`LOWER(ai.category) = LOWER($${paramIdx++})`);
      params.push(category);
    }
    const imp = importance || impact_level;
    if (imp) {
      conditions.push(`(LOWER(ai.importance) = LOWER($${paramIdx}) OR LOWER(ai.impact_level) = LOWER($${paramIdx}))`);
      params.push(imp);
      paramIdx++;
    }
    if (monitor_id) {
      conditions.push(`c.monitor_id = $${paramIdx++}`);
      params.push(monitor_id);
    }
    if (status) {
      conditions.push(`ai.status = $${paramIdx++}`);
      params.push(status);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total 
       FROM ai_insights ai 
       JOIN detected_changes c ON ai.detected_change_id = c.id
       WHERE ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total || 0;

    const query = `
      SELECT 
        ai.*,
        c.title AS change_title,
        c.id AS change_id,
        c.baseline_snapshot_id,
        c.current_snapshot_id,
        c.detected_at AS change_created_at,
        c.monitor_id,
        m.name AS monitor_name,
        m.url AS monitor_url
      FROM ai_insights ai
      JOIN detected_changes c ON ai.detected_change_id = c.id
      JOIN monitors m ON c.monitor_id = m.id
      WHERE ${whereClause}
      ORDER BY ai.created_at DESC
      LIMIT $${paramIdx++} OFFSET $${paramIdx++}
    `;
    params.push(limit, offset);

    const dataRes = await db.query(query, params);

    return {
      insights: dataRes.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
};

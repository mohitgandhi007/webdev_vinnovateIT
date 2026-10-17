import { db } from '../config/database.js';

export const destinationRepository = {
  /**
   * Create a new notification destination
   */
  async create({
    workspace_id,
    name,
    channel,
    target_destination,
    config = {},
    triggers = { on_change: true, on_high_importance: false, on_failure: false, keywords: [] },
    is_active = true
  }) {
    const query = `
      INSERT INTO notification_destinations (
        workspace_id,
        name,
        channel,
        target_destination,
        config,
        triggers,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    const res = await db.query(query, [
      workspace_id,
      name || `${channel.toUpperCase()} Alert`,
      channel,
      target_destination,
      JSON.stringify(config),
      JSON.stringify(triggers),
      is_active
    ]);
    return res.rows[0];
  },

  /**
   * Find destination by ID
   */
  async findById(id) {
    const query = 'SELECT * FROM notification_destinations WHERE id = $1';
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * List destinations for a workspace
   */
  async findByWorkspaceId(workspaceId, { is_active = null } = {}) {
    const conditions = ['workspace_id = $1'];
    const params = [workspaceId];

    if (typeof is_active === 'boolean') {
      conditions.push('is_active = $2');
      params.push(is_active);
    }

    const query = `
      SELECT * FROM notification_destinations
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;
    const res = await db.query(query, params);
    return res.rows;
  },

  /**
   * Update destination
   */
  async update(id, updates) {
    const allowed = ['name', 'target_destination', 'config', 'triggers', 'is_active'];
    const setClauses = [];
    const params = [id];
    let idx = 2;

    for (const [key, val] of Object.entries(updates)) {
      if (allowed.includes(key)) {
        setClauses.push(`${key} = $${idx++}`);
        params.push(typeof val === 'object' && val !== null ? JSON.stringify(val) : val);
      }
    }

    if (setClauses.length === 0) {
      return this.findById(id);
    }

    setClauses.push(`updated_at = NOW()`);

    const query = `
      UPDATE notification_destinations
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, params);
    return res.rows[0] || null;
  },

  /**
   * Delete destination
   */
  async delete(id) {
    const query = 'DELETE FROM notification_destinations WHERE id = $1 RETURNING id';
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  }
};

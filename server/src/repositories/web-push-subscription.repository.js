import { db } from '../config/database.js';

export const webPushSubscriptionRepository = {
  /**
   * Upsert a push subscription (idempotent for identical endpoints)
   */
  async upsert({
    workspaceId = null,
    endpoint,
    p256dh,
    auth,
    preferences = { notify_on_change: true, notify_on_failure: false, importance: 'all' },
    userAgent = null
  }) {
    const query = `
      INSERT INTO web_push_subscriptions (
        workspace_id,
        endpoint,
        p256dh,
        auth,
        preferences,
        user_agent,
        status,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())
      ON CONFLICT (endpoint) DO UPDATE SET
        workspace_id = COALESCE($1, web_push_subscriptions.workspace_id),
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        preferences = EXCLUDED.preferences,
        user_agent = COALESCE(EXCLUDED.user_agent, web_push_subscriptions.user_agent),
        status = 'active',
        failure_count = 0,
        failure_reason = NULL,
        updated_at = NOW()
      RETURNING *
    `;

    const res = await db.query(query, [
      workspaceId,
      endpoint,
      p256dh,
      auth,
      JSON.stringify(preferences),
      userAgent
    ]);
    return res.rows[0];
  },

  /**
   * Find subscription by ID
   */
  async findById(id) {
    const query = 'SELECT * FROM web_push_subscriptions WHERE id = $1';
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Find subscription by endpoint
   */
  async findByEndpoint(endpoint) {
    const query = 'SELECT * FROM web_push_subscriptions WHERE endpoint = $1';
    const res = await db.query(query, [endpoint]);
    return res.rows[0] || null;
  },

  /**
   * Find active subscriptions for a workspace (or all active if workspace is null)
   */
  async findActiveByWorkspace(workspaceId = null) {
    if (workspaceId) {
      const query = `
        SELECT * FROM web_push_subscriptions
        WHERE (workspace_id = $1 OR workspace_id IS NULL)
          AND status = 'active'
        ORDER BY created_at DESC
      `;
      const res = await db.query(query, [workspaceId]);
      return res.rows;
    }

    const query = `
      SELECT * FROM web_push_subscriptions
      WHERE status = 'active'
      ORDER BY created_at DESC
    `;
    const res = await db.query(query);
    return res.rows;
  },

  /**
   * Update subscription status (e.g. 'active', 'revoked', 'expired')
   */
  async updateStatus(id, status, { failureReason = null } = {}) {
    const query = `
      UPDATE web_push_subscriptions
      SET status = $2,
          failure_reason = COALESCE($3, failure_reason),
          failure_count = CASE WHEN $2 = 'expired' OR $2 = 'revoked' THEN failure_count + 1 ELSE failure_count END,
          last_failure_at = CASE WHEN $2 = 'expired' OR $2 = 'revoked' THEN NOW() ELSE last_failure_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, [id, status, failureReason]);
    return res.rows[0] || null;
  },

  /**
   * Update subscription status by endpoint
   */
  async updateStatusByEndpoint(endpoint, status, { failureReason = null } = {}) {
    const query = `
      UPDATE web_push_subscriptions
      SET status = $2,
          failure_reason = COALESCE($3, failure_reason),
          updated_at = NOW()
      WHERE endpoint = $1
      RETURNING *
    `;
    const res = await db.query(query, [endpoint, status, failureReason]);
    return res.rows[0] || null;
  },

  /**
   * Record successful delivery
   */
  async recordSuccess(id) {
    const query = `
      UPDATE web_push_subscriptions
      SET last_successful_delivery_at = NOW(),
          failure_count = 0,
          failure_reason = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, [id]);
    return res.rows[0] || null;
  },

  /**
   * Record delivery failure
   */
  async recordFailure(id, reason) {
    const query = `
      UPDATE web_push_subscriptions
      SET failure_count = failure_count + 1,
          failure_reason = $2,
          last_failure_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, [id, reason]);
    return res.rows[0] || null;
  },

  /**
   * Update user preferences
   */
  async updatePreferences(id, preferences) {
    const query = `
      UPDATE web_push_subscriptions
      SET preferences = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const res = await db.query(query, [id, JSON.stringify(preferences)]);
    return res.rows[0] || null;
  },

  /**
   * Delete subscription
   */
  async delete(id) {
    const query = 'DELETE FROM web_push_subscriptions WHERE id = $1 RETURNING id';
    const res = await db.query(query, [id]);
    return res.rowCount > 0;
  },

  /**
   * Sanitize subscription for public/frontend display (never leaks private keys or auth secret)
   */
  toPublic(sub) {
    if (!sub) return null;
    return {
      id: sub.id,
      workspaceId: sub.workspace_id,
      endpoint: sub.endpoint,
      status: sub.status,
      preferences: typeof sub.preferences === 'string' ? JSON.parse(sub.preferences) : (sub.preferences || {}),
      lastSuccessfulDeliveryAt: sub.last_successful_delivery_at,
      lastFailureAt: sub.last_failure_at,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at
    };
  }
};

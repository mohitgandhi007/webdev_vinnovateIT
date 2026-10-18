import { db } from '../config/database.js';
import { changeRepository } from '../repositories/change.repository.js';
import { monitorRepository } from '../repositories/monitor.repository.js';

export class ChangeServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ChangeServiceError';
    this.statusCode = statusCode;
  }
}

export const changeService = {
  /**
   * List changes across monitors with filters and pagination
   */
  async listChanges(filters = {}) {
    return await changeRepository.listAll(filters);
  },

  /**
   * Get detected changes for a monitor
   */
  async getChangesForMonitor(monitorId, { page = 1, limit = 20, is_reviewed } = {}, workspaceId = null) {
    const monitor = await monitorRepository.findById(monitorId);
    if (!monitor) {
      throw new ChangeServiceError('Monitor not found', 404);
    }
    if (workspaceId && monitor.workspace_id !== workspaceId) {
      throw new ChangeServiceError('Access denied to monitor changes', 403);
    }

    return await changeRepository.findByMonitorId(monitorId, { page, limit, is_reviewed });
  },


  /**
   * Get single change by ID (or latest change for monitor ID)
   */
  async getChangeById(id) {
    let change = await changeRepository.findById(id);
    if (!change) {
      change = await changeRepository.findLatestByMonitorId(id);
    }
    if (!change) {
      throw new ChangeServiceError('Change record not found', 404);
    }
    return change;
  },

  /**
   * Mark change as reviewed / unreviewed and sync monitor status
   */
  async updateReviewStatus(id, isReviewed) {
    // 1. Try finding by detected change ID
    const change = await changeRepository.findById(id);
    if (change) {
      const updated = await changeRepository.updateReviewStatus(id, isReviewed);
      const monitorId = change.monitor_id;
      if (monitorId) {
        if (isReviewed) {
          const remainingRes = await db.query(
            `SELECT COUNT(*)::int AS count FROM detected_changes WHERE monitor_id = $1 AND is_reviewed = false`,
            [monitorId]
          );
          const remainingUnreviewed = remainingRes.rows[0]?.count || 0;
          if (remainingUnreviewed === 0) {
            await db.query(
              `UPDATE monitors 
               SET is_reviewed = true, 
                   updated_at = NOW() 
               WHERE id = $1`,
              [monitorId]
            );
          }
        } else {
          await db.query(
            `UPDATE monitors 
             SET is_reviewed = false, 
                 updated_at = NOW() 
             WHERE id = $1`,
            [monitorId]
          );
        }
      }
      return updated;
    }

    // 2. Check if id is a monitor ID
    const monitor = await monitorRepository.findById(id);
    if (monitor) {
      const monitorId = monitor.id;
      await db.query(
        `UPDATE detected_changes 
         SET is_reviewed = $1, 
             reviewed_at = CASE WHEN $1 = true THEN NOW() ELSE NULL END 
         WHERE monitor_id = $2`,
        [isReviewed, monitorId]
      );

      const updatedMonRes = await db.query(
        `UPDATE monitors 
         SET is_reviewed = $1, 
             updated_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [isReviewed, monitorId]
      );

      const latestChange = await changeRepository.findLatestByMonitorId(monitorId);
      return latestChange || {
        id: monitorId,
        monitor_id: monitorId,
        is_reviewed: isReviewed,
        monitor: updatedMonRes.rows[0]
      };
    }

    throw new ChangeServiceError('Change record not found', 404);
  },

  /**
   * Get summary for a change
   */
  async getChangeSummary(id) {
    const summary = await changeRepository.getSummary(id);
    if (!summary) {
      throw new ChangeServiceError('Change record not found', 404);
    }
    return summary;
  }
};

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
   * Get single change by ID
   */
  async getChangeById(id) {
    const change = await changeRepository.findById(id);
    if (!change) {
      throw new ChangeServiceError('Change record not found', 404);
    }
    return change;
  },

  /**
   * Mark change as reviewed / unreviewed
   */
  async updateReviewStatus(id, isReviewed) {
    const change = await changeRepository.findById(id);
    if (!change) {
      throw new ChangeServiceError('Change record not found', 404);
    }

    const updated = await changeRepository.updateReviewStatus(id, isReviewed);
    return updated;
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

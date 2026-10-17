import { snapshotRepository } from '../repositories/snapshot.repository.js';
import { monitorRepository } from '../repositories/monitor.repository.js';

export class SnapshotServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'SnapshotServiceError';
    this.statusCode = statusCode;
  }
}

export const snapshotService = {
  /**
   * Get snapshots for a monitor
   */
  async getSnapshotsForMonitor(monitorId, { page = 1, limit = 20 } = {}, workspaceId = null) {
    const monitor = await monitorRepository.findById(monitorId);
    if (!monitor) {
      throw new SnapshotServiceError('Monitor not found', 404);
    }
    if (workspaceId && monitor.workspace_id !== workspaceId) {
      throw new SnapshotServiceError('Access denied to monitor snapshots', 403);
    }

    const result = await snapshotRepository.findByMonitorId(monitorId, { page, limit });
    return result;
  },

  /**
   * Get single snapshot by ID
   */
  async getSnapshotById(id) {
    const snapshot = await snapshotRepository.findById(id);
    if (!snapshot) {
      throw new SnapshotServiceError('Snapshot not found', 404);
    }
    return snapshot;
  }
};

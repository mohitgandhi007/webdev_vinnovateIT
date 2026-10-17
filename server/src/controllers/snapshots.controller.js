import path from 'node:path';
import { snapshotService } from '../services/snapshot.service.js';

export const snapshotsController = {
  /**
   * GET /api/snapshots/:id
   */
  async getSnapshotById(req, res, next) {
    try {
      const snapshot = await snapshotService.getSnapshotById(req.params.id);
      res.status(200).json({
        success: true,
        data: snapshot
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/snapshots/:id/screenshot
   */
  async getSnapshotScreenshot(req, res, next) {
    try {
      const snapshot = await snapshotService.getSnapshotById(req.params.id);
      if (!snapshot || !snapshot.screenshot_path) {
        return res.status(404).json({
          success: false,
          error: { message: 'Screenshot not found for this capture' }
        });
      }
      const uploadsBase = path.resolve(process.cwd(), 'uploads');
      const fullPath = path.resolve(process.cwd(), snapshot.screenshot_path.replace(/^\//, ''));
      
      // Strict path traversal defense: ensure file is strictly within the uploads directory
      if (!fullPath.startsWith(uploadsBase)) {
        return res.status(403).json({
          success: false,
          error: { message: 'Access denied: Path traversal detected' }
        });
      }

      res.sendFile(fullPath, (err) => {
        if (err) {
          if (!res.headersSent) {
            res.status(404).json({
              success: false,
              error: { message: 'Screenshot file not found on disk' }
            });
          }
        }
      });
    } catch (err) {
      next(err);
    }
  }
};


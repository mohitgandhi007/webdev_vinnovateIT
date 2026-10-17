import { changeService } from '../services/change.service.js';

export const changesController = {
  /**
   * GET /api/changes
   */
  async listChanges(req, res, next) {
    try {
      const result = await changeService.listChanges(req.query);
      res.status(200).json({
        success: true,
        data: result.changes,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/changes/:id
   */
  async getChangeById(req, res, next) {
    try {
      const change = await changeService.getChangeById(req.params.id);
      res.status(200).json({
        success: true,
        data: change
      });
    } catch (err) {
      next(err);
    }
  },


  /**
   * PATCH /api/changes/:id
   */
  async updateReviewStatus(req, res, next) {
    try {
      const updated = await changeService.updateReviewStatus(
        req.params.id,
        req.body.is_reviewed
      );
      res.status(200).json({
        success: true,
        message: `Change marked as ${req.body.is_reviewed ? 'reviewed' : 'unreviewed'}`,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/changes/:id/summary
   */
  async getChangeSummary(req, res, next) {
    try {
      const summary = await changeService.getChangeSummary(req.params.id);
      res.status(200).json({
        success: true,
        data: summary
      });
    } catch (err) {
      next(err);
    }
  }
};

import { insightService } from '../services/insight.service.js';

export const insightsController = {
  /**
   * GET /api/insights
   */
  async getInsights(req, res, next) {
    try {
      const result = await insightService.listInsights(req.query);
      res.status(200).json({
        success: true,
        data: result.insights,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/insights/:id
   */
  async getInsightById(req, res, next) {
    try {
      const insight = await insightService.getInsightById(req.params.id);
      res.status(200).json({
        success: true,
        data: insight
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/insights/generate/:changeId
   */
  async generateForChange(req, res, next) {
    try {
      const changeId = req.params.changeId;
      const insight = await insightService.generateInsightForChange(changeId, { force: false });
      res.status(200).json({
        success: true,
        data: insight
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/insights/retry/:changeId
   */
  async retryInsight(req, res, next) {
    try {
      const changeId = req.params.changeId;
      const insight = await insightService.retryInsight(changeId);
      res.status(200).json({
        success: true,
        data: insight
      });
    } catch (err) {
      next(err);
    }
  }
};

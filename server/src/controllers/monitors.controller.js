import { monitorService } from '../services/monitor.service.js';
import { snapshotService } from '../services/snapshot.service.js';
import { changeService } from '../services/change.service.js';
import { snapshotRepository } from '../repositories/snapshot.repository.js';
import { selectorInspector } from '../jobs/selector-inspector.js';
import { DiffEngine } from '../utils/diff-engine.js';
import { numericSeriesRepository } from '../repositories/numeric-series.repository.js';


export const monitorsController = {
  /**
   * GET /api/monitors
   */
  async getMonitors(req, res, next) {
    try {
      const result = await monitorService.listMonitors(req.query);
      res.status(200).json({
        success: true,
        data: result.monitors,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/monitors
   */
  async createMonitor(req, res, next) {
    try {
      const monitor = await monitorService.createMonitor(req.body);
      res.status(201).json({
        success: true,
        message: 'Monitor created successfully',
        data: monitor
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/monitors/:id
   */
  async getMonitorById(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const monitor = await monitorService.getMonitorById(req.params.id, workspaceId);
      res.status(200).json({
        success: true,
        data: monitor
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/monitors/:id
   */
  async updateMonitor(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const updated = await monitorService.updateMonitor(req.params.id, req.body, workspaceId);
      res.status(200).json({
        success: true,
        message: 'Monitor updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * DELETE /api/monitors/:id
   */
  async deleteMonitor(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      await monitorService.deleteMonitor(req.params.id, workspaceId);
      res.status(200).json({
        success: true,
        message: 'Monitor deleted successfully'
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/monitors/:id/check
   */
  async triggerCheck(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const result = await monitorService.triggerCheck(req.params.id, workspaceId);
      res.status(202).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/monitors/:id/snapshots
   */
  async getSnapshots(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const result = await snapshotService.getSnapshotsForMonitor(req.params.id, req.query, workspaceId);
      res.status(200).json({
        success: true,
        data: result.snapshots,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/monitors/:id/changes
   */
  async getChanges(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const result = await changeService.getChangesForMonitor(req.params.id, req.query, workspaceId);
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
   * POST /api/monitors/inspect-selectors
   * Safely inspects a page and extracts semantic CSS selector candidates
   */
  async inspectSelectors(req, res, next) {
    try {
      const result = await selectorInspector.inspectUrl(req.body.url);
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/monitors/:id/compare
   * Compares two snapshots or defaults to the latest vs baseline
   */
  async compareSnapshots(req, res, next) {
    try {
      const monitorId = req.params.id;
      const { baseline: baselineId, current: currentId } = req.query;

      const monitor = await monitorService.getMonitorById(monitorId);
      const snapshotList = await snapshotRepository.findByMonitorId(monitorId, { limit: 50 });
      const snaps = snapshotList?.snapshots || [];

      if (snaps.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            monitor,
            hasComparison: false,
            message: 'No snapshots captured yet for this monitor'
          }
        });
      }

      let baselineSnap = null;
      let currentSnap = null;

      if (baselineId && currentId) {
        baselineSnap = snaps.find(s => s.id === baselineId) || await snapshotRepository.findById(baselineId);
        currentSnap = snaps.find(s => s.id === currentId) || await snapshotRepository.findById(currentId);
      } else if (snaps.length === 1) {
        currentSnap = snaps[0];
        baselineSnap = snaps[0];
      } else {
        currentSnap = snaps[0];
        baselineSnap = snaps[1];
      }

      const diffResult = DiffEngine.compare(
        baselineSnap?.text_content || '',
        currentSnap?.text_content || '',
        {
          noiseOptions: {
            customPatterns: monitor.ignore_patterns || []
          }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          monitor,
          hasComparison: true,
          baseline: baselineSnap,
          current: currentSnap,
          diff: diffResult,
          timeline: snaps.map(s => ({
            id: s.id,
            scanNumber: s.scan_number,
            capturedAt: s.captured_at,
            httpStatusCode: s.http_status_code,
            hasScreenshot: Boolean(s.screenshot_path),
            screenshotPath: s.screenshot_path
          }))
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/monitors/:id/metrics
   * Time series data points for numerical value tracking
   */
  async getMetrics(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const monitor = await monitorService.getMonitorById(req.params.id, workspaceId);
      const points = await numericSeriesRepository.findByMonitorId(req.params.id, { limit: 100 });

      // Compute summary statistics deterministically without LLM
      const validPoints = points.filter(p => p.isValid && p.parsedValue !== null);
      let summary = null;

      if (validPoints.length > 0) {
        const values = validPoints.map(p => p.parsedValue);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const latest = values[values.length - 1];
        const initial = values[0];
        const totalDelta = +(latest - initial).toFixed(4);
        const totalPercent = initial !== 0 ? +((totalDelta / Math.abs(initial)) * 100).toFixed(2) : 0;

        summary = {
          count: validPoints.length,
          initialValue: initial,
          latestValue: latest,
          minValue: min,
          maxValue: max,
          min,
          max,
          totalDelta,
          totalPercent,
          unit: validPoints[validPoints.length - 1].unit || monitor.numeric_unit || null
        };
      }

      res.status(200).json({
        success: true,
        data: {
          monitorId: monitor.id,
          hasNumericTracking: Boolean(monitor.numeric_selector),
          numericSelector: monitor.numeric_selector,
          numericUnit: monitor.numeric_unit,
          summary,
          points
        }
      });
    } catch (err) {
      next(err);
    }
  }
};


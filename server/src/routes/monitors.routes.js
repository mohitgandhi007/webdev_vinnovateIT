import { Router } from 'express';
import { monitorsController } from '../controllers/monitors.controller.js';
import { rssController } from '../controllers/rss.controller.js';
import { validateRequest } from '../middleware/request-validation.js';
import {
  uuidParamSchema,
  paginationQuerySchema,
  createMonitorSchema,
  updateMonitorSchema,
  inspectSelectorSchema
} from '../validators/monitor.validator.js';
import { changeQuerySchema } from '../validators/change.validator.js';
import {
  monitorCreationLimiter,
  manualCheckLimiter,
  inspectSelectorLimiter
} from '../middleware/rate-limiter.js';

const router = Router();

// Inspect page to extract candidate CSS selectors
router.post(
  '/inspect-selectors',
  inspectSelectorLimiter,
  validateRequest({ body: inspectSelectorSchema }),
  monitorsController.inspectSelectors
);

// List monitors
router.get(
  '/',
  validateRequest({ query: paginationQuerySchema }),
  monitorsController.getMonitors
);

// Create monitor
router.post(
  '/',
  monitorCreationLimiter,
  validateRequest({ body: createMonitorSchema }),
  monitorsController.createMonitor
);

// Compare snapshots for a monitor
router.get(
  '/:id/compare',
  validateRequest({ params: uuidParamSchema }),
  monitorsController.compareSnapshots
);

// Get single monitor
router.get(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  monitorsController.getMonitorById
);

// Update monitor
router.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateMonitorSchema }),
  monitorsController.updateMonitor
);

// Delete monitor
router.delete(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  monitorsController.deleteMonitor
);

// Trigger on-demand check
router.post(
  '/:id/check',
  manualCheckLimiter,
  validateRequest({ params: uuidParamSchema }),
  monitorsController.triggerCheck
);

// Get snapshots for monitor
router.get(
  '/:id/snapshots',
  validateRequest({ params: uuidParamSchema }),
  monitorsController.getSnapshots
);

// Get changes for monitor
router.get(
  '/:id/changes',
  validateRequest({ params: uuidParamSchema, query: changeQuerySchema }),
  monitorsController.getChanges
);

// Get numerical tracking time series for monitor
router.get(
  '/:id/metrics',
  validateRequest({ params: uuidParamSchema }),
  monitorsController.getMetrics
);

// RSS 2.0 Change Feed for a monitor
router.get(
  '/:id/rss.xml',
  validateRequest({ params: uuidParamSchema }),
  rssController.getFeed
);
router.get(
  '/:id/feed.xml',
  validateRequest({ params: uuidParamSchema }),
  rssController.getFeed
);

// Feed token management (Authenticated)
router.get(
  '/:id/feed-token',
  validateRequest({ params: uuidParamSchema }),
  rssController.getFeedMeta
);
router.post(
  '/:id/feed-token/rotate',
  validateRequest({ params: uuidParamSchema }),
  rssController.rotateToken
);
router.delete(
  '/:id/feed-token',
  validateRequest({ params: uuidParamSchema }),
  rssController.revokeToken
);

export default router;

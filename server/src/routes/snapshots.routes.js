import { Router } from 'express';
import { snapshotsController } from '../controllers/snapshots.controller.js';
import { validateRequest } from '../middleware/request-validation.js';
import { uuidParamSchema } from '../validators/monitor.validator.js';

const router = Router();

// Get single snapshot
router.get(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  snapshotsController.getSnapshotById
);

// Stream screenshot image
router.get(
  '/:id/screenshot',
  validateRequest({ params: uuidParamSchema }),
  snapshotsController.getSnapshotScreenshot
);

export default router;

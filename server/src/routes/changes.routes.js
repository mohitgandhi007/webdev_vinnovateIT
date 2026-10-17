import { Router } from 'express';
import { changesController } from '../controllers/changes.controller.js';
import { validateRequest } from '../middleware/request-validation.js';
import { uuidParamSchema } from '../validators/monitor.validator.js';
import { updateChangeReviewSchema, changeQuerySchema } from '../validators/change.validator.js';

const router = Router();

// List all changes across monitors with filters
router.get(
  '/',
  validateRequest({ query: changeQuerySchema }),
  changesController.listChanges
);

// Get single change details
router.get(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  changesController.getChangeById
);


// Update review status
router.patch(
  '/:id',
  validateRequest({ params: uuidParamSchema, body: updateChangeReviewSchema }),
  changesController.updateReviewStatus
);

// Get summary for change
router.get(
  '/:id/summary',
  validateRequest({ params: uuidParamSchema }),
  changesController.getChangeSummary
);

export default router;

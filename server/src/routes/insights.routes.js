import { Router } from 'express';
import { insightsController } from '../controllers/insights.controller.js';
import { validateRequest } from '../middleware/request-validation.js';
import { uuidParamSchema } from '../validators/monitor.validator.js';
import { z } from 'zod';

const router = Router();

const changeIdParamSchema = z.object({
  changeId: z.string().uuid({ message: 'Must be a valid UUID' })
});

// List intelligence dispatches
router.get('/', insightsController.getInsights);

// Get single dispatch by ID
router.get(
  '/:id',
  validateRequest({ params: uuidParamSchema }),
  insightsController.getInsightById
);

// Generate insight for a detected change
router.post(
  '/generate/:changeId',
  validateRequest({ params: changeIdParamSchema }),
  insightsController.generateForChange
);

import { aiRetryLimiter } from '../middleware/rate-limiter.js';

// Controlled retry for an insight by change ID
router.post(
  '/retry/:changeId',
  aiRetryLimiter,
  validateRequest({ params: changeIdParamSchema }),
  insightsController.retryInsight
);

export default router;

import { Router } from 'express';
import { notificationsController } from '../controllers/notifications.controller.js';
import { validateRequest } from '../middleware/request-validation.js';
import { uuidParamSchema } from '../validators/monitor.validator.js';
import { createDestinationSchema, updateDestinationSchema } from '../validators/notification.validator.js';

const router = Router();

// Destinations
router.get('/destinations', notificationsController.listDestinations);

router.post(
  '/destinations',
  validateRequest({ body: createDestinationSchema }),
  notificationsController.createDestination
);

router.get(
  '/destinations/:id',
  validateRequest({ params: uuidParamSchema }),
  notificationsController.getDestinationById
);

router.patch(
  '/destinations/:id',
  validateRequest({ params: uuidParamSchema, body: updateDestinationSchema }),
  notificationsController.updateDestination
);

router.delete(
  '/destinations/:id',
  validateRequest({ params: uuidParamSchema }),
  notificationsController.deleteDestination
);

import { notificationTestLimiter } from '../middleware/rate-limiter.js';

router.post(
  '/destinations/:id/test',
  notificationTestLimiter,
  validateRequest({ params: uuidParamSchema }),
  notificationsController.testDestination
);

// Deliveries
router.get('/deliveries', notificationsController.listDeliveries);

router.post(
  '/deliveries/:id/retry',
  validateRequest({ params: uuidParamSchema }),
  notificationsController.retryDelivery
);

export default router;

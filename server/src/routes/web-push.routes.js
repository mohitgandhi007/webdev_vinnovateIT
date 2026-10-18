import { Router } from 'express';
import { webPushController } from '../controllers/web-push.controller.js';
import { notificationTestLimiter } from '../middleware/rate-limiter.js';

const router = Router();

// VAPID public key & status
router.get('/public-key', webPushController.getPublicKey);
router.get('/status', webPushController.getStatus);

// Subscription management
router.post('/subscribe', webPushController.subscribe);
router.post('/unsubscribe', webPushController.unsubscribe);
router.patch('/preferences', webPushController.updatePreferences);

// Immediate test notification (rate-limited)
router.post('/test', notificationTestLimiter, webPushController.sendTest);

export default router;

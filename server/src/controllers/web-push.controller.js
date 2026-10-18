import { webPushService } from '../services/notifications/web-push.service.js';
import { webPushSubscriptionRepository } from '../repositories/web-push-subscription.repository.js';
import {
  subscribeWebPushSchema,
  unsubscribeWebPushSchema,
  updateWebPushPreferencesSchema
} from '../validators/web-push.validator.js';

export const webPushController = {
  /**
   * GET /api/notifications/push/public-key
   * Retrieve the server's VAPID public key
   */
  async getPublicKey(req, res, next) {
    try {
      const data = webPushService.getPublicKey();
      res.json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/notifications/push/status
   * Retrieve subscription readiness and active device count
   */
  async getStatus(req, res, next) {
    try {
      const workspaceId = req.headers['x-workspace-id'] || null;
      const endpoint = req.query.endpoint ? String(req.query.endpoint) : null;
      const activeSubs = await webPushSubscriptionRepository.findActiveByWorkspace(workspaceId);
      const { configured, publicKey } = webPushService.getPublicKey();

      let targetSub = null;
      if (endpoint) {
        targetSub = await webPushSubscriptionRepository.findByEndpoint(endpoint);
      }

      res.json({
        success: true,
        data: {
          configured,
          publicKey: configured ? publicKey : null,
          activeSubscriptionsCount: activeSubs.length,
          isSubscribed: targetSub ? targetSub.status === 'active' : undefined,
          subscription: targetSub ? webPushSubscriptionRepository.toPublic(targetSub) : null
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/push/subscribe
   * Register a new browser push subscription
   */
  async subscribe(req, res, next) {
    try {
      const parsed = subscribeWebPushSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
            details: parsed.error.errors
          }
        });
      }

      const workspaceId = req.headers['x-workspace-id'] || null;
      const userAgent = req.headers['user-agent'] || parsed.data.userAgent || null;

      const { subscription, isNew } = await webPushService.registerSubscription({
        workspaceId,
        subscription: {
          endpoint: parsed.data.endpoint,
          keys: parsed.data.keys
        },
        preferences: parsed.data.preferences,
        userAgent
      });

      res.status(isNew ? 201 : 200).json({
        success: true,
        data: subscription
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/push/unsubscribe
   * Deactivate a browser push subscription
   */
  async unsubscribe(req, res, next) {
    try {
      const parsed = unsubscribeWebPushSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Invalid unsubscribe payload'
          }
        });
      }

      await webPushService.unsubscribe({
        endpoint: parsed.data.endpoint,
        id: parsed.data.id
      });

      res.json({
        success: true,
        message: 'Browser push notifications successfully disabled'
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * PATCH /api/notifications/push/preferences
   * Update notification preferences
   */
  async updatePreferences(req, res, next) {
    try {
      const parsed = updateWebPushPreferencesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message || 'Invalid preferences payload'
          }
        });
      }

      const updated = await webPushService.updatePreferences({
        id: parsed.data.id,
        preferences: parsed.data.preferences
      });

      res.json({
        success: true,
        data: updated
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/notifications/push/test
   * Trigger immediate test notification to a registered subscription
   */
  async sendTest(req, res, next) {
    try {
      const { id, endpoint } = req.body;
      if (!id && !endpoint) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Either subscription id or endpoint is required to send a test push'
          }
        });
      }

      const result = await webPushService.sendTestNotification({ id, endpoint });
      res.json({
        success: true,
        message: 'Test notification delivered successfully to browser'
      });
    } catch (err) {
      if (err.message === 'Subscription not found') {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Subscription not found'
          }
        });
      }
      res.status(502).json({
        success: false,
        error: {
          code: 'PUSH_DELIVERY_FAILED',
          message: err.message || 'Failed to deliver test push notification'
        }
      });
    }
  }
};

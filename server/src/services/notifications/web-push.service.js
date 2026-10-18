import { webPushSubscriptionRepository } from '../../repositories/web-push-subscription.repository.js';
import { deliveryRepository } from '../../repositories/delivery.repository.js';
import { WebPushProvider } from './providers/web-push.provider.js';
import { config } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class WebPushService {
  constructor(provider = null) {
    this.provider = provider || new WebPushProvider();
  }

  /**
   * Override provider instance (e.g. for testing with mocks)
   */
  setProvider(provider) {
    this.provider = provider;
  }

  /**
   * Return server's public VAPID key for client pushManager subscription
   */
  getPublicKey() {
    return {
      publicKey: config.vapidPublicKey,
      configured: Boolean(config.vapidPublicKey && config.vapidPrivateKey)
    };
  }

  /**
   * Register or reactivate a client browser push subscription
   */
  async registerSubscription({
    workspaceId = null,
    subscription,
    preferences = { notify_on_change: true, notify_on_failure: false, importance: 'all' },
    userAgent = null
  }) {
    if (!subscription || !subscription.endpoint) {
      throw new Error('Push subscription requires a valid endpoint URL');
    }

    try {
      const parsedUrl = new URL(subscription.endpoint);
      const isHttps = parsedUrl.protocol === 'https:';
      const isLocalhost = parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1';
      if (!isHttps && !isLocalhost) {
        throw new Error('Subscription endpoint must use HTTPS (or HTTP for localhost)');
      }
    } catch {
      throw new Error('Invalid endpoint URL structure');
    }

    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!p256dh || !auth) {
      throw new Error('Subscription requires public encryption key (p256dh) and authentication secret (auth)');
    }

    const normalizedPrefs = {
      notify_on_change: preferences?.notify_on_change ?? true,
      notify_on_failure: preferences?.notify_on_failure ?? false,
      importance: preferences?.importance || 'all'
    };

    const existing = await webPushSubscriptionRepository.findByEndpoint(subscription.endpoint);
    const isNew = !existing;

    const saved = await webPushSubscriptionRepository.upsert({
      workspaceId,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      preferences: normalizedPrefs,
      userAgent
    });

    logger.info('Registered browser web push subscription', {
      subscriptionId: saved.id,
      workspaceId: saved.workspace_id,
      endpointHost: new URL(saved.endpoint).hostname,
      isNew
    });

    return {
      subscription: webPushSubscriptionRepository.toPublic(saved),
      isNew
    };
  }

  /**
   * Deactivate a browser push subscription
   */
  async unsubscribe({ endpoint = null, id = null }) {
    if (!endpoint && !id) {
      throw new Error('Either subscription id or endpoint is required to unsubscribe');
    }

    let updated = null;
    if (id) {
      updated = await webPushSubscriptionRepository.updateStatus(id, 'revoked');
    } else {
      updated = await webPushSubscriptionRepository.updateStatusByEndpoint(endpoint, 'revoked');
    }

    if (updated) {
      logger.info('Deactivated browser web push subscription', { id: updated.id });
    }
    return { success: true };
  }

  /**
   * Update notification preferences for a subscription
   */
  async updatePreferences({ id, preferences }) {
    const updated = await webPushSubscriptionRepository.updatePreferences(id, preferences);
    return webPushSubscriptionRepository.toPublic(updated);
  }

  /**
   * Send an immediate test notification to a subscription
   */
  async sendTestNotification({ id = null, endpoint = null }) {
    let sub = null;
    if (id) {
      sub = await webPushSubscriptionRepository.findById(id);
    } else if (endpoint) {
      sub = await webPushSubscriptionRepository.findByEndpoint(endpoint);
    }

    if (!sub) {
      throw new Error('Subscription not found');
    }

    const testPayload = {
      title: 'PagePulse — Test Notification',
      summary: 'Observatory link verified. Real-time change dispatches are active.',
      monitorName: 'PagePulse Observatory',
      importance: 'medium',
      compareUrl: '/monitors',
      isFailure: false
    };

    const res = await this.provider.send({
      subscription: sub,
      payload: testPayload,
      isTest: true
    });

    if (!res.success) {
      if (res.expired) {
        await webPushSubscriptionRepository.updateStatus(sub.id, 'expired', { failureReason: res.error });
      }
      throw new Error(res.error || 'Failed to deliver test push notification');
    }

    await webPushSubscriptionRepository.recordSuccess(sub.id);
    return { success: true };
  }

  /**
   * Dispatch Web Push notifications for detected content change
   * Only sends after:
   * 1. Successful capture
   * 2. Meaningful change detected
   * 3. Change persisted
   * 4. Suppressed for baselines, unchanged pages, or failed captures
   */
  async dispatchForChange({
    changeRecord,
    monitor,
    baselineSnapshot = null,
    currentSnapshot = null,
    insight = null
  }) {
    if (!changeRecord || !monitor) return [];

    // Safety checks: suppress notifications for initial baseline or empty changes
    if (!baselineSnapshot || !currentSnapshot) {
      return [];
    }

    const workspaceId = monitor.workspace_id;
    const subscriptions = await webPushSubscriptionRepository.findActiveByWorkspace(workspaceId);

    if (subscriptions.length === 0) {
      return [];
    }

    // Format concise notification summary (works deterministically even if Gemini is unavailable)
    let title = changeRecord.title || `Change Detected: ${monitor.name}`;
    let summary = changeRecord.description || 'A content alteration was detected.';

    if (insight?.headline) {
      title = insight.headline;
      summary = insight.executive_summary || insight.headline;
    } else if (changeRecord.title) {
      title = `PagePulse — ${changeRecord.title}`;
    } else {
      title = 'PagePulse — Change detected';
      summary = `${monitor.name}: Content modified.`;
    }

    const importance = insight?.impact_level || 'medium';

    const payload = {
      title,
      summary,
      monitorName: monitor.name,
      monitorId: monitor.id,
      changeId: changeRecord.id,
      importance,
      compareUrl: `/compare/${monitor.id}?changeId=${changeRecord.id}`,
      isFailure: false
    };

    const results = [];

    for (const sub of subscriptions) {
      const prefs = typeof sub.preferences === 'string' ? JSON.parse(sub.preferences) : (sub.preferences || {});
      
      // Respect user notification preferences
      if (prefs.notify_on_change === false) {
        continue;
      }
      if (prefs.importance === 'high' && importance !== 'high') {
        continue;
      }

      // Idempotency / deduplication key based on change record and subscription
      const dedupKey = `push:${sub.id}:${changeRecord.id}`;
      const existing = await deliveryRepository.findByDedupKey(dedupKey);
      if (existing && (existing.status === 'delivered' || existing.status === 'pending')) {
        continue;
      }

      try {
        const res = await this.provider.send({
          subscription: sub,
          payload,
          isTest: false
        });

        if (res.success) {
          await webPushSubscriptionRepository.recordSuccess(sub.id);

          await deliveryRepository.create({
            destination_id: null,
            detected_change_id: changeRecord.id,
            monitor_id: monitor.id,
            dedup_key: dedupKey,
            trigger_type: 'webpush_change',
            payload,
            status: 'delivered',
            http_status_code: res.statusCode || 201
          });

          results.push({ subscriptionId: sub.id, success: true });
        } else {
          if (res.expired) {
            await webPushSubscriptionRepository.updateStatus(sub.id, 'expired', { failureReason: res.error });
          } else {
            await webPushSubscriptionRepository.recordFailure(sub.id, res.error);
          }

          await deliveryRepository.create({
            destination_id: null,
            detected_change_id: changeRecord.id,
            monitor_id: monitor.id,
            dedup_key: dedupKey,
            trigger_type: 'webpush_change',
            payload,
            status: 'failed',
            http_status_code: res.statusCode || 500,
            error_message: res.error
          });

          results.push({ subscriptionId: sub.id, success: false, error: res.error, expired: res.expired });
        }
      } catch (err) {
        logger.error(`Unexpected error during push dispatch to subscription ${sub.id}:`, { error: err.message });
      }
    }

    return results;
  }

  /**
   * Dispatch Web Push notifications for consecutive monitoring failures
   */
  async dispatchForFailure({ monitor, consecutiveFailures, error }) {
    if (!monitor) return [];

    const workspaceId = monitor.workspace_id;
    const subscriptions = await webPushSubscriptionRepository.findActiveByWorkspace(workspaceId);

    if (subscriptions.length === 0) return [];

    const payload = {
      title: 'PagePulse — Monitoring Alert',
      summary: `${monitor.name}: ${consecutiveFailures} consecutive failure(s). ${error || 'Target unreachable'}`,
      monitorName: monitor.name,
      monitorId: monitor.id,
      importance: 'high',
      compareUrl: `/monitors`,
      isFailure: true
    };

    const results = [];

    for (const sub of subscriptions) {
      const prefs = typeof sub.preferences === 'string' ? JSON.parse(sub.preferences) : (sub.preferences || {});
      if (!prefs.notify_on_failure) {
        continue;
      }

      const dedupKey = `push:${sub.id}:failure_${monitor.id}_streak_${consecutiveFailures}`;
      const existing = await deliveryRepository.findByDedupKey(dedupKey);
      if (existing && (existing.status === 'delivered' || existing.status === 'pending')) {
        continue;
      }

      try {
        const res = await this.provider.send({
          subscription: sub,
          payload,
          isTest: false
        });

        if (res.success) {
          await webPushSubscriptionRepository.recordSuccess(sub.id);
          results.push({ subscriptionId: sub.id, success: true });
        } else {
          if (res.expired) {
            await webPushSubscriptionRepository.updateStatus(sub.id, 'expired', { failureReason: res.error });
          }
          results.push({ subscriptionId: sub.id, success: false, error: res.error });
        }
      } catch (err) {
        logger.error(`Error sending push failure notification:`, { error: err.message });
      }
    }

    return results;
  }
}

export const webPushService = new WebPushService();

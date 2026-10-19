import webpush from 'web-push';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

export class WebPushProvider {
  constructor(customWebPush = null, customConfig = null) {
    this.name = 'webpush';
    this.webpush = customWebPush || webpush;
    const activeConfig = customConfig || config;

    this.vapidPublicKey = activeConfig.vapidPublicKey || '';
    this.vapidPrivateKey = activeConfig.vapidPrivateKey || '';
    this.vapidSubject = activeConfig.vapidSubject || 'mailto:alerts@pagepulse.app';

    if (this.vapidPublicKey && this.vapidPrivateKey) {
      try {
        this.webpush.setVapidDetails(
          this.vapidSubject,
          this.vapidPublicKey,
          this.vapidPrivateKey
        );
      } catch (err) {
        logger.warn('Failed to configure VAPID details for WebPushProvider:', { error: err.message });
      }
    }
  }

  /**
   * Check if VAPID credentials are ready
   */
  isConfigured() {
    return Boolean(this.vapidPublicKey && this.vapidPrivateKey);
  }

  /**
   * Format safe relative URL (strict protection against open redirects)
   */
  sanitizeTargetUrl(url, monitorId = null) {
    if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\')) {
      return url;
    }
    if (monitorId) {
      return `/compare/${monitorId}`;
    }
    return '/monitors';
  }

  sanitizeCompareUrl(url, monitorId = null) {
    return this.sanitizeTargetUrl(url, monitorId);
  }

  /**
   * Deliver Web Push notification
   */
  async send({ subscription, payload, isTest = false }) {
    if (!subscription || !subscription.endpoint || !subscription.p256dh || !subscription.auth) {
      return {
        success: false,
        statusCode: 400,
        error: 'Invalid push subscription details (missing endpoint or keys)',
        isRetryable: false,
        expired: false
      };
    }

    if (!this.isConfigured()) {
      return {
        success: false,
        statusCode: 503,
        error: 'Web Push is unconfigured: VAPID keys are missing on the server',
        isRetryable: false,
        expired: false
      };
    }

    const {
      title = 'PagePulse — Change detected',
      summary = 'A meaningful change was detected.',
      monitorName = 'Monitored Target',
      monitorId = null,
      changeId = null,
      importance = 'medium',
      compareUrl = null,
      isFailure = false
    } = payload;

    const safeUrl = this.sanitizeTargetUrl(compareUrl, monitorId);

    const notificationPayload = JSON.stringify({
      title: isTest ? 'PagePulse — Test Notification' : (title || 'PagePulse — Change detected'),
      body: summary,
      icon: '/icon.svg',
      badge: '/icon.svg',
      tag: isTest ? 'test-notification' : `pagepulse-${monitorId || 'change'}`,
      renotify: true,
      data: {
        url: safeUrl,
        monitorId,
        changeId,
        importance,
        isFailure,
        timestamp: new Date().toISOString()
      }
    });

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };

    try {
      const res = await this.webpush.sendNotification(pushSubscription, notificationPayload, {
        TTL: 86400,
        urgency: importance === 'high' ? 'high' : 'normal'
      });

      return {
        success: true,
        statusCode: res?.statusCode || 201
      };
    } catch (err) {
      const statusCode = err.statusCode || 500;
      const isExpired = statusCode === 404 || statusCode === 410;
      const isRetryable = statusCode === 429 || statusCode >= 500;

      // Log failure with redacted auth credentials
      logger.warn(`Web push delivery failed [HTTP ${statusCode}]`, {
        statusCode,
        isExpired,
        isRetryable,
        endpointHost: (() => {
          try { return new URL(subscription.endpoint).hostname; } catch { return 'invalid-url'; }
        })(),
        error: err.message
      });

      return {
        success: false,
        statusCode,
        error: err.message || `Push service error (HTTP ${statusCode})`,
        expired: isExpired,
        isRetryable
      };
    }
  }
}

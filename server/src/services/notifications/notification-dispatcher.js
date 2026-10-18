import { destinationRepository } from '../../repositories/destination.repository.js';
import { deliveryRepository } from '../../repositories/delivery.repository.js';
import { NotificationRuleEvaluator } from './rule-evaluator.js';
import { DiscordProvider } from './providers/discord.provider.js';
import { TelegramProvider } from './providers/telegram.provider.js';
import { EmailProvider } from './providers/email.provider.js';
import { WebPushProvider } from './providers/web-push.provider.js';
import { webPushService } from './web-push.service.js';
import { logger } from '../../utils/logger.js';

export class NotificationDispatcher {
  constructor(providers = {}) {
    this.providers = {
      discord: providers.discord || new DiscordProvider(),
      telegram: providers.telegram || new TelegramProvider(),
      email: providers.email || new EmailProvider(),
      webpush: providers.webpush || new WebPushProvider()
    };
    if (providers.webpush) {
      webPushService.setProvider(providers.webpush);
    }
  }

  /**
   * Register or override a provider (useful for unit testing with mocks)
   */
  setProvider(channel, providerInstance) {
    this.providers[channel] = providerInstance;
    if (channel === 'webpush') {
      webPushService.setProvider(providerInstance);
    }
  }

  /**
   * Dispatch notifications for a detected content change
   */
  async dispatchForChange({
    changeRecord,
    monitor,
    baselineSnapshot = null,
    currentSnapshot = null,
    insight = null
  }) {
    if (!changeRecord || !monitor) return [];

    const workspaceId = monitor.workspace_id;
    const destinations = await destinationRepository.findByWorkspaceId(workspaceId, { is_active: true });

    if (destinations.length === 0) return [];

    const results = [];

    const event = {
      type: 'change',
      hasChanged: true,
      importance: insight?.importance || 'medium',
      previousText: baselineSnapshot?.text_content || '',
      currentText: currentSnapshot?.text_content || '',
      changeRecord,
      monitor
    };

    for (const destination of destinations) {
      try {
        const evaluation = NotificationRuleEvaluator.evaluate(destination, event);

        if (!evaluation.shouldNotify) {
          continue;
        }

        // Generate stable deduplication key
        const dedupKey = `${destination.id}:${changeRecord.id}:${evaluation.triggerType}`;

        // Check if already delivered
        const existing = await deliveryRepository.findByDedupKey(dedupKey);
        if (existing && (existing.status === 'delivered' || existing.status === 'pending')) {
          continue;
        }

        // Format message payload
        let title = changeRecord.title || `Content Alteration on ${monitor.name}`;
        let summary = changeRecord.description || 'A change was detected.';

        if (evaluation.triggerType === 'keyword' && evaluation.keywordMatches?.length > 0) {
          title = `Keyword Alert: "${evaluation.keywordMatches[0].keyword}" on ${monitor.name}`;
          summary = evaluation.reasons.join('\n');
        } else if (insight?.title) {
          title = insight.title;
          summary = insight.summary || summary;
        }

        const payload = {
          title,
          summary,
          monitorName: monitor.name,
          monitorUrl: monitor.url,
          changeId: changeRecord.id,
          importance: insight?.importance || 'medium',
          category: insight?.category || 'content',
          evidence: insight?.evidence || [],
          isFailure: false,
          compareUrl: `http://localhost:5173/compare/${monitor.id}`
        };

        const delivery = await this.deliver({
          destination,
          payload,
          dedupKey,
          triggerType: evaluation.triggerType,
          changeId: changeRecord.id,
          monitorId: monitor.id
        });

        results.push(delivery);
      } catch (err) {
        logger.error(`Failed to dispatch notification to destination ${destination.id}:`, {
          error: err.message,
          channel: destination.channel
        });
      }
    }

    // Dispatch to registered browser Web Push subscriptions
    try {
      const pushResults = await webPushService.dispatchForChange({
        changeRecord,
        monitor,
        baselineSnapshot,
        currentSnapshot,
        insight
      });
      if (pushResults && pushResults.length > 0) {
        results.push(...pushResults);
      }
    } catch (pushErr) {
      logger.error('Failed to dispatch web push notifications for change:', { error: pushErr.message });
    }

    return results;
  }

  /**
   * Dispatch notifications for persistent monitor failure
   */
  async dispatchForFailure({ monitor, consecutiveFailures, error }) {
    if (!monitor) return [];

    const workspaceId = monitor.workspace_id;
    const destinations = await destinationRepository.findByWorkspaceId(workspaceId, { is_active: true });

    const results = [];

    if (destinations.length > 0) {
      const event = {
        type: 'failure',
        consecutiveFailures,
        monitor
      };

      for (const destination of destinations) {
        try {
          const evaluation = NotificationRuleEvaluator.evaluate(destination, event);

          if (!evaluation.shouldNotify) {
            continue;
          }

          // Deduplication key per failure streak
          const dedupKey = `${destination.id}:failure_${monitor.id}_streak_${consecutiveFailures}:failure`;

          const existing = await deliveryRepository.findByDedupKey(dedupKey);
          if (existing && (existing.status === 'delivered' || existing.status === 'pending')) {
            continue;
          }

          const payload = {
            title: `Degraded Monitor: ${monitor.name}`,
            summary: `The monitor has failed ${consecutiveFailures} consecutive checks. Error: ${error?.message || 'Page load failure'}.`,
            monitorName: monitor.name,
            monitorUrl: monitor.url,
            importance: 'high',
            isFailure: true,
            compareUrl: `http://localhost:5173/monitors`
          };

          const delivery = await this.deliver({
            destination,
            payload,
            dedupKey,
            triggerType: 'failure',
            changeId: null,
            monitorId: monitor.id
          });

          results.push(delivery);
        } catch (err) {
          logger.error(`Failed to dispatch failure notification to ${destination.id}:`, {
            error: err.message
          });
        }
      }
    }

    // Also dispatch failure alerts to registered Web Push subscriptions
    try {
      const pushResults = await webPushService.dispatchForFailure({
        monitor,
        consecutiveFailures,
        error: error?.message || String(error || 'Page load failure')
      });
      if (pushResults && pushResults.length > 0) {
        results.push(...pushResults);
      }
    } catch (pushErr) {
      logger.error('Failed to dispatch web push notifications for failure:', { error: pushErr.message });
    }

    return results;
  }

  /**
   * Send test notification directly to a destination
   */
  async sendTestNotification(destinationId) {
    const destination = await destinationRepository.findById(destinationId);
    if (!destination) {
      throw new Error('Destination not found');
    }

    const payload = {
      title: 'Verification Dispatch',
      summary: 'This is a test notification from PagePulse. Your notification channel is correctly configured and receiving dispatches.',
      monitorName: 'PagePulse Test Target',
      monitorUrl: 'https://pagepulse.app',
      importance: 'medium',
      category: 'announcement',
      isFailure: false
    };

    const dedupKey = `test_${destination.id}_${Date.now()}`;

    return await this.deliver({
      destination,
      payload,
      dedupKey,
      triggerType: 'test',
      isTest: true
    });
  }

  /**
   * Execute delivery through channel provider and record attempt
   */
  async deliver({
    destination,
    payload,
    dedupKey,
    triggerType = 'change',
    changeId = null,
    monitorId = null,
    isTest = false
  }) {
    const provider = this.providers[destination.channel];
    if (!provider) {
      const err = `Unsupported notification channel: ${destination.channel}`;
      return await deliveryRepository.create({
        destination_id: destination.id,
        detected_change_id: changeId,
        monitor_id: monitorId,
        dedup_key: dedupKey,
        trigger_type: triggerType,
        payload,
        status: 'failed',
        error_message: err,
        http_status_code: 400
      });
    }

    // Call provider
    const sendResult = await provider.send({ destination, payload, isTest });

    if (sendResult.success) {
      return await deliveryRepository.create({
        destination_id: destination.id,
        detected_change_id: changeId,
        monitor_id: monitorId,
        dedup_key: dedupKey,
        trigger_type: triggerType,
        payload,
        status: 'delivered',
        http_status_code: sendResult.statusCode || 200,
        sent_at: new Date(),
        error_message: null
      });
    }

    // Failed attempt handling
    const isRetryable = sendResult.isRetryable !== false;
    const retryCount = 1;
    const maxRetries = 3;

    let nextRetryAt = null;
    let status = 'failed';

    if (isRetryable && !isTest) {
      status = 'pending';
      const delayMs = 60 * 1000; // 1 min initial backoff
      nextRetryAt = new Date(Date.now() + delayMs);
    }

    return await deliveryRepository.create({
      destination_id: destination.id,
      detected_change_id: changeId,
      monitor_id: monitorId,
      dedup_key: dedupKey,
      trigger_type: triggerType,
      payload,
      status,
      http_status_code: sendResult.statusCode || 500,
      error_message: sendResult.error || 'Provider delivery error',
      retry_count: retryCount,
      max_retries: maxRetries,
      next_retry_at: nextRetryAt
    });
  }

  /**
   * Background runner for retrying transient delivery failures
   */
  async processPendingRetries() {
    const pendingDeliveries = await deliveryRepository.findPendingRetries(10);
    const results = [];

    for (const delivery of pendingDeliveries) {
      try {
        const destination = await destinationRepository.findById(delivery.destination_id);
        if (!destination || !destination.is_active) {
          await deliveryRepository.update(delivery.id, {
            status: 'failed',
            error_message: 'Destination inactive or deleted'
          });
          continue;
        }

        const provider = this.providers[destination.channel];
        if (!provider) continue;

        const payload = typeof delivery.payload === 'string' ? JSON.parse(delivery.payload) : (delivery.payload || {});
        const sendResult = await provider.send({ destination, payload });

        if (sendResult.success) {
          await deliveryRepository.update(delivery.id, {
            status: 'delivered',
            sent_at: new Date(),
            http_status_code: sendResult.statusCode || 200,
            error_message: null
          });
          results.push({ id: delivery.id, status: 'delivered' });
        } else {
          const newRetryCount = (delivery.retry_count || 0) + 1;
          const hasExhaustedRetries = newRetryCount >= (delivery.max_retries || 3);
          const isRetryable = sendResult.isRetryable && !hasExhaustedRetries;

          const delays = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];
          const delayMs = delays[Math.min(newRetryCount, delays.length - 1)];

          await deliveryRepository.update(delivery.id, {
            status: isRetryable ? 'pending' : 'failed',
            retry_count: newRetryCount,
            http_status_code: sendResult.statusCode || 500,
            error_message: sendResult.error || 'Retry attempt failed',
            next_retry_at: isRetryable ? new Date(Date.now() + delayMs) : null
          });
          results.push({ id: delivery.id, status: isRetryable ? 'pending' : 'failed' });
        }
      } catch (err) {
        logger.error(`Error during delivery retry processing for ${delivery.id}:`, { error: err.message });
      }
    }

    return results;
  }
}

export const notificationDispatcher = new NotificationDispatcher();

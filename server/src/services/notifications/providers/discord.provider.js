import { validateDiscordWebhookUrl } from '../../../validators/notification.validator.js';

export class DiscordProvider {
  constructor(customFetch = null) {
    this.name = 'discord';
    this.fetch = customFetch || globalThis.fetch;
    this.timeoutMs = 10000;
  }

  /**
   * Validate Discord destination
   */
  validateDestination(targetDestination) {
    return validateDiscordWebhookUrl(targetDestination);
  }

  /**
   * Format embed color based on importance or failure
   */
  getColor(importance, isFailure) {
    if (isFailure) return 0xEF4444; // Red
    switch (String(importance).toLowerCase()) {
      case 'high': return 0xF59E0B; // Amber / Orange
      case 'medium': return 0x3B82F6; // Blue
      default: return 0x10B981; // Green / Emerald
    }
  }

  /**
   * Send notification via Discord Webhook
   */
  async send({ destination, payload, isTest = false }) {
    const webhookUrl = destination.target_destination;
    const validation = this.validateDestination(webhookUrl);
    if (!validation.valid) {
      return {
        success: false,
        statusCode: 400,
        error: validation.reason,
        isRetryable: false
      };
    }

    const {
      title = 'PagePulse Alert',
      summary = 'A change was detected.',
      monitorName = 'Monitored Target',
      monitorUrl = '',
      importance = 'medium',
      category = 'content',
      evidence = [],
      isFailure = false,
      compareUrl = ''
    } = payload;

    const fields = [
      { name: 'Target URL', value: monitorUrl || 'N/A', inline: false }
    ];

    if (!isFailure) {
      fields.push(
        { name: 'Category', value: String(category).toUpperCase(), inline: true },
        { name: 'Priority', value: String(importance).toUpperCase(), inline: true }
      );

      if (Array.isArray(evidence) && evidence.length > 0) {
        const evidenceStr = evidence
          .slice(0, 3)
          .map(e => `• ${e.description || e}`)
          .join('\n');
        fields.push({ name: 'Evidence', value: evidenceStr.slice(0, 1000), inline: false });
      }

      if (compareUrl) {
        fields.push({ name: 'Visual Compare', value: `[Inspect Comparison](${compareUrl})`, inline: false });
      }
    }

    const discordPayload = {
      username: 'PagePulse Observatory',
      avatar_url: 'https://pagepulse.app/icon.png',
      embeds: [
        {
          title: isTest ? `[TEST] ${title}` : title,
          description: summary.slice(0, 2000),
          url: compareUrl || monitorUrl || undefined,
          color: this.getColor(importance, isFailure),
          fields,
          footer: {
            text: `PagePulse • ${monitorName}`
          },
          timestamp: new Date().toISOString()
        }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(discordPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const status = response.status;
      if (status === 204 || status === 200) {
        return {
          success: true,
          statusCode: status,
          error: null,
          isRetryable: false
        };
      }

      // 429 = Rate limited (retryable), 5xx = Server error (retryable), 4xx = Permanent error
      const isRetryable = status === 429 || (status >= 500 && status < 600);
      let errorText = `Discord webhook returned HTTP ${status}`;
      try {
        const body = await response.json();
        if (body.message) errorText += `: ${body.message}`;
      } catch {
        // ignore
      }

      return {
        success: false,
        statusCode: status,
        error: errorText,
        isRetryable
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError' || err.code === 'TIMEOUT';
      return {
        success: false,
        statusCode: isTimeout ? 408 : 0,
        error: isTimeout ? `Discord delivery timed out after ${this.timeoutMs}ms` : err.message,
        isRetryable: true // Network errors and timeouts are retryable
      };
    }
  }
}

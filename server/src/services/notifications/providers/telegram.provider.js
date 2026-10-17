import { validateTelegramChatId } from '../../../validators/notification.validator.js';

export class TelegramProvider {
  constructor(customFetch = null) {
    this.name = 'telegram';
    this.fetch = customFetch || globalThis.fetch;
    this.timeoutMs = 10000;
  }

  /**
   * Validate Telegram destination
   */
  validateDestination(targetDestination) {
    return validateTelegramChatId(targetDestination);
  }

  /**
   * Format message in Telegram HTML
   */
  formatMessage(payload, isTest) {
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

    const prefix = isTest ? '<b>[TEST NOTIFICATION]</b>\n\n' : '';
    const icon = isFailure ? '🚨' : (importance === 'high' ? '⚠️' : '🔔');

    let text = `${prefix}${icon} <b>${this.escapeHtml(title)}</b>\n\n`;
    text += `<b>Target:</b> <a href="${this.escapeHtml(monitorUrl)}">${this.escapeHtml(monitorName)}</a>\n`;

    if (!isFailure) {
      text += `<b>Priority:</b> ${this.escapeHtml(importance.toUpperCase())} | <b>Category:</b> ${this.escapeHtml(category)}\n\n`;
      text += `<b>Summary:</b>\n${this.escapeHtml(summary)}\n`;

      if (Array.isArray(evidence) && evidence.length > 0) {
        text += `\n<b>Evidence:</b>\n`;
        for (const item of evidence.slice(0, 3)) {
          text += `• ${this.escapeHtml(item.description || item)}\n`;
        }
      }

      if (compareUrl) {
        text += `\n<a href="${this.escapeHtml(compareUrl)}">👉 View in Visual Compare</a>`;
      }
    } else {
      text += `\n<b>Error Details:</b>\n${this.escapeHtml(summary)}`;
    }

    return text;
  }

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Send notification via Telegram Bot API
   */
  async send({ destination, payload, isTest = false }) {
    const chatId = destination.target_destination;
    const validation = this.validateDestination(chatId);
    if (!validation.valid) {
      return {
        success: false,
        statusCode: 400,
        error: validation.reason,
        isRetryable: false
      };
    }

    const botToken = destination.config?.botToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return {
        success: false,
        statusCode: 401,
        error: 'Telegram bot token is not configured (TELEGRAM_BOT_TOKEN missing)',
        isRetryable: false
      };
    }

    const messageText = this.formatMessage(payload, isTest);
    const endpoint = `https://api.telegram.org/bot${botToken}/sendMessage`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: messageText,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const status = response.status;
      let data = {};
      try {
        data = await response.json();
      } catch {
        // ignore
      }

      if (status === 200 && data.ok) {
        return {
          success: true,
          statusCode: 200,
          messageId: String(data.result?.message_id || ''),
          error: null,
          isRetryable: false
        };
      }

      const isRetryable = status === 429 || (status >= 500 && status < 600);
      // Clean any potential token leakage from error message
      const rawError = data.description || `Telegram API returned HTTP ${status}`;
      const safeError = rawError.replace(new RegExp(botToken, 'g'), '[REDACTED_BOT_TOKEN]');

      return {
        success: false,
        statusCode: status,
        error: safeError,
        isRetryable
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === 'AbortError' || err.code === 'TIMEOUT';
      const cleanMsg = (err.message || '').replace(new RegExp(botToken, 'g'), '[REDACTED_BOT_TOKEN]');
      return {
        success: false,
        statusCode: isTimeout ? 408 : 0,
        error: isTimeout ? `Telegram delivery timed out after ${this.timeoutMs}ms` : cleanMsg,
        isRetryable: true
      };
    }
  }
}

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';

import { KeywordMatcher } from '../src/utils/keyword-matcher.js';
import {
  validateDiscordWebhookUrl,
  validateTelegramChatId,
  validateEmailAddress
} from '../src/validators/notification.validator.js';
import { NotificationRuleEvaluator } from '../src/services/notifications/rule-evaluator.js';
import { DiscordProvider } from '../src/services/notifications/providers/discord.provider.js';
import { TelegramProvider } from '../src/services/notifications/providers/telegram.provider.js';
import { EmailProvider } from '../src/services/notifications/providers/email.provider.js';
import { NotificationDispatcher, notificationDispatcher } from '../src/services/notifications/notification-dispatcher.js';

import { destinationRepository } from '../src/repositories/destination.repository.js';
import { deliveryRepository } from '../src/repositories/delivery.repository.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { changeRepository } from '../src/repositories/change.repository.js';

describe('Phase 8: Notification Delivery & Alert Rules Test Suite', () => {
  let context;
  let app;
  let pool;
  let defaultWorkspace;

  before(async () => {
    context = setupTestDatabase();
    app = context.app;
    pool = context.pool;
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await context.reset();
    defaultWorkspace = await workspaceRepository.findOrCreateDefault();
  });

  // =========================================================================
  // 1. KEYWORD MATCHER UNIT TESTS
  // =========================================================================
  describe('1. Deterministic Keyword Matcher Engine', () => {
    it('detects when a watched keyword appears', () => {
      const prev = 'Welcome to our platform. All features are in early preview.';
      const curr = 'Welcome to our platform. Pricing plans are now officially available.';
      const res = KeywordMatcher.matchKeywords({
        previousText: prev,
        currentText: curr,
        keywords: ['pricing', 'discount']
      });

      assert.equal(res.hasMatches, true);
      assert.equal(res.matches.length, 1);
      assert.equal(res.matches[0].keyword, 'pricing');
      assert.equal(res.matches[0].status, 'appeared');
      assert.ok(res.matches[0].explanation.includes('appeared'));
    });

    it('detects when a watched keyword disappears', () => {
      const prev = 'Important: This service is in maintenance mode until Friday.';
      const curr = 'All systems nominal and operational.';
      const res = KeywordMatcher.matchKeywords({
        previousText: prev,
        currentText: curr,
        keywords: ['maintenance mode']
      });

      assert.equal(res.hasMatches, true);
      assert.equal(res.matches.length, 1);
      assert.equal(res.matches[0].keyword, 'maintenance mode');
      assert.equal(res.matches[0].status, 'disappeared');
    });

    it('detects when a watched keyword changes in relevant context', () => {
      const prev = 'Special Promotion: Get 10% discount on annual subscriptions.';
      const curr = 'Special Promotion: Get 25% discount on annual subscriptions.';
      const res = KeywordMatcher.matchKeywords({
        previousText: prev,
        currentText: curr,
        keywords: ['discount']
      });

      assert.equal(res.hasMatches, true);
      assert.equal(res.matches.length, 1);
      assert.equal(res.matches[0].keyword, 'discount');
      assert.equal(res.matches[0].status, 'context_changed');
    });

    it('enforces word boundaries to avoid false substring matches', () => {
      const prev = 'We planned our new observatory features.';
      const curr = 'We will plant a community garden in the observatory.';
      const res = KeywordMatcher.matchKeywords({
        previousText: prev,
        currentText: curr,
        keywords: ['plan']
      });

      // Neither "planned" nor "plant" should match standalone word "plan"
      assert.equal(res.hasMatches, false);
      assert.equal(res.matches.length, 0);
    });

    it('handles empty or unchanged keyword lists safely', () => {
      const res = KeywordMatcher.matchKeywords({
        previousText: 'Same content',
        currentText: 'Same content',
        keywords: ['content']
      });
      assert.equal(res.hasMatches, false);
    });
  });

  // =========================================================================
  // 2. SECURITY & SSRF VALIDATION
  // =========================================================================
  describe('2. Security & SSRF Webhook Validation', () => {
    it('accepts valid Discord webhook URLs on discord.com', () => {
      const validUrl = 'https://discord.com/api/webhooks/123456789/AbCdEfGhIjKlMnOpQrStUvWxYz';
      const check = validateDiscordWebhookUrl(validUrl);
      assert.equal(check.valid, true);
    });

    it('accepts valid Discord webhook URLs on discordapp.com', () => {
      const validUrl = 'https://discordapp.com/api/webhooks/987654321/secret_token_123';
      const check = validateDiscordWebhookUrl(validUrl);
      assert.equal(check.valid, true);
    });

    it('rejects unencrypted HTTP Discord webhooks', () => {
      const httpUrl = 'http://discord.com/api/webhooks/123/token';
      const check = validateDiscordWebhookUrl(httpUrl);
      assert.equal(check.valid, false);
      assert.ok(check.reason.includes('HTTPS'));
    });

    it('rejects SSRF attempts targeting arbitrary or internal hostnames', () => {
      const evilUrls = [
        'https://attacker-server.com/webhook',
        'https://127.0.0.1/api/webhooks/123/token',
        'https://localhost:8080/api/webhooks/123/token',
        'https://169.254.169.254/latest/meta-data'
      ];

      for (const url of evilUrls) {
        const check = validateDiscordWebhookUrl(url);
        assert.equal(check.valid, false);
        assert.ok(check.reason.includes('discord.com') || check.reason.includes('Malformed'));
      }
    });

    it('validates Telegram chat IDs correctly', () => {
      assert.equal(validateTelegramChatId('123456789').valid, true);
      assert.equal(validateTelegramChatId('-1001234567890').valid, true); // Channel / Group ID
      assert.equal(validateTelegramChatId('not-a-chat-id').valid, false);
      assert.equal(validateTelegramChatId('12').valid, false); // Too short
    });

    it('validates Email addresses correctly', () => {
      assert.equal(validateEmailAddress('ops@example.com').valid, true);
      assert.equal(validateEmailAddress('invalid-email-address').valid, false);
      assert.equal(validateEmailAddress('@missing-user.com').valid, false);
    });
  });

  // =========================================================================
  // 3. NOTIFICATION RULE EVALUATOR
  // =========================================================================
  describe('3. Notification Rule Evaluation', () => {
    const baseDestination = {
      id: 'dest-1',
      is_active: true,
      triggers: {
        on_change: true,
        on_high_importance: false,
        on_failure: false,
        keywords: []
      }
    };

    it('suppresses notifications when content is unchanged', () => {
      const res = NotificationRuleEvaluator.evaluate(baseDestination, {
        type: 'change',
        hasChanged: false
      });
      assert.equal(res.shouldNotify, false);
      assert.ok(res.reasons[0].includes('unchanged'));
    });

    it('triggers notification on meaningful content change under default rules', () => {
      const res = NotificationRuleEvaluator.evaluate(baseDestination, {
        type: 'change',
        hasChanged: true,
        importance: 'medium'
      });
      assert.equal(res.shouldNotify, true);
      assert.equal(res.triggerType, 'change');
    });

    it('filters out non-high importance changes when on_high_importance is enabled', () => {
      const highOnlyDest = {
        ...baseDestination,
        triggers: { ...baseDestination.triggers, on_high_importance: true }
      };

      // Medium importance -> suppressed
      const resMed = NotificationRuleEvaluator.evaluate(highOnlyDest, {
        type: 'change',
        hasChanged: true,
        importance: 'medium'
      });
      assert.equal(resMed.shouldNotify, false);

      // High importance -> triggered
      const resHigh = NotificationRuleEvaluator.evaluate(highOnlyDest, {
        type: 'change',
        hasChanged: true,
        importance: 'high'
      });
      assert.equal(resHigh.shouldNotify, true);
      assert.equal(resHigh.triggerType, 'high_importance');
    });

    it('triggers keyword alert when matching keywords appear', () => {
      const keywordDest = {
        ...baseDestination,
        triggers: { ...baseDestination.triggers, keywords: ['pricing', 'discount'] }
      };

      const res = NotificationRuleEvaluator.evaluate(keywordDest, {
        type: 'change',
        hasChanged: true,
        previousText: 'Welcome to our platform',
        currentText: 'Check out our updated pricing table'
      });

      assert.equal(res.shouldNotify, true);
      assert.equal(res.triggerType, 'keyword');
      assert.equal(res.keywordMatches[0].keyword, 'pricing');
    });

    it('suppresses temporary single network hiccups and notifies only on persistent failures', () => {
      const failureDest = {
        ...baseDestination,
        triggers: { ...baseDestination.triggers, on_failure: true }
      };

      // Single failure -> ignored
      const resTransient = NotificationRuleEvaluator.evaluate(failureDest, {
        type: 'failure',
        consecutiveFailures: 1
      });
      assert.equal(resTransient.shouldNotify, false);
      assert.ok(resTransient.reasons[0].includes('transient'));

      // Persistent failure (2+ drops) -> notified
      const resPersistent = NotificationRuleEvaluator.evaluate(failureDest, {
        type: 'failure',
        consecutiveFailures: 2
      });
      assert.equal(resPersistent.shouldNotify, true);
      assert.equal(resPersistent.triggerType, 'failure');
    });

    it('suppresses notifications when destination is inactive / paused', () => {
      const inactiveDest = { ...baseDestination, is_active: false };
      const res = NotificationRuleEvaluator.evaluate(inactiveDest, {
        type: 'change',
        hasChanged: true
      });
      assert.equal(res.shouldNotify, false);
      assert.ok(res.reasons[0].includes('inactive'));
    });
  });

  // =========================================================================
  // 4. PROVIDERS & DELIVERY DISPATCHER (MOCKED)
  // =========================================================================
  describe('4. Notification Providers & Delivery Dispatcher (Mocked)', () => {
    it('successfully delivers Discord webhook dispatches with rich embeds', async () => {
      let sentBody = null;
      const mockFetch = async (url, options) => {
        sentBody = JSON.parse(options.body);
        return {
          status: 204,
          json: async () => ({})
        };
      };

      const discordProvider = new DiscordProvider(mockFetch);
      const res = await discordProvider.send({
        destination: {
          target_destination: 'https://discord.com/api/webhooks/123/token'
        },
        payload: {
          title: 'Pricing Plan Updated',
          summary: 'Changed from ₹999 to ₹1,199',
          importance: 'high',
          category: 'pricing',
          evidence: [{ description: 'Detected ₹999 replaced with ₹1,199' }]
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.statusCode, 204);
      assert.ok(sentBody.embeds[0].title.includes('Pricing Plan Updated'));
      assert.equal(sentBody.embeds[0].color, 0xF59E0B); // Amber for high priority
    });

    it('handles Discord rate limits (429) gracefully and flags as retryable', async () => {
      const mockFetch = async () => ({
        status: 429,
        json: async () => ({ message: 'You are being rate limited.', retry_after: 5 })
      });

      const discordProvider = new DiscordProvider(mockFetch);
      const res = await discordProvider.send({
        destination: { target_destination: 'https://discord.com/api/webhooks/123/token' },
        payload: { title: 'Test Alert' }
      });

      assert.equal(res.success, false);
      assert.equal(res.statusCode, 429);
      assert.equal(res.isRetryable, true);
      assert.ok(res.error.includes('rate limited'));
    });

    it('delivers Telegram notifications and redacts sensitive bot tokens', async () => {
      const mockToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
      let sentEndpoint = '';
      const mockFetch = async (endpoint) => {
        sentEndpoint = endpoint;
        return {
          status: 200,
          json: async () => ({ ok: true, result: { message_id: 8492 } })
        };
      };

      const telegramProvider = new TelegramProvider(mockFetch);
      const res = await telegramProvider.send({
        destination: {
          target_destination: '987654321',
          config: { botToken: mockToken }
        },
        payload: {
          title: 'New Content Published',
          summary: 'New press release appeared.',
          importance: 'medium'
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.statusCode, 200);
      assert.equal(res.messageId, '8492');
      assert.ok(sentEndpoint.includes(mockToken));
    });

    it('masks Telegram bot token if error occurs to prevent credential leak', async () => {
      const mockToken = 'SECRET_TOKEN_TO_REDACT_123';
      const mockFetch = async () => ({
        status: 400,
        json: async () => ({ ok: false, description: `Bad Request: token ${mockToken} invalid` })
      });

      const telegramProvider = new TelegramProvider(mockFetch);
      const res = await telegramProvider.send({
        destination: {
          target_destination: '987654321',
          config: { botToken: mockToken }
        },
        payload: { title: 'Test' }
      });

      assert.equal(res.success, false);
      assert.ok(!res.error.includes(mockToken));
      assert.ok(res.error.includes('[REDACTED_BOT_TOKEN]'));
    });

    it('delivers Email dispatches with Nordic Atelier template formatting', async () => {
      let capturedEmail = null;
      const customTransport = async (mail) => {
        capturedEmail = mail;
        return { messageId: 'msg-1234' };
      };

      const emailProvider = new EmailProvider(customTransport);
      const res = await emailProvider.send({
        destination: { target_destination: 'alerts@nordic-atelier.se' },
        payload: {
          title: 'Terms of Service Altered',
          summary: 'Paragraph 4 was amended.',
          monitorName: 'Nordic Legal',
          monitorUrl: 'https://nordic-atelier.se/tos',
          importance: 'high'
        }
      });

      assert.equal(res.success, true);
      assert.equal(res.messageId, 'msg-1234');
      assert.equal(capturedEmail.to, 'alerts@nordic-atelier.se');
      assert.ok(capturedEmail.html.includes('Terms of Service Altered'));
      assert.ok(capturedEmail.html.includes('PagePulse'));
    });
  });

  // =========================================================================
  // 5. DEDUPLICATION & END-TO-END DATABASE INTEGRATION
  // =========================================================================
  describe('5. Deduplication, Delivery History & API Endpoints', () => {
    let destination;
    let monitor;
    let change;
    let mockDispatcher;

    beforeEach(async () => {
      // 1. Create Destination
      destination = await destinationRepository.create({
        workspace_id: defaultWorkspace.id,
        name: 'Operations Discord',
        channel: 'discord',
        target_destination: 'https://discord.com/api/webhooks/111222333/token456',
        triggers: { on_change: true, on_high_importance: false, on_failure: true, keywords: ['launch'] }
      });

      // 2. Create Monitor
      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/status',
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      monitor = await monitorRepository.create({
        workspace_id: defaultWorkspace.id,
        canonical_target_id: target.id,
        name: 'Status Page',
        url: 'https://example.com/status',
        check_cadence: '15m'
      });

      // 3. Create Snapshots
      const baselineSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 1,
        text_content: 'Status: All systems operational.',
        text_hash: 'hash-test-1'
      });

      const currentSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 2,
        text_content: 'Status: Scheduled product launch in progress.',
        text_hash: 'hash-test-2'
      });

      // 4. Create Change
      change = await changeRepository.create({
        monitor_id: monitor.id,
        baseline_snapshot_id: baselineSnap.id,
        current_snapshot_id: currentSnap.id,
        title: 'Launch announcement added to status page',
        description: 'New launch text detected'
      });

      // 5. Mock Dispatcher with simulated successful provider
      const mockDiscord = {
        validateDestination: () => ({ valid: true }),
        send: async () => ({ success: true, statusCode: 204 })
      };
      mockDispatcher = new NotificationDispatcher({
        discord: mockDiscord
      });
      notificationDispatcher.setProvider('discord', mockDiscord);
    });

    it('prevents duplicate delivery for the same change event', async () => {
      // First dispatch
      const firstBatch = await mockDispatcher.dispatchForChange({
        changeRecord: change,
        monitor,
        baselineSnapshot: { text_content: 'old text' },
        currentSnapshot: { text_content: 'new text' }
      });

      assert.equal(firstBatch.length, 1);
      assert.equal(firstBatch[0].status, 'delivered');

      // Duplicate dispatch attempt for same change and destination
      const secondBatch = await mockDispatcher.dispatchForChange({
        changeRecord: change,
        monitor,
        baselineSnapshot: { text_content: 'old text' },
        currentSnapshot: { text_content: 'new text' }
      });

      // Second batch should be suppressed by deduplication key
      assert.equal(secondBatch.length, 0);

      // Verify DB contains exactly 1 delivery record
      const res = await pool.query(
        'SELECT COUNT(*)::int AS count FROM notification_deliveries WHERE destination_id = $1',
        [destination.id]
      );
      assert.equal(res.rows[0].count, 1);
    });

    it('POST /api/notifications/destinations/:id/test sends immediate test delivery', async () => {
      const res = await request(app)
        .post(`/api/notifications/destinations/${destination.id}/test`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.trigger_type, 'test');
    });

    it('GET /api/notifications/destinations lists configured channels with triggers', async () => {
      const res = await request(app)
        .get('/api/notifications/destinations')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].name, 'Operations Discord');
      assert.equal(res.body.data[0].channel, 'discord');
      assert.equal(res.body.data[0].triggers.on_change, true);
    });

    it('GET /api/notifications/deliveries lists delivery history log', async () => {
      // Trigger a delivery
      await request(app)
        .post(`/api/notifications/destinations/${destination.id}/test`)
        .expect(200);

      const res = await request(app)
        .get('/api/notifications/deliveries')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.length >= 1);
      assert.equal(res.body.data[0].destination_id, destination.id);
    });

    it('enforces workspace isolation and rejects access to unauthorized destinations', async () => {
      // Create another workspace
      const otherWs = await workspaceRepository.create({ name: 'Other Workspace', slug: 'other-ws' });
      const otherDest = await destinationRepository.create({
        workspace_id: otherWs.id,
        name: 'Competitor Webhook',
        channel: 'discord',
        target_destination: 'https://discord.com/api/webhooks/999/token'
      });

      // Querying default workspace should only return its own destinations
      const listRes = await request(app)
        .get('/api/notifications/destinations')
        .expect(200);

      const ids = listRes.body.data.map(d => d.id);
      assert.ok(ids.includes(destination.id));
      assert.ok(!ids.includes(otherDest.id));
    });
  });
});

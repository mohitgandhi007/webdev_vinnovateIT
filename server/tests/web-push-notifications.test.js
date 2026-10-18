import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';

import { webPushSubscriptionRepository } from '../src/repositories/web-push-subscription.repository.js';
import { deliveryRepository } from '../src/repositories/delivery.repository.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { changeRepository } from '../src/repositories/change.repository.js';

import { WebPushService } from '../src/services/notifications/web-push.service.js';
import { notificationDispatcher } from '../src/services/notifications/notification-dispatcher.js';
import { WebPushProvider } from '../src/services/notifications/providers/web-push.provider.js';
import { config } from '../src/config/env.js';

describe('Web Push Real-Time Browser Notifications Test Suite', () => {
  let context;
  let app;
  let pool;
  let defaultWorkspace;
  let mockProvider;
  let sentPushes = [];

  // Mock Web Push provider to capture push payloads without hitting external browser push services
  class MockWebPushProvider {
    constructor() {
      this.behavior = 'success'; // 'success' | 'expired' | 'error'
    }

    async send({ subscription, payload, isTest }) {
      if (this.behavior === 'expired') {
        return {
          success: false,
          statusCode: 410,
          expired: true,
          error: 'Push subscription has expired or is invalid (HTTP 410)'
        };
      }
      if (this.behavior === 'error') {
        return {
          success: false,
          statusCode: 500,
          expired: false,
          error: 'Push service temporarily unavailable (HTTP 500)'
        };
      }
      sentPushes.push({ subscription, payload, isTest });
      return {
        success: true,
        statusCode: 201
      };
    }
  }

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
    sentPushes = [];
    mockProvider = new MockWebPushProvider();
  });

  // =========================================================================
  // 1. PUBLIC KEY & VAPID CONFIGURATION
  // =========================================================================
  describe('1. VAPID Configuration & Public Key Endpoint', () => {
    it('returns the public VAPID key and configuration status', async () => {
      const res = await request(app)
        .get('/api/notifications/push/public-key')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.publicKey, 'Expected a public VAPID key to be returned');
      assert.equal(typeof res.body.data.publicKey, 'string');
      assert.equal(res.body.data.configured, true);
    });

    it('never exposes the private VAPID key via the API', async () => {
      const res = await request(app)
        .get('/api/notifications/push/public-key')
        .expect(200);

      assert.equal(res.body.data.privateKey, undefined);
      assert.equal(res.body.data.vapidPrivateKey, undefined);
      const rawText = JSON.stringify(res.body);
      assert.equal(rawText.includes(config.vapidPrivateKey), false);
    });

    it('reports subscription status for a given endpoint', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/sample-token-123';
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint,
        p256dh: 'sample-p256dh-key',
        auth: 'sample-auth-secret',
        preferences: { notify_on_change: true, notify_on_failure: false, importance: 'all' }
      });

      const res = await request(app)
        .get(`/api/notifications/push/status?endpoint=${encodeURIComponent(endpoint)}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.isSubscribed, true);
      assert.equal(res.body.data.subscription.status, 'active');
      // Ensure private encryption material is shielded
      assert.equal(res.body.data.subscription.p256dh, undefined);
      assert.equal(res.body.data.subscription.auth, undefined);
    });
  });

  // =========================================================================
  // 2. SUBSCRIPTION REGISTRATION & VALIDATION
  // =========================================================================
  describe('2. Push Subscription Registration & Security Validation', () => {
    const validSubscriptionPayload = {
      subscription: {
        endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/demo-sub-abc',
        keys: {
          p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9t0P684DqV',
          auth: 'tBHItJI5svbpqma0QAkrpw'
        }
      },
      preferences: {
        notify_on_change: true,
        notify_on_failure: true,
        importance: 'all'
      }
    };

    it('successfully registers a valid Web Push subscription', async () => {
      const res = await request(app)
        .post('/api/notifications/push/subscribe')
        .send(validSubscriptionPayload)
        .expect(201);

      assert.equal(res.body.success, true);
      assert.ok(res.body.data.id);
      assert.equal(res.body.data.status, 'active');
      assert.equal(res.body.data.preferences.notify_on_change, true);
      assert.equal(res.body.data.preferences.notify_on_failure, true);

      // Verify secrets are NEVER exposed in response
      assert.equal(res.body.data.p256dh, undefined);
      assert.equal(res.body.data.auth, undefined);

      // Verify persisted in database
      const inDb = await webPushSubscriptionRepository.findById(res.body.data.id);
      assert.ok(inDb);
      assert.equal(inDb.endpoint, validSubscriptionPayload.subscription.endpoint);
      assert.equal(inDb.p256dh, validSubscriptionPayload.subscription.keys.p256dh);
      assert.equal(inDb.auth, validSubscriptionPayload.subscription.keys.auth);
    });

    it('handles duplicate subscription registration idempotently without error', async () => {
      // First registration
      const firstRes = await request(app)
        .post('/api/notifications/push/subscribe')
        .send(validSubscriptionPayload)
        .expect(201);

      // Second registration for same endpoint with updated preferences
      const secondRes = await request(app)
        .post('/api/notifications/push/subscribe')
        .send({
          ...validSubscriptionPayload,
          preferences: {
            notify_on_change: false,
            notify_on_failure: true,
            importance: 'high'
          }
        })
        .expect(200);

      assert.equal(secondRes.body.success, true);
      assert.equal(secondRes.body.data.id, firstRes.body.data.id);
      assert.equal(secondRes.body.data.preferences.notify_on_change, false);
      assert.equal(secondRes.body.data.preferences.importance, 'high');

      // Verify count in DB remains 1
      const countRes = await pool.query('SELECT COUNT(*) FROM web_push_subscriptions');
      assert.equal(parseInt(countRes.rows[0].count, 10), 1);
    });

    it('rejects invalid or malformed subscription endpoints', async () => {
      // Missing endpoint
      await request(app)
        .post('/api/notifications/push/subscribe')
        .send({
          subscription: {
            keys: { p256dh: 'test', auth: 'test' }
          }
        })
        .expect(400);

      // Insecure HTTP endpoint (not localhost)
      await request(app)
        .post('/api/notifications/push/subscribe')
        .send({
          subscription: {
            endpoint: 'http://insecure-push.example.com/send/123',
            keys: { p256dh: 'test', auth: 'test' }
          }
        })
        .expect(400);

      // Missing keys
      await request(app)
        .post('/api/notifications/push/subscribe')
        .send({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/xyz',
            keys: {}
          }
        })
        .expect(400);
    });

    it('allows localhost endpoints for local development and testing', async () => {
      const res = await request(app)
        .post('/api/notifications/push/subscribe')
        .send({
          subscription: {
            endpoint: 'http://localhost:8080/mock-push/send/123',
            keys: {
              p256dh: 'test-p256dh',
              auth: 'test-auth'
            }
          }
        })
        .expect(201);

      assert.equal(res.body.success, true);
    });
  });

  // =========================================================================
  // 3. UNSUBSCRIBE & PREFERENCE UPDATES
  // =========================================================================
  describe('3. Unsubscribe & Preferences Management', () => {
    it('deactivates subscription when user disables browser notifications', async () => {
      const endpoint = 'https://fcm.googleapis.com/fcm/send/unsub-test';
      const created = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint,
        p256dh: 'key',
        auth: 'auth',
        preferences: { notify_on_change: true }
      });

      const res = await request(app)
        .post('/api/notifications/push/unsubscribe')
        .send({ endpoint })
        .expect(200);

      assert.equal(res.body.success, true);

      // Verify DB status is revoked
      const updated = await webPushSubscriptionRepository.findById(created.id);
      assert.equal(updated.status, 'revoked');

      // Verify it is not included in active subscriptions
      const active = await webPushSubscriptionRepository.findActiveByWorkspace(defaultWorkspace.id);
      assert.equal(active.some(s => s.id === created.id), false);
    });

    it('updates user preferences without re-registering push credentials', async () => {
      const created = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/pref-test',
        p256dh: 'key',
        auth: 'auth',
        preferences: { notify_on_change: true, notify_on_failure: false, importance: 'all' }
      });

      const res = await request(app)
        .patch('/api/notifications/push/preferences')
        .send({
          id: created.id,
          preferences: {
            notify_on_change: false,
            notify_on_failure: true,
            importance: 'high'
          }
        })
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.preferences.notify_on_change, false);
      assert.equal(res.body.data.preferences.notify_on_failure, true);
      assert.equal(res.body.data.preferences.importance, 'high');
    });
  });

  // =========================================================================
  // 4. CHANGE DETECTION INTEGRATION & SUPPRESSION POLICIES
  // =========================================================================
  describe('4. Change Detection Push Integration & Suppression Rules', () => {
    let testMonitor;
    let baselineSnap;
    let changedSnap;
    let changeRecord;
    let webPushServiceInstance;

    beforeEach(async () => {
      webPushServiceInstance = new WebPushService(mockProvider);

      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/pricing'
      });

      testMonitor = await monitorRepository.create({
        workspace_id: defaultWorkspace.id,
        canonical_target_id: target.id,
        name: 'SaaS Pricing Watch',
        url: 'https://example.com/pricing',
        check_cadence: '15m'
      });

      baselineSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 1,
        text_content: 'Starter Plan: $10/mo\nPro Plan: $20/mo',
        text_hash: 'hash-base'
      });

      changedSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 2,
        text_content: 'Starter Plan: $15/mo\nPro Plan: $20/mo',
        text_hash: 'hash-changed'
      });

      changeRecord = await changeRepository.create({
        monitor_id: testMonitor.id,
        baseline_snapshot_id: baselineSnap.id,
        current_snapshot_id: changedSnap.id,
        title: 'Price Modification Detected',
        description: 'Starter plan increased from $10 to $15',
        change_type: 'content_updated',
        diff_summary: { added: 1, removed: 1 }
      });
    });

    it('successfully delivers Web Push notification for a meaningful detected change', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-1',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: true, notify_on_failure: false, importance: 'all' }
      });

      const results = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap,
        insight: {
          headline: 'SaaS Pricing Update',
          executive_summary: 'Starter tier changed from $10 to $15/month',
          impact_level: 'high'
        }
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].success, true);
      assert.equal(sentPushes.length, 1);

      const sent = sentPushes[0];
      assert.equal(sent.payload.title, 'SaaS Pricing Update');
      assert.equal(sent.payload.summary, 'Starter tier changed from $10 to $15/month');
      assert.equal(sent.payload.monitorName, 'SaaS Pricing Watch');
      assert.ok(sent.payload.compareUrl.includes(`/compare/${testMonitor.id}`));
      assert.equal(sent.payload.isFailure, false);

      // Verify delivery was recorded
      const deliveries = await pool.query('SELECT * FROM notification_deliveries WHERE monitor_id = $1', [testMonitor.id]);
      assert.equal(deliveries.rows.length, 1);
      assert.equal(deliveries.rows[0].status, 'delivered');
      assert.equal(deliveries.rows[0].trigger_type, 'webpush_change');
    });

    it('works deterministically when Gemini AI is unavailable (no insight)', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-no-gemini',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: true, notify_on_failure: false, importance: 'all' }
      });

      // Dispatch without insight parameter (Gemini unavailable)
      const results = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap,
        insight: null
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].success, true);
      assert.equal(sentPushes.length, 1);

      // Notification is constructed factually from changeRecord
      const sent = sentPushes[0];
      assert.ok(sent.payload.title.includes('Price Modification Detected'));
      assert.ok(sent.payload.summary.includes('Starter plan increased from $10 to $15'));
    });

    it('suppresses notification for baseline creation (no prior snapshot)', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-baseline',
        p256dh: 'p256-key',
        auth: 'auth-key'
      });

      const results = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: null, // Initial baseline!
        currentSnapshot: changedSnap
      });

      assert.equal(results.length, 0);
      assert.equal(sentPushes.length, 0);
    });

    it('suppresses notification when user disabled change alerts', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-disabled-changes',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: false, notify_on_failure: true }
      });

      const results = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap
      });

      assert.equal(results.length, 0);
      assert.equal(sentPushes.length, 0);
    });

    it('filters notifications by importance preference (high only vs medium change)', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-high-only',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: true, importance: 'high' }
      });

      // Insight has 'medium' impact
      const results = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap,
        insight: { headline: 'Minor Layout Tweak', impact_level: 'medium' }
      });

      assert.equal(results.length, 0);
      assert.equal(sentPushes.length, 0);
    });

    it('prevents duplicate push delivery for the exact same change and subscription', async () => {
      const sub = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscriber-dedup',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: true }
      });

      // First dispatch
      const first = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap
      });
      assert.equal(first.length, 1);
      assert.equal(sentPushes.length, 1);

      // Second dispatch with same change record and subscription
      const second = await webPushServiceInstance.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap
      });
      assert.equal(second.length, 0, 'Expected duplicate dispatch to be skipped');
      assert.equal(sentPushes.length, 1, 'Expected no additional push sent');
    });
  });

  // =========================================================================
  // 5. ERROR HANDLING, 410 GONE & RETRY POLICIES
  // =========================================================================
  describe('5. Push Service Errors, 410 Gone & Expired Subscriptions', () => {
    let testMonitor;
    let baselineSnap;
    let changedSnap;
    let changeRecord;

    beforeEach(async () => {
      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/test'
      });

      testMonitor = await monitorRepository.create({
        workspace_id: defaultWorkspace.id,
        canonical_target_id: target.id,
        name: 'Failure Test Monitor',
        url: 'https://example.com/test',
        check_cadence: '15m'
      });

      baselineSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 1,
        text_content: 'A',
        text_hash: 'hash-a'
      });

      changedSnap = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 2,
        text_content: 'B',
        text_hash: 'hash-b'
      });

      changeRecord = await changeRepository.create({
        monitor_id: testMonitor.id,
        baseline_snapshot_id: baselineSnap.id,
        current_snapshot_id: changedSnap.id,
        title: 'Alteration'
      });
    });

    it('automatically marks subscription as expired upon receiving 410 Gone', async () => {
      const sub = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/expired-sub',
        p256dh: 'p256-key',
        auth: 'auth-key'
      });

      mockProvider.behavior = 'expired';
      const service = new WebPushService(mockProvider);

      const results = await service.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].success, false);
      assert.equal(results[0].expired, true);

      // Verify status in DB was updated to expired
      const updated = await webPushSubscriptionRepository.findById(sub.id);
      assert.equal(updated.status, 'expired');
      assert.ok(updated.failure_reason.includes('410'));
    });

    it('tracks temporary push service failures (500) and increments failure count', async () => {
      const sub = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/temp-failure-sub',
        p256dh: 'p256-key',
        auth: 'auth-key'
      });

      mockProvider.behavior = 'error';
      const service = new WebPushService(mockProvider);

      const results = await service.dispatchForChange({
        changeRecord,
        monitor: testMonitor,
        baselineSnapshot: baselineSnap,
        currentSnapshot: changedSnap
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].success, false);

      const updated = await webPushSubscriptionRepository.findById(sub.id);
      assert.equal(updated.status, 'active'); // Remains active for temporary retry
      assert.equal(updated.failure_count, 1);
      assert.ok(updated.failure_reason.includes('500'));
    });

    it('dispatches failure alerts when monitor has consecutive errors and pref is enabled', async () => {
      await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/failure-alert-sub',
        p256dh: 'p256-key',
        auth: 'auth-key',
        preferences: { notify_on_change: false, notify_on_failure: true }
      });

      const service = new WebPushService(mockProvider);
      const results = await service.dispatchForFailure({
        monitor: testMonitor,
        consecutiveFailures: 3,
        error: 'ETIMEDOUT: Connection timed out after 30000ms'
      });

      assert.equal(results.length, 1);
      assert.equal(results[0].success, true);
      assert.equal(sentPushes.length, 1);

      const sent = sentPushes[0];
      assert.equal(sent.payload.isFailure, true);
      assert.ok(sent.payload.title.includes('Monitoring Alert'));
      assert.ok(sent.payload.summary.includes('3 consecutive failure(s)'));
    });
  });

  // =========================================================================
  // 6. TEST PUSH DISPATCH & RATE LIMITING
  // =========================================================================
  describe('6. Test Push Notification Endpoint & Security', () => {
    it('dispatches a test notification to an active subscription', async () => {
      const sub = await webPushSubscriptionRepository.upsert({
        workspaceId: defaultWorkspace.id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-sub',
        p256dh: 'p256-key',
        auth: 'auth-key'
      });

      // Override provider on singleton for controller testing
      const { webPushService } = await import('../src/services/notifications/web-push.service.js');
      const originalProvider = webPushService.provider;
      webPushService.setProvider(mockProvider);

      try {
        const res = await request(app)
          .post('/api/notifications/push/test')
          .send({ id: sub.id })
          .expect(200);

        assert.equal(res.body.success, true);
        assert.equal(sentPushes.length, 1);
        assert.equal(sentPushes[0].payload.title, 'PagePulse — Test Notification');
      } finally {
        webPushService.setProvider(originalProvider);
      }
    });

    it('rejects test notification for non-existent subscription', async () => {
      await request(app)
        .post('/api/notifications/push/test')
        .send({ id: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
  });

  // =========================================================================
  // 7. SECURITY & DESTINATION URL VALIDATION
  // =========================================================================
  describe('7. Safe Destination URL Validation', () => {
    it('sanitizes and confines notification click targets to valid relative paths', () => {
      const provider = new WebPushProvider();

      // Untrusted external redirect attempts must be sanitized to fallback
      const maliciousExternal = provider.sanitizeCompareUrl('https://evil-phishing.com/login');
      assert.equal(maliciousExternal, '/monitors');

      const protocolRelative = provider.sanitizeCompareUrl('//evil.com/phish');
      assert.equal(protocolRelative, '/monitors');

      const javascriptUri = provider.sanitizeCompareUrl('javascript:alert(1)');
      assert.equal(javascriptUri, '/monitors');

      // Valid relative internal paths must be preserved
      const validPath = provider.sanitizeCompareUrl('/compare/123-abc?changeId=456');
      assert.equal(validPath, '/compare/123-abc?changeId=456');

      const emptyPath = provider.sanitizeCompareUrl(null);
      assert.equal(emptyPath, '/monitors');
    });
  });
});

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';
import { createTestFixtureServer } from './fixtures/test-server.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { browserPool } from '../src/jobs/browser-pool.js';
import { NumericalAnalyzer } from '../src/utils/numerical-analyzer.js';
import { notificationDispatcher } from '../src/services/notifications/notification-dispatcher.js';
import { geminiService } from '../src/services/gemini.service.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { changeRepository } from '../src/repositories/change.repository.js';
import { insightRepository } from '../src/repositories/insight.repository.js';
import { destinationRepository } from '../src/repositories/destination.repository.js';

describe('Phase 11: End-to-End System Verification Test Suite', () => {
  let context;
  let app;
  let pool;
  let fixtureServer;
  let baseUrl;
  let defaultWorkspace;
  const dispatchedNotifications = [];

  before(async () => {
    process.env.ALLOW_LOCAL_FIXTURES = 'true';
    context = setupTestDatabase();
    app = context.app;
    pool = context.pool;

    fixtureServer = createTestFixtureServer();
    const info = await fixtureServer.start();
    baseUrl = info.baseUrl;

    // Set up mocked notification provider to avoid real external webhook calls
    notificationDispatcher.setProvider('discord', {
      validateDestination: () => ({ valid: true }),
      send: async ({ destination, payload, message }) => {
        dispatchedNotifications.push({ destination, payload: payload || message, timestamp: new Date() });
        return { success: true, statusCode: 204 };
      }
    });
  });

  after(async () => {
    delete process.env.ALLOW_LOCAL_FIXTURES;
    await browserPool.closeAll();
    await fixtureServer.stop();
    await pool.end();
  });

  beforeEach(async () => {
    await context.reset();
    defaultWorkspace = await workspaceRepository.findOrCreateDefault();
    dispatchedNotifications.length = 0;
  });

  // =========================================================================
  // 1. ISOLATED TEST ENVIRONMENT VERIFICATION
  // =========================================================================
  describe('1. Test Environment Setup & Service Health', () => {
    it('verifies that the test database, Express API, and fixture server are connected', async () => {
      const res = await request(app)
        .get('/api/health')
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'healthy');
      assert.equal(res.body.services.api, 'online');
      assert.equal(res.body.services.database.status, 'connected');
      assert.equal(res.body.services.worker, 'ready');
      assert.ok(baseUrl.startsWith('http://127.0.0.1:'));
    });
  });

  // =========================================================================
  // 2. MONITOR CREATION & VALIDATION
  // =========================================================================
  describe('2. Monitor Creation and Input Validation', () => {
    it('creates a valid monitor with URL, interval, and mode, persisting in PostgreSQL', async () => {
      const payload = {
        name: 'Atelier Nordic Stoneware',
        url: `${baseUrl}/unchanged`,
        check_cadence: '15m',
        mode: 'both',
        css_selector: 'main',
        noise_threshold_percent: 5
      };

      const res = await request(app)
        .post('/api/monitors')
        .send(payload)
        .expect(201);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Atelier Nordic Stoneware');
      assert.equal(res.body.data.check_cadence, '15m');
      assert.equal(res.body.data.mode, 'both');
      assert.equal(res.body.data.status, 'pending');

      const monitorId = res.body.data.id;

      // Verify monitor exists in database directly
      const dbMonitor = await monitorRepository.findById(monitorId);
      assert.ok(dbMonitor);
      assert.equal(dbMonitor.name, 'Atelier Nordic Stoneware');
      assert.equal(dbMonitor.url, `${baseUrl}/unchanged`);

      // Verify monitor is returned in list endpoint
      const listRes = await request(app)
        .get('/api/monitors')
        .expect(200);

      assert.equal(listRes.body.success, true);
      const found = listRes.body.data.find(m => m.id === monitorId);
      assert.ok(found);
      assert.equal(found.status, 'pending');
    });

    it('rejects invalid URLs (malformed, ftp, javascript, and prohibited IP/SSRF addresses)', async () => {
      // 1. Malformed URL
      await request(app)
        .post('/api/monitors')
        .send({ name: 'Bad URL', url: 'invalid-url-format', check_cadence: '1h' })
        .expect(400);

      // 2. Disallowed scheme
      await request(app)
        .post('/api/monitors')
        .send({ name: 'FTP scheme', url: 'ftp://ftp.example.com', check_cadence: '1h' })
        .expect(400);

      // 3. Javascript scheme
      await request(app)
        .post('/api/monitors')
        .send({ name: 'Script scheme', url: 'javascript:alert(1)', check_cadence: '1h' })
        .expect(400);

      // 4. SSRF Loopback (127.0.0.1) when not explicitly allowed fixture
      delete process.env.ALLOW_LOCAL_FIXTURES;
      const ssrfRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'SSRF Attack', url: 'http://127.0.0.1:8080/admin', check_cadence: '1h' })
        .expect(400);
      assert.equal(ssrfRes.body.success, false);
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
    });

    it('rejects invalid check intervals (< 15m and > 24h)', async () => {
      // Too short (5m)
      const resShort = await request(app)
        .post('/api/monitors')
        .send({ name: 'Too fast', url: 'https://example.com', check_cadence: '5m' })
        .expect(400);
      assert.equal(resShort.body.error.code, 'VALIDATION_ERROR');

      // Too long (48h)
      const resLong = await request(app)
        .post('/api/monitors')
        .send({ name: 'Too slow', url: 'https://example.com', check_cadence: '48h' })
        .expect(400);
      assert.equal(resLong.body.error.code, 'VALIDATION_ERROR');

      // Invalid cadence format
      await request(app)
        .post('/api/monitors')
        .send({ name: 'Invalid unit', url: 'https://example.com', check_cadence: 'every-hour' })
        .expect(400);
    });
  });

  // =========================================================================
  // 3. INITIAL CHECK (BASELINE ESTABLISHMENT)
  // =========================================================================
  describe('3. Initial Check & Baseline Creation', () => {
    it('executes the first check, establishes baseline, captures screenshot, and generates no change alerts', async () => {
      // 1. Create monitor
      const monRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Baseline Verification Monitor',
          url: `${baseUrl}/unchanged`,
          check_cadence: '15m',
          mode: 'both'
        })
        .expect(201);

      const monitorId = monRes.body.data.id;

      // 2. Worker executes check
      const result = await monitorRunner.runCheck(monitorId);

      assert.equal(result.status, 'completed');
      assert.equal(result.isBaseline, true);
      assert.equal(result.hasChanged, false);
      assert.equal(result.changeRecord, null);
      assert.ok(result.snapshotId);

      // 3. Verify snapshot details
      const snapshot = await snapshotRepository.findById(result.snapshotId);
      assert.ok(snapshot);
      assert.equal(snapshot.scan_number, 1);
      assert.equal(snapshot.http_status_code, 200);
      assert.ok(snapshot.text_content.includes('Atelier Nordic Stoneware'));
      assert.ok(snapshot.text_hash);
      assert.ok(snapshot.screenshot_path, 'Screenshot should be captured when mode is both');

      // 4. Verify monitor status transitioned from pending to healthy
      const updatedMon = await monitorRepository.findById(monitorId);
      assert.equal(updatedMon.status, 'healthy');
      assert.equal(updatedMon.consecutive_failures, 0);
      assert.ok(updatedMon.last_checked_at);
      assert.ok(updatedMon.next_check_at);

      // 5. Ensure NO change alert was generated for the baseline
      const changes = await changeRepository.findByMonitorId(monitorId);
      assert.equal(changes.changes.length, 0);
    });
  });

  // =========================================================================
  // 4. UNCHANGED PAGE STABILITY
  // =========================================================================
  describe('4. Unchanged Page Check & Stability', () => {
    it('verifies that subsequent checks on unchanged pages produce matching hashes and zero false alerts', async () => {
      const monRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Stability Monitor',
          url: `${baseUrl}/unchanged`,
          check_cadence: '15m'
        })
        .expect(201);

      const monitorId = monRes.body.data.id;

      // Check 1: Baseline
      const r1 = await monitorRunner.runCheck(monitorId);
      assert.equal(r1.isBaseline, true);

      // Check 2: Unchanged content
      const r2 = await monitorRunner.runCheck(monitorId);
      assert.equal(r2.status, 'completed');
      assert.equal(r2.isBaseline, false);
      assert.equal(r2.hasChanged, false);
      assert.equal(r2.changeRecord, null);

      // Verify hashes match exactly
      const snapshots = await snapshotRepository.findByMonitorId(monitorId);
      assert.equal(snapshots.snapshots.length, 2);
      assert.equal(snapshots.snapshots[0].text_hash, snapshots.snapshots[1].text_hash);

      // Zero false change records
      const changes = await changeRepository.findByMonitorId(monitorId);
      assert.equal(changes.changes.length, 0);

      // Zero notifications sent
      assert.equal(dispatchedNotifications.length, 0);

      // Monitor remains healthy
      const mon = await monitorRepository.findById(monitorId);
      assert.equal(mon.status, 'healthy');
    });
  });

  // =========================================================================
  // 5. REAL CONTENT CHANGE (₹999 to ₹1,199 PRICE CHANGE)
  // =========================================================================
  describe('5. Real Content Change Detection & Numerical Intelligence', () => {
    it('detects a controlled price increase from ₹999 to ₹1,199, generates line diffs, calculates numerical delta, stores AI summary, and queues notification', async () => {
      // 1. Configure notification destination
      const dest = await destinationRepository.create({
        workspace_id: defaultWorkspace.id,
        name: 'Finance Alerts Discord',
        channel: 'discord',
        target_destination: 'https://discord.com/api/webhooks/mock/finance',
        config: { webhook_url: 'https://discord.com/api/webhooks/mock/finance' },
        triggers: {
          meaningful_change: true,
          high_importance_only: false,
          keywords: ['₹1,199'],
          monitor_failures: false
        }
      });

      // 2. Create monitor pointing to pricing-change v=1 (₹999)
      const monRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Studio Membership Price Monitor',
          url: `${baseUrl}/pricing-change?v=1`,
          check_cadence: '15m',
          mode: 'both',
          css_selector: 'main',
          notification_settings: {
            notify_on_change: true,
            keywords: ['₹1,199']
          }
        })
        .expect(201);

      const monitorId = monRes.body.data.id;

      // 3. Establish initial baseline
      const r1 = await monitorRunner.runCheck(monitorId);
      assert.equal(r1.isBaseline, true);

      // 4. Update monitor URL to simulate price increase to ₹1,199 (v=2)
      await monitorRepository.update(monitorId, { url: `${baseUrl}/pricing-change?v=2` });

      // 5. Run second check detecting price change
      const r2 = await monitorRunner.runCheck(monitorId);
      assert.equal(r2.status, 'completed');
      assert.equal(r2.hasChanged, true);
      assert.ok(r2.changeRecord);

      const changeId = r2.changeRecord.id;

      // 6. Verify change record structure
      const change = await changeRepository.findById(changeId);
      assert.ok(change);
      assert.equal(change.is_reviewed, false);
      assert.ok(change.title.includes('lines') || change.title.includes('content'));

      // 7. Verify text diff contains removed old price and added new price
      const diffData = typeof change.text_diff_json === 'string'
        ? JSON.parse(change.text_diff_json)
        : (change.text_diff_json || {});
      assert.ok(diffData);
      const hasOldPrice = (diffData.removedSample && diffData.removedSample.some(l => l.includes('₹999'))) ||
        (diffData.diffBlocks && diffData.diffBlocks.some(b => b.type === 'removed' && b.lines.some(l => l.includes('₹999'))));
      const hasNewPrice = (diffData.addedSample && diffData.addedSample.some(l => l.includes('₹1,199'))) ||
        (diffData.diffBlocks && diffData.diffBlocks.some(b => b.type === 'added' && b.lines.some(l => l.includes('₹1,199'))));
      assert.ok(hasOldPrice, 'Old price ₹999 should be captured in diff');
      assert.ok(hasNewPrice, 'New price ₹1,199 should be captured in diff');

      // 8. Verify deterministic numerical analyzer calculates delta
      const snap1 = await snapshotRepository.findById(change.baseline_snapshot_id);
      const snap2 = await snapshotRepository.findById(change.current_snapshot_id);
      const priceChanges = NumericalAnalyzer.analyzePriceChanges(snap1.text_content, snap2.text_content);

      assert.equal(priceChanges.length, 1);
      assert.equal(priceChanges[0].previous, 999);
      assert.equal(priceChanges[0].current, 1199);
      assert.equal(priceChanges[0].difference, 200);
      assert.equal(priceChanges[0].percentDelta, 20.02);
      assert.ok(priceChanges[0].explanation.includes('+20.02%'));

      // 9. Verify stored insight created and linked to change record
      const insight = await insightRepository.findByChangeId(changeId);
      assert.ok(insight, 'Insight should be generated for detected change');
      assert.equal(insight.detected_change_id, changeId);
      assert.ok(insight.summary.length > 0);

      // 10. Verify notification was dispatched to mock destination
      await notificationDispatcher.dispatchForChange({
        changeRecord: change,
        monitor: await monitorRepository.findById(monitorId),
        baselineSnapshot: snap1,
        currentSnapshot: snap2
      });

      assert.ok(dispatchedNotifications.length >= 1);
      const delivery = dispatchedNotifications[0];
      assert.equal(delivery.destination.name, 'Finance Alerts Discord');
      assert.ok(
        (delivery.payload?.monitorName && delivery.payload.monitorName.includes('Studio Membership')) ||
        (delivery.payload?.title && delivery.payload.title.length > 0)
      );

      // 11. Verify Visual Compare endpoint returns full comparison
      const compRes = await request(app)
        .get(`/api/monitors/${monitorId}/compare`)
        .expect(200);

      assert.equal(compRes.body.success, true);
      assert.equal(compRes.body.data.hasComparison, true);
      assert.ok(compRes.body.data.baseline);
      assert.ok(compRes.body.data.current);
      assert.equal(compRes.body.data.diff.hasChanged, true);
      assert.ok(compRes.body.data.timeline.length >= 2);
    });
  });

  // =========================================================================
  // 6. NOISE FILTERING & VOLATILE REGION SUPPRESSION
  // =========================================================================
  describe('6. Noise Filtering & Ignored Selectors', () => {
    it('suppresses dynamic timestamps and counters via ignored CSS selectors without hiding genuine changes', async () => {
      // 1. Create monitor targeting noisy page with ignored selectors
      const monRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Noise Filtered Catalog',
          url: `${baseUrl}/noisy-page?v=1`,
          check_cadence: '15m',
          ignored_selectors: '.timestamp, .ad-banner, .live-counter'
        })
        .expect(201);

      const monitorId = monRes.body.data.id;

      // Check 1: Baseline established
      const r1 = await monitorRunner.runCheck(monitorId);
      assert.equal(r1.isBaseline, true);

      // Check 2: Same content version (v=1), but timestamp and ad mutate on every render
      const r2 = await monitorRunner.runCheck(monitorId);
      assert.equal(r2.status, 'completed');
      assert.equal(r2.hasChanged, false, 'Noisy elements should be stripped; no change detected');

      // Check 3: Genuine content change occurs in catalog-desc (v=2) while noise continues mutating
      await monitorRepository.update(monitorId, { url: `${baseUrl}/noisy-page?v=2` });
      const r3 = await monitorRunner.runCheck(monitorId);
      assert.equal(r3.status, 'completed');
      assert.equal(r3.hasChanged, true, 'Meaningful description change must be detected');

      // Verify stripped text content contains description but not stripped elements
      const snap3 = await snapshotRepository.findById(r3.snapshotId);
      assert.ok(snap3.text_content.includes('Sculptural dark vessels'));
      assert.equal(snap3.text_content.includes('Promotional Banner'), false);
    });
  });

  // =========================================================================
  // 7. FAILURE CASES & FAULT RECOVERY
  // =========================================================================
  describe('7. Comprehensive Failure Handling & Recovery', () => {
    it('handles DNS / connection failure, records error category, degrades status, and preserves baseline', async () => {
      // Create baseline first
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'DNS Test', url: `${baseUrl}/unchanged`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;
      await monitorRunner.runCheck(monitorId);

      // Switch to unresolvable domain
      await monitorRepository.update(monitorId, { url: 'https://non-existent-domain-xyz-12345.com' });
      const result = await monitorRunner.runCheck(monitorId);

      assert.equal(result.status, 'failed');
      assert.ok(['DNS_FAILURE', 'NAVIGATION_FAILED', 'SECURITY_BLOCKED'].includes(result.category));

      // Monitor status degrades
      const mon = await monitorRepository.findById(monitorId);
      assert.equal(mon.status, 'degraded');
      assert.equal(mon.consecutive_failures, 1);

      // Baseline remains intact
      const snapshots = await snapshotRepository.findByMonitorId(monitorId);
      assert.equal(snapshots.snapshots.length, 1);
    });

    it('handles HTTP 500 error gracefully and preserves previous baseline', async () => {
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'HTTP Error Test', url: `${baseUrl}/unchanged`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;
      await monitorRunner.runCheck(monitorId);

      // Point to HTTP 500 endpoint
      await monitorRepository.update(monitorId, { url: `${baseUrl}/http-error` });
      const result = await monitorRunner.runCheck(monitorId);

      assert.equal(result.status, 'failed');
      assert.equal(result.category, 'HTTP_ERROR');

      const mon = await monitorRepository.findById(monitorId);
      assert.equal(mon.status, 'failing');
      assert.ok(mon.last_error.includes('500'));
    });

    it('detects Cloudflare bot challenge screens and categorizes as ACCESS_BLOCKED', async () => {
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'Challenge Test', url: `${baseUrl}/challenge`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;

      const result = await monitorRunner.runCheck(monitorId);
      assert.equal(result.status, 'failed');
      assert.equal(result.category, 'ACCESS_BLOCKED');

      const mon = await monitorRepository.findById(monitorId);
      assert.equal(mon.status, 'blocked');
      assert.ok(mon.last_error.includes('challenge') || mon.last_error.includes('human') || mon.last_error.includes('403'));
    });

    it('handles missing CSS selectors gracefully with SELECTOR_NOT_FOUND', async () => {
      const monRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Missing Selector Test',
          url: `${baseUrl}/missing-selector`,
          check_cadence: '15m',
          css_selector: '#does-not-exist'
        })
        .expect(201);
      const monitorId = monRes.body.data.id;

      const result = await monitorRunner.runCheck(monitorId);
      assert.equal(result.status, 'failed');
      assert.equal(result.category, 'SELECTOR_NOT_FOUND');
    });

    it('recovers from browser crash or unexpected disconnection without deadlocking pool', async () => {
      // Disconnect active browser instance deliberately without permanent shutdown
      const browser = await browserPool.getBrowser();
      await browser.close();
      browserPool.browser = null;

      // Next check should automatically re-launch a fresh browser instance
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'Browser Recovery Test', url: `${baseUrl}/unchanged`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;

      const result = await monitorRunner.runCheck(monitorId);
      assert.equal(result.status, 'completed');
      assert.equal(result.isBaseline, true);
    });

    it('falls back safely to deterministic summary when Gemini encounters an error or missing key', async () => {
      // Test deterministic fallback generator directly
      const fallback = geminiService.generateDeterministicFallback({
        websiteUrl: 'https://example.com',
        previousRelevantText: 'Old plan: ₹999/mo',
        currentRelevantText: 'New plan: ₹1,199/mo',
        textDiff: [{ added: true, value: '₹1,199' }, { removed: true, value: '₹999' }],
        metadata: { cssSelector: '.pricing' }
      }, 'Gemini quota exceeded');

      assert.ok(fallback.title);
      assert.ok(fallback.summary.includes('Deterministic Analysis'));
      assert.equal(fallback.model_version, 'deterministic-fallback');
      assert.equal(fallback.status, 'fallback');
    });
  });

  // =========================================================================
  // 8. DUPLICATE WORK & CONCURRENCY LIMITS
  // =========================================================================
  describe('8. Duplicate Prevention & Concurrency Control', () => {
    it('prevents concurrent checks on the same monitor using atomic lease lock', async () => {
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'Lock Test', url: `${baseUrl}/unchanged`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;

      // Start two simultaneous checks
      const [p1, p2] = await Promise.all([
        monitorRunner.runCheck(monitorId),
        monitorRunner.runCheck(monitorId)
      ]);

      const statuses = [p1.status, p2.status];
      // One check should succeed, the other should be skipped or rejected by lock
      assert.ok(statuses.includes('completed'));
      assert.ok(statuses.includes('skipped') || statuses.includes('locked'));
    });

    it('persists mark-as-reviewed toggle without affecting monitor operational health', async () => {
      // 1. Create monitor and trigger change
      const monRes = await request(app)
        .post('/api/monitors')
        .send({ name: 'Review Workflow Monitor', url: `${baseUrl}/text-change?v=1`, check_cadence: '15m' })
        .expect(201);
      const monitorId = monRes.body.data.id;

      await monitorRunner.runCheck(monitorId);
      await monitorRepository.update(monitorId, { url: `${baseUrl}/text-change?v=2` });
      const r2 = await monitorRunner.runCheck(monitorId);
      const changeId = r2.changeRecord.id;

      // Verify unreviewed initially
      let change = await changeRepository.findById(changeId);
      assert.equal(change.is_reviewed, false);

      // 2. Mark as reviewed via API
      const patchRes = await request(app)
        .patch(`/api/changes/${changeId}`)
        .send({ is_reviewed: true })
        .expect(200);

      assert.equal(patchRes.body.success, true);
      assert.equal(patchRes.body.data.is_reviewed, true);
      assert.ok(patchRes.body.data.reviewed_at);

      // Verify monitor operational status is preserved as degraded
      const mon = await monitorRepository.findById(monitorId);
      assert.equal(mon.status, 'degraded');
    });
  });

  // =========================================================================
  // 9. API CONTRACT & INTEGRATION SCHEMAS
  // =========================================================================
  describe('9. Frontend API Contract & Integration Endpoints', () => {
    it('validates response schema for all frontend core endpoints', async () => {
      // 1. GET /api/monitors
      const monRes = await request(app).get('/api/monitors').expect(200);
      assert.equal(monRes.body.success, true);
      assert.ok(Array.isArray(monRes.body.data));
      assert.ok(monRes.body.pagination);

      // 2. GET /api/changes
      const chgRes = await request(app).get('/api/changes').expect(200);
      assert.equal(chgRes.body.success, true);
      assert.ok(Array.isArray(chgRes.body.data));
      assert.ok(chgRes.body.pagination);

      // 3. GET /api/insights
      const insRes = await request(app).get('/api/insights').expect(200);
      assert.equal(insRes.body.success, true);
      assert.ok(Array.isArray(insRes.body.data));
      assert.ok(insRes.body.pagination);

      // 4. POST /api/insights/retry/:changeId (handles missing change safely)
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const retryRes = await request(app).post(`/api/insights/retry/${fakeUuid}`).expect(404);
      assert.equal(retryRes.body.success, false);
    });
  });
});

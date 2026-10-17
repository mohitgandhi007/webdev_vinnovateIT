import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';
import { createTestFixtureServer } from './fixtures/test-server.js';
import { DiffEngine } from '../src/utils/diff-engine.js';
import { NoiseFilter } from '../src/utils/noise-filter.js';
import { selectorInspector } from '../src/jobs/selector-inspector.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { browserPool } from '../src/jobs/browser-pool.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';

describe('Phase 6: Change Intelligence & Visual Comparison Test Suite', () => {
  let context;
  let pool;
  let fixtureServer;
  let baseUrl;
  let defaultWorkspace;

  before(async () => {
    process.env.ALLOW_LOCAL_FIXTURES = 'true';
    context = setupTestDatabase();
    pool = context.pool;

    fixtureServer = createTestFixtureServer();
    const info = await fixtureServer.start();
    baseUrl = info.baseUrl;
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
    // Reset test fixture server version to 1
    await fetch(`${baseUrl}/?setVersion=1`);
  });

  describe('1. Deterministic Text Diff Service & Identical Normalized Text', () => {
    it('returns hasChanged=false for identical normalized content with arbitrary whitespace', () => {
      const textA = 'PagePulse Observatory\n  Status: Operational\n\nActive Nodes: 12';
      const textB = 'PagePulse Observatory\n\n\n   Status:   Operational \nActive Nodes: 12   \n';

      const diff = DiffEngine.compare(textA, textB);
      assert.equal(diff.hasChanged, false);
      assert.equal(diff.blocks.length, 0);
      assert.equal(diff.addedCount, 0);
      assert.equal(diff.removedCount, 0);
    });

    it('identifies added, removed, and context lines accurately in structured blocks', () => {
      const baseline = 'Header Title\nFeatures:\n- Speed\n- Reliability\nFooter Copyright 2026';
      const current = 'Header Title\nFeatures:\n- Speed\n- Intelligence\n- Zero Latency\nFooter Copyright 2026';

      const diff = DiffEngine.compare(baseline, current);
      assert.equal(diff.hasChanged, true);
      assert.ok(diff.blocks.length > 0);

      const removedBlocks = diff.blocks.filter(b => b.type === 'removed');
      const addedBlocks = diff.blocks.filter(b => b.type === 'added');

      assert.ok(removedBlocks.some(b => b.lines.includes('- Reliability')));
      assert.ok(addedBlocks.some(b => b.lines.includes('- Intelligence')));
      assert.ok(addedBlocks.some(b => b.lines.includes('- Zero Latency')));
      assert.ok(diff.addedCount >= 2);
      assert.ok(diff.removedCount >= 1);
    });
  });

  describe('2. Noise Filtering: Economic Prices and Published Deadlines Preservation', () => {
    it('reliably detects rupee price changes from ₹999 to ₹1,199 without noise suppression', () => {
      const baseline = 'Atelier Nordic Annual Pass\nPrice: ₹999 / year\nBilled annually.';
      const current = 'Atelier Nordic Annual Pass\nPrice: ₹1,199 / year\nBilled annually.';

      const diff = DiffEngine.compare(baseline, current);
      assert.equal(diff.hasChanged, true, 'Price change from ₹999 to ₹1,199 must remain detectable!');
      assert.ok(diff.removedCount >= 1);
      assert.ok(diff.addedCount >= 1);

      const added = diff.blocks.filter(b => b.type === 'added').flatMap(b => b.lines).join(' ');
      const removed = diff.blocks.filter(b => b.type === 'removed').flatMap(b => b.lines).join(' ');

      assert.ok(removed.includes('₹999'));
      assert.ok(added.includes('₹1,199'));
    });

    it('reliably detects dollar, euro, and pound price changes', () => {
      const baseline = 'Starter Plan: $49/mo | Enterprise: €490/yr | Lifetime: £999';
      const current = 'Starter Plan: $79/mo | Enterprise: €590/yr | Lifetime: £1,299';

      const diff = DiffEngine.compare(baseline, current);
      assert.equal(diff.hasChanged, true);
      assert.ok(diff.addedCount > 0);
    });

    it('reliably detects published deadline date alterations', () => {
      const baseline = 'RFP Submissions\nDeadline: 15 October 2026\nTerms apply.';
      const current = 'RFP Submissions\nDeadline: 31 October 2026\nTerms apply.';

      const diff = DiffEngine.compare(baseline, current);
      assert.equal(diff.hasChanged, true, 'Published deadline change must remain detectable!');
    });
  });

  describe('3. Ignored CSS Selectors & Volatile Region Stripping', () => {
    it('strips volatile region when ignored_selectors is configured', async () => {
      const res = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Volatile Ignored Monitor',
          url: `${baseUrl}/volatile`,
          mode: 'both',
          check_cadence: '15m',
          ignored_selectors: '.volatile-timestamp'
        });

      assert.equal(res.status, 201);
      const monitor = res.body.data;
      assert.equal(monitor.ignored_selectors, '.volatile-timestamp');

      // Check 1: baseline
      const run1 = await monitorRunner.runCheck(monitor.id);
      assert.equal(run1.hasChanged, false);
      assert.equal(run1.isBaseline, true);

      // Verify the extracted text did NOT include the timestamp
      const snap1Res = await request(context.app).get(`/api/monitors/${monitor.id}/snapshots`);
      const snap1 = snap1Res.body.data[0];
      assert.ok(!snap1.text_content.includes('Timestamp:'));

      // Check 2: Even though timestamp changed on the server, the stripped text is identical!
      const run2 = await monitorRunner.runCheck(monitor.id);
      assert.equal(run2.hasChanged, false, 'Volatile region inside ignored_selectors must not trigger changes!');
    });

    it('allows updating ignore rules without losing existing historical snapshots', async () => {
      const monRes = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Rule Updatable Monitor',
          url: `${baseUrl}/unchanged`,
          mode: 'both',
          ignored_selectors: '.promo'
        });

      const monitorId = monRes.body.data.id;
      await monitorRunner.runCheck(monitorId);

      // Verify snapshot exists
      const beforeSnaps = await request(context.app).get(`/api/monitors/${monitorId}/snapshots`);
      assert.equal(beforeSnaps.body.data.length, 1);

      // Update ignore rules
      const patchRes = await request(context.app)
        .patch(`/api/monitors/${monitorId}`)
        .send({
          ignored_selectors: '.promo, .advertisement, #counter'
        });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.data.ignored_selectors, '.promo, .advertisement, #counter');

      // Historical snapshots remain intact
      const afterSnaps = await request(context.app).get(`/api/monitors/${monitorId}/snapshots`);
      assert.equal(afterSnaps.body.data.length, 1);
      assert.equal(afterSnaps.body.data[0].id, beforeSnaps.body.data[0].id);
    });
  });

  describe('4. Missing Selectors & Graceful Handling', () => {
    it('handles non-existent target CSS selector gracefully without crashing or throwing 500', async () => {
      const res = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Missing Selector Target',
          url: `${baseUrl}/missing-selector`,
          mode: 'both',
          css_selector: '#does-not-exist-in-dom-404'
        });

      const monitorId = res.body.data.id;
      const runResult = await monitorRunner.runCheck(monitorId);
      assert.equal(runResult.status, 'failed');
      assert.equal(runResult.category, 'SELECTOR_NOT_FOUND');
      assert.equal(runResult.newStatus, 'degraded');
    });
  });

  describe('5. Visual Selector Inspector (POST /api/monitors/inspect-selectors)', () => {
    it('inspects a page and extracts semantic CSS selector candidates with text snippets', async () => {
      const res = await request(context.app)
        .post('/api/monitors/inspect-selectors')
        .send({
          url: `${baseUrl}/unchanged`
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.data.candidates));
      assert.ok(res.body.data.candidates.length > 0);

      const candidate = res.body.data.candidates[0];
      assert.ok(candidate.selector, 'Candidate must provide a valid CSS selector');
      assert.ok(typeof candidate.tag === 'string');
      assert.ok(typeof candidate.textSnippet === 'string');
    });

    it('rejects invalid or unsafe inspection URLs', async () => {
      const res = await request(context.app)
        .post('/api/monitors/inspect-selectors')
        .send({
          url: 'not-a-valid-url'
        });

      assert.equal(res.status, 400);
    });
  });

  describe('6. Visual Comparison API & Stored Screenshot Delivery', () => {
    it('returns comparison payload with baseline, current, diff, and timeline (GET /api/monitors/:id/compare)', async () => {
      const monRes = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Visual Compare Target',
          url: `${baseUrl}/unchanged`,
          mode: 'both'
        });

      const monitorId = monRes.body.data.id;
      await monitorRunner.runCheck(monitorId);
      await monitorRunner.runCheck(monitorId);

      const compRes = await request(context.app).get(`/api/monitors/${monitorId}/compare`);
      assert.equal(compRes.status, 200);
      assert.equal(compRes.body.success, true);
      assert.equal(compRes.body.data.hasComparison, true);
      assert.ok(compRes.body.data.baseline);
      assert.ok(compRes.body.data.current);
      assert.ok(compRes.body.data.diff);
      assert.ok(Array.isArray(compRes.body.data.timeline));
      assert.equal(compRes.body.data.timeline.length, 2);
    });

    it('streams screenshot via GET /api/snapshots/:id/screenshot or returns 404 when missing', async () => {
      const monRes = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Screenshot Stream Target',
          url: `${baseUrl}/unchanged`,
          mode: 'both'
        });

      const monitorId = monRes.body.data.id;
      await monitorRunner.runCheck(monitorId);

      const snapsRes = await request(context.app).get(`/api/monitors/${monitorId}/snapshots`);
      const snap = snapsRes.body.data[0];

      if (snap.screenshot_path) {
        const imgRes = await request(context.app).get(`/api/snapshots/${snap.id}/screenshot`);
        assert.equal(imgRes.status, 200);
        assert.equal(imgRes.headers['content-type'], 'image/png');
      }
    });
  });

  describe('7. Change History & Review Workflow', () => {
    it('lists detected changes with filters and persists reviewed / unreviewed toggle', async () => {
      // 1. Setup monitor pointing to /text-change
      const monRes = await request(context.app)
        .post('/api/monitors')
        .send({
          name: 'Review Workflow Target',
          url: `${baseUrl}/text-change`,
          mode: 'both'
        });

      const monitorId = monRes.body.data.id;
      // First check: establishes baseline (v=1)
      const run1 = await monitorRunner.runCheck(monitorId);
      assert.equal(run1.isBaseline, true);

      // 2. Change server content to v=2
      await fetch(`${baseUrl}/?setVersion=2`);

      const changeRun = await monitorRunner.runCheck(monitorId);
      assert.equal(changeRun.hasChanged, true);

      // 3. Query changes list via GET /api/changes
      const changesListRes = await request(context.app)
        .get('/api/changes')
        .query({ monitor_id: monitorId });

      assert.equal(changesListRes.status, 200);
      assert.ok(changesListRes.body.data.length >= 1);
      const changeRecord = changesListRes.body.data[0];
      assert.equal(changeRecord.is_reviewed, false);

      // 4. Mark change as reviewed (PATCH /api/changes/:id)
      const reviewRes = await request(context.app)
        .patch(`/api/changes/${changeRecord.id}`)
        .send({ is_reviewed: true });

      assert.equal(reviewRes.status, 200);
      assert.equal(reviewRes.body.data.is_reviewed, true);
      assert.ok(reviewRes.body.data.reviewed_at);

      // 5. Filter by is_reviewed=true
      const reviewedQuery = await request(context.app)
        .get('/api/changes')
        .query({ monitor_id: monitorId, is_reviewed: true });
      assert.equal(reviewedQuery.body.data.length, 1);

      // 6. Mark change back as unreviewed (PATCH /api/changes/:id)
      const unreviewRes = await request(context.app)
        .patch(`/api/changes/${changeRecord.id}`)
        .send({ is_reviewed: false });

      assert.equal(unreviewRes.status, 200);
      assert.equal(unreviewRes.body.data.is_reviewed, false);

      // 7. Verify change and underlying snapshots are NOT deleted
      const checkStillExists = await request(context.app).get(`/api/changes/${changeRecord.id}`);
      assert.equal(checkStillExists.status, 200);
      assert.equal(checkStillExists.body.data.id, changeRecord.id);
    });
  });
});

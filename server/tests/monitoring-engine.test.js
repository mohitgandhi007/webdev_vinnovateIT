import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase } from './test-helper.js';
import { createTestFixtureServer } from './fixtures/test-server.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { browserPool } from '../src/jobs/browser-pool.js';
import { changeRepository } from '../src/repositories/change.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';


describe('Real Monitoring Engine & Lifecycle Test Suite', () => {
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
  });

  async function createTestMonitor({ urlPath, name, mode = 'both', cssSelector = '' }) {
    const url = `${baseUrl}${urlPath}`;
    const target = await canonicalTargetRepository.findOrCreate({
      url,
      cssSelector: cssSelector || '',
      viewportWidth: 1440,
      viewportHeight: 900
    });

    return await monitorRepository.create({
      workspace_id: defaultWorkspace.id,
      canonical_target_id: target.id,
      name,
      url,
      mode,
      check_cadence: '15m',
      css_selector: cssSelector || '',
      status: 'pending'
    });
  }

  it('1. establishes an initial baseline on the first check without creating a change alert', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/unchanged',
      name: 'Baseline Test Monitor'
    });

    const result = await monitorRunner.runCheck(monitor.id);

    assert.equal(result.status, 'completed');
    assert.equal(result.isBaseline, true);
    assert.equal(result.hasChanged, false);
    assert.equal(result.changeRecord, null);
    assert.ok(result.snapshotId);

    // Verify snapshot stored in database
    const snapshot = await snapshotRepository.findById(result.snapshotId);
    assert.ok(snapshot);
    assert.equal(snapshot.scan_number, 1);
    assert.ok(snapshot.text_content.includes('Atelier Nordic Stoneware'));
    assert.ok(snapshot.text_hash);

    // Verify monitor health updated to healthy
    const updatedMon = await monitorRepository.findById(monitor.id);
    assert.equal(updatedMon.status, 'healthy');
    assert.equal(updatedMon.consecutive_failures, 0);
    assert.ok(updatedMon.last_checked_at);
    assert.ok(updatedMon.next_check_at);

    // Verify NO change records were created in detected_changes
    const changes = await changeRepository.findByMonitorId(monitor.id);
    assert.equal(changes.changes.length, 0);
  });

  it('2. verifies that an unchanged page produces a snapshot without false change alerts', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/unchanged',
      name: 'Unchanged Page Monitor'
    });

    // Run baseline check
    const r1 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r1.isBaseline, true);

    // Run second check on unchanged content
    const r2 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r2.status, 'completed');
    assert.equal(r2.isBaseline, false);
    assert.equal(r2.hasChanged, false);
    assert.equal(r2.changeRecord, null);

    // Check that two snapshots exist with identical text hashes
    const snapshots = await snapshotRepository.findByMonitorId(monitor.id);
    assert.equal(snapshots.snapshots.length, 2);
    assert.equal(snapshots.snapshots[0].text_hash, snapshots.snapshots[1].text_hash);

    // Still 0 change alerts
    const changes = await changeRepository.findByMonitorId(monitor.id);
    assert.equal(changes.changes.length, 0);
  });

  it('3. detects genuine text changes, generates line diffs, and creates a change record', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/text-change?v=1',
      name: 'Text Change Monitor'
    });

    // 1. Establish baseline with Summer collection
    const r1 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r1.isBaseline, true);

    // 2. Change monitor URL to Autumn collection
    await monitorRepository.update(monitor.id, { url: `${baseUrl}/text-change?v=2` });

    // 3. Second check detects change
    const r2 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r2.status, 'completed');
    assert.equal(r2.hasChanged, true);
    assert.ok(r2.changeRecord);
    assert.equal(r2.changeRecord.change_type, 'both'); // Mode was both

    // Verify structured text diff in database
    const change = await changeRepository.findById(r2.changeRecord.id);
    assert.ok(change);
    assert.equal(change.is_reviewed, false);
    assert.ok(change.title.includes('lines') || change.title.includes('content'));

    // Verify monitor status updated to degraded (change alert)
    const updatedMon = await monitorRepository.findById(monitor.id);
    assert.equal(updatedMon.status, 'degraded');
    assert.ok(updatedMon.last_change_at);
  });

  it('4. loads and extracts client-side JavaScript rendered content with bounded wait', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/js-rendered',
      name: 'JavaScript Hydration Monitor'
    });

    const result = await monitorRunner.runCheck(monitor.id);
    assert.equal(result.status, 'completed');

    const snapshot = await snapshotRepository.findById(result.snapshotId);
    assert.ok(snapshot.text_content.includes('Hydrated Client Product Catalog'));
    assert.ok(snapshot.text_content.includes('Items rendered via JavaScript'));
  });

  it('5. extracts only targeted content when a CSS selector is specified', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/selected-css',
      name: 'Targeted CSS Selector Monitor',
      cssSelector: '#pricing-tier'
    });

    const result = await monitorRunner.runCheck(monitor.id);
    assert.equal(result.status, 'completed');

    const snapshot = await snapshotRepository.findById(result.snapshotId);
    // Extracted content should contain targeted tier
    assert.ok(snapshot.text_content.includes('Studio Subscription'));
    assert.ok(snapshot.text_content.includes('$49 / month'));
    // Ignored header and footer noise MUST NOT be in snapshot
    assert.equal(snapshot.text_content.includes('Ignored Banner Noise'), false);
    assert.equal(snapshot.text_content.includes('Ignored Footer'), false);
  });

  it('6. handles missing CSS selectors by recording an error without creating false changes', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/missing-selector',
      name: 'Missing Selector Monitor',
      cssSelector: '.non-existent-box'
    });

    const result = await monitorRunner.runCheck(monitor.id);
    assert.equal(result.status, 'failed');
    assert.equal(result.category, 'SELECTOR_NOT_FOUND');
    assert.ok(result.error.includes('Target CSS selector'));

    // Verify monitor health status set to degraded
    const updatedMon = await monitorRepository.findById(monitor.id);
    assert.equal(updatedMon.status, 'degraded');
    assert.equal(updatedMon.consecutive_failures, 1);
    assert.ok(updatedMon.last_error.includes('Target CSS selector'));

    // Verify NO snapshots or changes were falsely created
    const snapshots = await snapshotRepository.findByMonitorId(monitor.id);
    assert.equal(snapshots.snapshots.length, 0);
  });

  it('7. handles HTTP server errors gracefully and does not produce false change alerts', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/unchanged',
      name: 'HTTP Error Resilient Monitor'
    });

    // 1. Establish valid baseline
    const r1 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r1.isBaseline, true);

    // 2. Point URL to 500 error endpoint
    await monitorRepository.update(monitor.id, { url: `${baseUrl}/http-error` });

    // 3. Run check
    const r2 = await monitorRunner.runCheck(monitor.id);
    assert.equal(r2.status, 'failed');
    assert.equal(r2.category, 'HTTP_ERROR');

    // Verify previous snapshot was preserved
    const snapshots = await snapshotRepository.findByMonitorId(monitor.id);
    assert.equal(snapshots.snapshots.length, 1);
    assert.equal(snapshots.snapshots[0].id, r1.snapshotId);

    // Verify NO false change records created
    const changes = await changeRepository.findByMonitorId(monitor.id);
    assert.equal(changes.changes.length, 0);

    // Monitor status set to failing with failure count incremented
    const updatedMon = await monitorRepository.findById(monitor.id);
    assert.equal(updatedMon.status, 'failing');
    assert.equal(updatedMon.consecutive_failures, 1);
  });

  it('8. follows HTTP redirects and captures the final rendered page', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/redirect',
      name: 'Redirect Following Monitor'
    });

    const result = await monitorRunner.runCheck(monitor.id);
    assert.equal(result.status, 'completed');

    const snapshot = await snapshotRepository.findById(result.snapshotId);
    assert.ok(snapshot.text_content.includes('Atelier Nordic Stoneware'));
  });

  it('9. detects access challenges / bot verification screens and sets status to blocked', async () => {
    const monitor = await createTestMonitor({
      urlPath: '/challenge',
      name: 'Challenge Detection Monitor'
    });

    const result = await monitorRunner.runCheck(monitor.id);
    assert.equal(result.status, 'failed');
    assert.equal(result.category, 'ACCESS_BLOCKED');

    const updatedMon = await monitorRepository.findById(monitor.id);
    assert.equal(updatedMon.status, 'blocked');
  });

  it('10. captures and persists screenshots only when mode requires visual captures', async () => {
    // A. Visual mode: captures screenshot
    const visualMon = await createTestMonitor({
      urlPath: '/unchanged',
      name: 'Visual Monitor',
      mode: 'visual'
    });

    const rVisual = await monitorRunner.runCheck(visualMon.id);
    const snapVisual = await snapshotRepository.findById(rVisual.snapshotId);
    assert.ok(snapVisual.screenshot_path);
    assert.ok(snapVisual.screenshot_hash);

    // B. Text-only mode: avoids unnecessary screenshot capture
    const textMon = await createTestMonitor({
      urlPath: '/unchanged',
      name: 'Text-Only Monitor',
      mode: 'text'
    });

    const rText = await monitorRunner.runCheck(textMon.id);
    const snapText = await snapshotRepository.findById(rText.snapshotId);
    assert.equal(snapText.screenshot_path, null);
    assert.equal(snapText.screenshot_hash, null);
  });
});

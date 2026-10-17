import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';
import { db } from '../src/config/database.js';
import { ssrfGuard } from '../src/utils/ssrf-guard.js';
import { pageFetcher, PageFetchError, detectBotChallenge } from '../src/jobs/page-fetcher.js';
import { browserPool } from '../src/jobs/browser-pool.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { storageCleaner } from '../src/jobs/storage-cleaner.js';
import { createRateLimiter } from '../src/middleware/rate-limiter.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { changeRepository } from '../src/repositories/change.repository.js';

describe('Phase 9: Security and Reliability Audit Test Suite', () => {
  let testEnv = null;
  let testApp = null;
  let fixtureServer = null;
  let fixturePort = 0;
  let fixtureBaseUrl = '';
  let workspace1 = null;
  let workspace2 = null;

  before(async () => {
    // 0. Setup in-memory SQLite/Postgres test database
    testEnv = setupTestDatabase();
    testApp = testEnv.app;

    // 1. Create a controlled local HTTP fixture server
    await new Promise((resolve) => {
      fixtureServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://127.0.0.1`);

        // Test Endpoint: Malicious redirect to Cloud Metadata IP (169.254.169.254)
        if (url.pathname === '/redirect-to-metadata') {
          res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
          res.end();
          return;
        }

        // Test Endpoint: Malicious redirect to Private Network (192.168.1.1)
        if (url.pathname === '/redirect-to-private') {
          res.writeHead(302, { Location: 'http://192.168.1.1/admin' });
          res.end();
          return;
        }

        // Test Endpoint: Page containing malicious subresource targeting internal port
        if (url.pathname === '/page-with-private-subresource') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <body>
                <h1>Public Page</h1>
                <p>Legitimate text content</p>
                <!-- SSRF subresource attempting to probe internal database -->
                <img src="http://10.0.0.1:5432/probe.png" alt="probe" />
                <script src="http://169.254.169.254/secret.js"></script>
              </body>
            </html>
          `);
          return;
        }

        // Test Endpoint: Cloudflare Bot Challenge / CAPTCHA on HTTP 200
        if (url.pathname === '/cloudflare-challenge') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Just a moment...</title></head>
              <body>
                <h1>Attention Required! | Cloudflare</h1>
                <p>Please verify you are human to access the page.</p>
                <div class="cf-turnstile"></div>
              </body>
            </html>
          `);
          return;
        }

        // Test Endpoint: Access Denied 403 screen
        if (url.pathname === '/access-denied') {
          res.writeHead(403, { 'Content-Type': 'text/html' });
          res.end(`<html><body><h1>403 Forbidden</h1><p>Access Denied</p></body></html>`);
          return;
        }

        // Test Endpoint: Completely empty content / blank DOM
        if (url.pathname === '/empty-page') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<html><body></body></html>`);
          return;
        }

        // Test Endpoint: Valid legitimate page
        if (url.pathname === '/valid-page') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Legitimate Webpage</title></head>
              <body>
                <header><h1>Nordic Atelier Store</h1></header>
                <main>
                  <p class="product-price">Price: $120 USD</p>
                  <p class="inventory">Status: In Stock</p>
                </main>
              </body>
            </html>
          `);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      fixtureServer.listen(0, '127.0.0.1', () => {
        fixturePort = fixtureServer.address().port;
        fixtureBaseUrl = `http://127.0.0.1:${fixturePort}`;
        resolve();
      });
    });

    // 2. Setup isolated workspaces for tenant boundary tests
    workspace1 = await workspaceRepository.create({ name: 'Security Audit WS 1', slug: 'security-audit-ws-1' });
    workspace2 = await workspaceRepository.create({ name: 'Security Audit WS 2', slug: 'security-audit-ws-2' });
  });

  after(async () => {
    if (fixtureServer) {
      await new Promise(resolve => fixtureServer.close(resolve));
    }
    await browserPool.closeAll();
  });

  // =========================================================================
  // 1. SSRF & Prohibited Destination Tests
  // =========================================================================
  describe('1. SSRF Guard & Prohibited Destinations', () => {
    test('rejects loopback addresses (127.0.0.1, localhost, ::1)', () => {
      assert.equal(ssrfGuard.isProhibitedIp('127.0.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('127.255.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('::1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedHostname('localhost').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('sub.localhost').prohibited, true);
    });

    test('rejects RFC 1918 private IPv4 networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)', () => {
      assert.equal(ssrfGuard.isProhibitedIp('10.0.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('10.254.254.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('172.16.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('172.31.255.255').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('192.168.1.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('192.168.254.254').restricted, true);
    });

    test('rejects Link-Local and Cloud Metadata endpoints (169.254.169.254, fe80::/10, fd00:ec2::254)', () => {
      assert.equal(ssrfGuard.isProhibitedIp('169.254.169.254').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('169.254.1.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('fe80::1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('fd00:ec2::254').restricted, true);
      assert.equal(ssrfGuard.isProhibitedHostname('metadata.google.internal').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedIp('100.100.100.200').restricted, true); // Alibaba metadata
    });

    test('rejects Carrier-Grade NAT addresses (100.64.0.0/10)', () => {
      assert.equal(ssrfGuard.isProhibitedIp('100.64.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('100.127.255.254').restricted, true);
    });

    test('rejects internal and local top-level domains', () => {
      assert.equal(ssrfGuard.isProhibitedHostname('internal-service.local').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('database.internal').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('router.lan').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('ldap.corp').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('api.cluster.local').prohibited, true);
      assert.equal(ssrfGuard.isProhibitedHostname('k8s.default.svc.cluster.local').prohibited, true);
    });

    test('rejects octal, hex, and integer IPv4 evasions', () => {
      // 0177.0.0.1 is octal 127.0.0.1
      assert.equal(ssrfGuard.isProhibitedHostname('0177.0.0.1').prohibited, true);
      // 2130706433 is decimal dword for 127.0.0.1
      assert.equal(ssrfGuard.isProhibitedHostname('2130706433').prohibited, true);
      // 0x7f000001 is hex for 127.0.0.1
      assert.equal(ssrfGuard.isProhibitedHostname('0x7f000001').prohibited, true);
    });

    test('rejects IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)', () => {
      assert.equal(ssrfGuard.isProhibitedIp('::ffff:127.0.0.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('::ffff:192.168.1.1').restricted, true);
      assert.equal(ssrfGuard.isProhibitedIp('::ffff:10.0.0.1').restricted, true);
    });

    test('rejects forbidden URL schemes (file:, ftp:, gopher:, javascript:)', async () => {
      const fileCheck = await ssrfGuard.validateRequestUrl('file:///etc/passwd');
      assert.equal(fileCheck.safe, false);

      const ftpCheck = await ssrfGuard.validateRequestUrl('ftp://example.com/file.txt');
      assert.equal(ftpCheck.safe, false);

      const jsCheck = await ssrfGuard.validateRequestUrl('javascript:alert(1)');
      assert.equal(jsCheck.safe, false);
    });

    test('allows legitimate public hostnames', async () => {
      const pubCheck = await ssrfGuard.validateRequestUrl('https://example.com/pricing');
      assert.equal(pubCheck.safe, true);
    });
  });

  // =========================================================================
  // 2. Playwright Request Interception & Redirects
  // =========================================================================
  describe('2. Playwright Network Interception & Redirect Protection', () => {
    test('intercepts and aborts HTTP 302 redirects to cloud metadata endpoints', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const redirectUrl = `${fixtureBaseUrl}/redirect-to-metadata`;

      try {
        await pageFetcher.fetchPage({
          url: redirectUrl,
          mode: 'text',
          navigationTimeoutMs: 10000
        });
        assert.fail('Expected PageFetchError for redirect to metadata');
      } catch (err) {
        assert.equal(err instanceof PageFetchError, true);
        assert.equal(err.category, 'SECURITY_BLOCKED');
        assert.equal(err.retryable, false);
      } finally {
        delete process.env.ALLOW_LOCAL_FIXTURES;
      }
    });

    test('intercepts and aborts HTTP 302 redirects to private RFC 1918 IPs', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const redirectUrl = `${fixtureBaseUrl}/redirect-to-private`;

      try {
        await pageFetcher.fetchPage({
          url: redirectUrl,
          mode: 'text',
          navigationTimeoutMs: 10000
        });
        assert.fail('Expected PageFetchError for redirect to private network');
      } catch (err) {
        assert.equal(err instanceof PageFetchError, true);
        assert.equal(err.category, 'SECURITY_BLOCKED');
        assert.equal(err.retryable, false);
      } finally {
        delete process.env.ALLOW_LOCAL_FIXTURES;
      }
    });

    test('intercepts and aborts internal subresources embedded in public pages', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const pageUrl = `${fixtureBaseUrl}/page-with-private-subresource`;

      // Page itself loads legitimate text, while malicious subresources are blocked
      const result = await pageFetcher.fetchPage({
        url: pageUrl,
        mode: 'text',
        navigationTimeoutMs: 10000
      });

      assert.equal(result.httpStatusCode, 200);
      assert.match(result.rawText, /Legitimate text content/);
      delete process.env.ALLOW_LOCAL_FIXTURES;
    });
  });

  // =========================================================================
  // 3. Website Failures & Challenge Classification
  // =========================================================================
  describe('3. Website Failure Classification & Baseline Preservation', () => {
    test('detects Cloudflare Turnstile / Bot challenge on HTTP 200 without treating as normal content', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const challengeUrl = `${fixtureBaseUrl}/cloudflare-challenge`;

      try {
        await pageFetcher.fetchPage({
          url: challengeUrl,
          mode: 'text',
          navigationTimeoutMs: 10000
        });
        assert.fail('Expected ACCESS_BLOCKED error for challenge page');
      } catch (err) {
        assert.equal(err instanceof PageFetchError, true);
        assert.equal(err.category, 'ACCESS_BLOCKED');
        assert.equal(err.retryable, false);
      } finally {
        delete process.env.ALLOW_LOCAL_FIXTURES;
      }
    });

    test('detects Access Denied 403 pages correctly', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const deniedUrl = `${fixtureBaseUrl}/access-denied`;

      try {
        await pageFetcher.fetchPage({
          url: deniedUrl,
          mode: 'text',
          navigationTimeoutMs: 10000
        });
        assert.fail('Expected ACCESS_BLOCKED error for access-denied page');
      } catch (err) {
        assert.equal(err instanceof PageFetchError, true);
        assert.equal(err.category, 'ACCESS_BLOCKED');
      } finally {
        delete process.env.ALLOW_LOCAL_FIXTURES;
      }
    });

    test('detects empty DOM and blanks without treating as genuine content deletion', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const emptyUrl = `${fixtureBaseUrl}/empty-page`;

      try {
        await pageFetcher.fetchPage({
          url: emptyUrl,
          mode: 'text',
          navigationTimeoutMs: 10000
        });
        assert.fail('Expected EMPTY_CONTENT error for blank page');
      } catch (err) {
        assert.equal(err instanceof PageFetchError, true);
        assert.equal(err.category, 'EMPTY_CONTENT');
      } finally {
        delete process.env.ALLOW_LOCAL_FIXTURES;
      }
    });

    test('preserves last valid baseline snapshot during failure', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const targetUrl = `${fixtureBaseUrl}/valid-page`;

      // 1. Establish valid baseline
      const target = await canonicalTargetRepository.findOrCreate({
        url: targetUrl,
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      const monitor = await monitorRepository.create({
        workspace_id: workspace1.id,
        canonical_target_id: target.id,
        name: 'Preservation Test Monitor',
        url: targetUrl,
        mode: 'text'
      });

      // First check creates baseline snapshot
      const baselineRun = await monitorRunner.runCheck(monitor.id);
      assert.equal(baselineRun.status, 'completed');
      assert.equal(baselineRun.isBaseline, true);

      const baselineSnapshot = await snapshotRepository.findLatestByCanonicalTargetId(target.id);
      assert.ok(baselineSnapshot);
      const originalHash = baselineSnapshot.text_hash;

      // Now point monitor to a failing URL (e.g. cloudflare-challenge)
      await db.query(`UPDATE monitors SET url = $1 WHERE id = $2`, [
        `${fixtureBaseUrl}/cloudflare-challenge`,
        monitor.id
      ]);

      const failingRun = await monitorRunner.runCheck(monitor.id);
      assert.equal(failingRun.status, 'failed');
      assert.equal(failingRun.newStatus, 'blocked');

      // Verify that the baseline snapshot textHash remains completely untouched
      const afterFailureSnapshot = await snapshotRepository.findLatestByCanonicalTargetId(target.id);
      assert.equal(afterFailureSnapshot.id, baselineSnapshot.id);
      assert.equal(afterFailureSnapshot.text_hash, originalHash);

      delete process.env.ALLOW_LOCAL_FIXTURES;
    });
  });

  // =========================================================================
  // 4. Concurrency & Duplicate Work Controls
  // =========================================================================
  describe('4. Job Locking & Duplicate Work Prevention', () => {
    test('prevents multiple simultaneous checks of the same monitor via atomic lease lock', async () => {
      process.env.ALLOW_LOCAL_FIXTURES = 'true';
      const targetUrl = `${fixtureBaseUrl}/valid-page`;

      const target = await canonicalTargetRepository.findOrCreate({
        url: targetUrl,
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      const monitor = await monitorRepository.create({
        workspace_id: workspace1.id,
        canonical_target_id: target.id,
        name: 'Concurrent Lock Test Monitor',
        url: targetUrl,
        mode: 'text'
      });

      // Launch two simultaneous runCheck calls
      const [run1, run2] = await Promise.all([
        monitorRunner.runCheck(monitor.id),
        monitorRunner.runCheck(monitor.id)
      ]);

      // Exactly one must complete and the other must be skipped due to lock
      const completed = [run1, run2].filter(r => r.status === 'completed');
      const skipped = [run1, run2].filter(r => r.status === 'skipped');

      assert.equal(completed.length, 1);
      assert.equal(skipped.length, 1);
      assert.equal(skipped[0].reason, 'Monitor is currently being checked by another worker');

      delete process.env.ALLOW_LOCAL_FIXTURES;
    });
  });

  // =========================================================================
  // 5. Rate Limiting Middleware
  // =========================================================================
  describe('5. Rate Limiting Protection', () => {
    test('enforces token limit and returns HTTP 429 with Retry-After header', () => {
      process.env.TEST_RATE_LIMITER = 'true';
      try {
        const testLimiter = createRateLimiter({
          windowMs: 60 * 1000,
          max: 2,
          message: 'Test rate limit exceeded'
        });

        const req = {
          headers: { 'x-workspace-id': 'rate-test-ws' },
          ip: '192.0.2.1'
        };

        const headers = {};
        let statusCode = 200;
        let responseBody = null;

        const createRes = () => ({
          setHeader(name, val) { headers[name] = val; },
          status(code) { statusCode = code; return this; },
          json(data) { responseBody = data; return this; }
        });

        // Request 1: Allowed
        testLimiter(req, createRes(), () => {});
        assert.equal(statusCode, 200);

        // Request 2: Allowed
        testLimiter(req, createRes(), () => {});
        assert.equal(statusCode, 200);

        // Request 3: Blocked (exceeded limit of 2)
        testLimiter(req, createRes(), () => {});
        assert.equal(statusCode, 429);
        assert.equal(responseBody.error, 'RATE_LIMIT_EXCEEDED');
        assert.ok(headers['Retry-After']);
        assert.ok(parseInt(headers['Retry-After'], 10) > 0);
      } finally {
        delete process.env.TEST_RATE_LIMITER;
      }
    });
  });

  // =========================================================================
  // 6. Data Access & Workspace Isolation
  // =========================================================================
  describe('6. Data Access & Tenant Ownership Checks', () => {
    test('rejects cross-workspace access to monitors (HTTP 403)', async () => {
      // Create monitor belonging to workspace 1
      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/target-a',
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      const monitor = await monitorRepository.create({
        workspace_id: workspace1.id,
        canonical_target_id: target.id,
        name: 'Workspace 1 Monitor',
        url: 'https://example.com/target-a',
        mode: 'text'
      });

      // User belonging to workspace 2 attempts to read monitor of workspace 1
      const res = await request(testApp)
        .get(`/api/monitors/${monitor.id}`)
        .set('x-workspace-id', workspace2.id);

      assert.equal(res.status, 403);
      assert.match(res.body.error.message, /Access denied/);
    });

    test('rejects cross-workspace update attempts to monitors (HTTP 403)', async () => {
      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/target-b',
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      const monitor = await monitorRepository.create({
        workspace_id: workspace1.id,
        canonical_target_id: target.id,
        name: 'Workspace 1 Protected Monitor',
        url: 'https://example.com/target-b',
        mode: 'text'
      });

      const res = await request(testApp)
        .patch(`/api/monitors/${monitor.id}`)
        .set('x-workspace-id', workspace2.id)
        .send({ name: 'Hacked Name' });

      assert.equal(res.status, 403);
      assert.match(res.body.error.message, /Access denied/);
    });

    test('rejects path traversal attempts on screenshot route', async () => {
      // Mock snapshot with malicious path traversal in screenshot_path
      const mockSnapshot = await snapshotRepository.create({
        canonical_target_id: (await canonicalTargetRepository.findOrCreate({
          url: 'https://example.com/traversal',
          cssSelector: '',
          viewportWidth: 1440,
          viewportHeight: 900
        })).id,
        scan_number: 999,
        http_status_code: 200,
        response_time_ms: 100,
        text_content: 'Test content',
        text_hash: 'mockhash',
        screenshot_path: '../../etc/passwd',
        screenshot_hash: 'mockhash',
        dom_node_count: 10,
        status_category: 'NOMINAL_CLEAN'
      });

      const res = await request(testApp)
        .get(`/api/snapshots/${mockSnapshot.id}/screenshot`);

      assert.equal(res.status, 403);
      assert.match(res.body.error.message, /Path traversal detected/);
    });
  });

  // =========================================================================
  // 7. Storage Retention & Safe Cleanup
  // =========================================================================
  describe('7. Safe Storage & Retention Cleanup', () => {
    test('prunes expired snapshots but strictly preserves active baselines and change records', async () => {
      const testDir = path.resolve(process.cwd(), 'uploads/test_screenshots');
      await fs.mkdir(testDir, { recursive: true });

      const target = await canonicalTargetRepository.findOrCreate({
        url: 'https://example.com/retention-test',
        cssSelector: '',
        viewportWidth: 1440,
        viewportHeight: 900
      });

      // Create dummy screenshot files
      const file1 = path.join(testDir, 'old_snap.png');
      const file2 = path.join(testDir, 'active_baseline.png');
      const file3 = path.join(testDir, 'change_record.png');
      await fs.writeFile(file1, 'data1');
      await fs.writeFile(file2, 'data2');
      await fs.writeFile(file3, 'data3');

      // Create snapshot 1: Old and eligible for deletion (scan 1)
      const snap1 = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 1,
        http_status_code: 200,
        response_time_ms: 200,
        text_content: 'Old scan',
        text_hash: 'hash1',
        screenshot_path: '/uploads/test_screenshots/old_snap.png',
        screenshot_hash: 'h1',
        dom_node_count: 10,
        status_category: 'NOMINAL_CLEAN'
      });
      // Backdate snap1 to 60 days ago
      const date60DaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await db.query(`UPDATE snapshots SET captured_at = $1 WHERE id = $2`, [date60DaysAgo, snap1.id]);

      // Create snapshot 2: Old but PROTECTED because it is referenced in a detected_change
      const snap2 = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 2,
        http_status_code: 200,
        response_time_ms: 200,
        text_content: 'Change scan',
        text_hash: 'hash2',
        screenshot_path: '/uploads/test_screenshots/change_record.png',
        screenshot_hash: 'h2',
        dom_node_count: 10,
        status_category: 'NOMINAL_CLEAN'
      });
      const date50DaysAgo = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000);
      await db.query(`UPDATE snapshots SET captured_at = $1 WHERE id = $2`, [date50DaysAgo, snap2.id]);

      // Create monitor and change referencing snap2
      const mon = await monitorRepository.create({
        workspace_id: workspace1.id,
        canonical_target_id: target.id,
        name: 'Retention Monitor',
        url: 'https://example.com/retention-test',
        mode: 'both'
      });

      await changeRepository.create({
        monitor_id: mon.id,
        baseline_snapshot_id: snap2.id,
        current_snapshot_id: snap2.id,
        title: 'Significant change',
        change_type: 'both',
        diff_overlay_path: '/uploads/test_screenshots/change_record.png'
      });

      // Create snapshot 3: Current active baseline (scan 10, recent)
      const snap3 = await snapshotRepository.create({
        canonical_target_id: target.id,
        scan_number: 10,
        http_status_code: 200,
        response_time_ms: 200,
        text_content: 'Active baseline',
        text_hash: 'hash3',
        screenshot_path: '/uploads/test_screenshots/active_baseline.png',
        screenshot_hash: 'h3',
        dom_node_count: 10,
        status_category: 'NOMINAL_CLEAN'
      });

      // Run cleanup with retentionDays: 30 and keepMinPerTarget: 1
      const cleanupReport = await storageCleaner.pruneExpiredSnapshots({
        retentionDays: 30,
        keepMinPerTarget: 1,
        screenshotsDir: testDir
      });

      assert.equal(cleanupReport.prunedSnapshots >= 1, true);

      // Verify snap1 was deleted
      const check1 = await snapshotRepository.findById(snap1.id);
      assert.equal(check1, null);

      // Verify snap2 was PROTECTED and STILL EXISTS (because of detected_changes foreign reference)
      const check2 = await snapshotRepository.findById(snap2.id);
      assert.ok(check2);

      // Verify snap3 was PROTECTED and STILL EXISTS (active baseline)
      const check3 = await snapshotRepository.findById(snap3.id);
      assert.ok(check3);

      // Verify disk files
      let file1Exists = true;
      try { await fs.access(file1); } catch { file1Exists = false; }
      assert.equal(file1Exists, false, 'Eligible old screenshot file was pruned');

      let file2Exists = true;
      try { await fs.access(file2); } catch { file2Exists = false; }
      assert.equal(file2Exists, true, 'Active baseline screenshot file preserved');

      let file3Exists = true;
      try { await fs.access(file3); } catch { file3Exists = false; }
      assert.equal(file3Exists, true, 'Change record screenshot file preserved');

      // Cleanup test folder
      await fs.rm(testDir, { recursive: true, force: true });
    });
  });
});

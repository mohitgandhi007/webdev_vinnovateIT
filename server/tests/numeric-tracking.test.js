import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import http from 'node:http';
import { setupTestDatabase } from './test-helper.js';
import { workspaceRepository } from '../src/repositories/workspace.repository.js';
import { canonicalTargetRepository } from '../src/repositories/canonical-target.repository.js';
import { NumericParser } from '../src/utils/numeric-parser.js';
import { numericSeriesRepository } from '../src/repositories/numeric-series.repository.js';
import { monitorRepository } from '../src/repositories/monitor.repository.js';
import { snapshotRepository } from '../src/repositories/snapshot.repository.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { browserPool } from '../src/jobs/browser-pool.js';

describe('Phase: Optional Numerical Value Tracking Over Time', () => {
  let testEnv;
  let testServer;
  let testServerPort;
  let serverUrl;
  let defaultWorkspace;
  let serverState = {
    priceText: '$99.99',
    stockText: '14 in stock',
    statusCode: 200
  };

  before(async () => {
    process.env.ALLOW_LOCAL_FIXTURES = 'true';
    testEnv = setupTestDatabase();

    // Spawn a local test server for live capture checks
    testServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname === '/product') {
        if (serverState.statusCode !== 200) {
          res.writeHead(serverState.statusCode, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Product Observation</title></head>
            <body>
              <main>
                <h1>Nordic Minimalist Oak Chair</h1>
                <div id="price-tag">${serverState.priceText}</div>
                <div id="stock-level">${serverState.stockText}</div>
                <div id="ambiguous-range">Between $50 and $100</div>
              </main>
            </body>
          </html>
        `);
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise((resolve) => {
      testServer.listen(0, '127.0.0.1', () => {
        testServerPort = testServer.address().port;
        serverUrl = `http://127.0.0.1:${testServerPort}/product`;
        resolve();
      });
    });
  });

  after(async () => {
    delete process.env.ALLOW_LOCAL_FIXTURES;
    await browserPool.closeAll();
    if (testServer) {
      await new Promise(resolve => testServer.close(resolve));
    }
  });

  beforeEach(async () => {
    await testEnv.reset();
    defaultWorkspace = await workspaceRepository.findOrCreateDefault();
    serverState.priceText = '$99.99';
    serverState.stockText = '14 in stock';
    serverState.statusCode = 200;
  });

  async function createMonitor({ name = 'Tracker', numericSelector = null, numericUnit = null }) {
    const target = await canonicalTargetRepository.findOrCreate({
      url: serverUrl,
      cssSelector: '',
      viewportWidth: 1440,
      viewportHeight: 900
    });

    return await monitorRepository.create({
      workspace_id: defaultWorkspace.id,
      canonical_target_id: target.id,
      name,
      url: serverUrl,
      mode: 'both',
      check_cadence: '15m',
      status: 'pending',
      numeric_selector: numericSelector,
      numeric_unit: numericUnit
    });
  }

  describe('1. Conservative Numeric Parser Unit Tests', () => {
    it('parses decimal values accurately while preserving original raw string', () => {
      const testCases = [
        { input: '49.99', expectedNum: 49.99 },
        { input: '0.05', expectedNum: 0.05 },
        { input: '1234.5678', expectedNum: 1234.5678 },
        { input: '  100.00  ', expectedNum: 100.00, expectedRaw: '100.00' }
      ];

      for (const tc of testCases) {
        const res = NumericParser.parse(tc.input);
        assert.equal(res.isValid, true);
        assert.equal(res.numericValue, tc.expectedNum);
        assert.equal(res.rawValue, tc.expectedRaw || tc.input);
        assert.equal(res.errorReason, null);
      }
    });

    it('identifies currency formats and does not alter value', () => {
      const currencies = [
        { input: '$120.00', expectedVal: 120, expectedUnit: '$', expectedCategory: 'currency' },
        { input: '₹999', expectedVal: 999, expectedUnit: '₹', expectedCategory: 'currency' },
        { input: '€45.50', expectedVal: 45.5, expectedUnit: '€', expectedCategory: 'currency' },
        { input: '£1,250.00', expectedVal: 1250, expectedUnit: '£', expectedCategory: 'currency' },
        { input: '¥10,000', expectedVal: 10000, expectedUnit: '¥', expectedCategory: 'currency' }
      ];

      for (const c of currencies) {
        const res = NumericParser.parse(c.input);
        assert.equal(res.isValid, true, `Failed on ${c.input}`);
        assert.equal(res.numericValue, c.expectedVal);
        assert.equal(res.unit, c.expectedUnit);
        assert.equal(res.category, c.expectedCategory);
        assert.equal(res.rawValue, c.input);
      }
    });

    it('does NOT assume every number is a price (identifies quantities, counts, and percentages)', () => {
      const nonPrices = [
        { input: '1,250 users', expectedVal: 1250, expectedUnit: 'users', expectedCat: 'quantity' },
        { input: '14 in stock', expectedVal: 14, expectedUnit: 'in stock', expectedCat: 'quantity' },
        { input: '99.9%', expectedVal: 99.9, expectedUnit: '%', expectedCat: 'percentage' },
        { input: '42 items', expectedVal: 42, expectedUnit: 'items', expectedCat: 'quantity' },
        { input: '500 downloads', expectedVal: 500, expectedUnit: 'downloads', expectedCat: 'quantity' }
      ];

      for (const item of nonPrices) {
        const res = NumericParser.parse(item.input);
        assert.equal(res.isValid, true, `Failed on ${item.input}`);
        assert.equal(res.numericValue, item.expectedVal);
        assert.equal(res.unit, item.expectedUnit);
        assert.notEqual(res.category, 'currency', `Should not assume ${item.input} is a price`);
        assert.equal(res.category, item.expectedCat);
      }
    });

    it('correctly parses negative values and financial parentheses', () => {
      const negatives = [
        { input: '-14.5%', expectedVal: -14.5 },
        { input: '-$50.00', expectedVal: -50.00 },
        { input: '-42', expectedVal: -42 },
        { input: '($25.00)', expectedVal: -25.00 }
      ];

      for (const item of negatives) {
        const res = NumericParser.parse(item.input);
        assert.equal(res.isValid, true, `Failed on ${item.input}`);
        assert.equal(res.numericValue, item.expectedVal);
        assert.equal(res.rawValue, item.input);
      }
    });

    it('handles missing, null, and empty values gracefully without crashing', () => {
      const empties = [null, undefined, '', '   '];
      for (const empty of empties) {
        const res = NumericParser.parse(empty);
        assert.equal(res.isValid, false);
        assert.equal(res.numericValue, null);
        assert.ok(res.errorReason.length > 0);
      }
    });

    it('does not interpret ambiguous values without indicating that format could not be determined', () => {
      const ambiguousCases = [
        { input: 'Between $10 and $20', reasonKeyword: 'multiple' },
        { input: '$15 - $25', reasonKeyword: 'multiple' },
        { input: '1.2.3.4', reasonKeyword: 'Ambiguous' },
        { input: 'version 2.4.1', reasonKeyword: 'Ambiguous' },
        { input: 'Out of stock', reasonKeyword: 'No numeric' },
        { input: 'N/A', reasonKeyword: 'No numeric' },
        { input: 'Call for quote', reasonKeyword: 'No numeric' }
      ];

      for (const amb of ambiguousCases) {
        const res = NumericParser.parse(amb.input);
        assert.equal(res.isValid, false, `Expected ${amb.input} to be marked invalid`);
        assert.equal(res.numericValue, null);
        assert.equal(res.rawValue, amb.input);
        assert.ok(
          res.errorReason.toLowerCase().includes(amb.reasonKeyword.toLowerCase()),
          `Expected reason to contain "${amb.reasonKeyword}", got: "${res.errorReason}"`
        );
      }
    });

    it('respects optional custom unit overrides', () => {
      const res = NumericParser.parse('250', { customUnit: 'tokens' });
      assert.equal(res.isValid, true);
      assert.equal(res.numericValue, 250);
      assert.equal(res.unit, 'tokens');
    });
  });

  describe('2. Monitor Configuration with Numeric Selector', () => {
    it('allows configuring numeric_selector and numeric_unit', async () => {
      const res = await request(testEnv.app)
        .post('/api/monitors')
        .send({
          url: serverUrl,
          name: 'Oak Chair Tracker',
          check_cadence: '15m',
          numeric_selector: '#price-tag',
          numeric_unit: 'USD'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.numeric_selector, '#price-tag');
      assert.equal(res.body.data.numeric_unit, 'USD');
    });

    it('allows updating numeric_selector on existing monitor', async () => {
      const created = await createMonitor({
        name: 'Inventory Monitor'
      });

      const updatedRes = await request(testEnv.app)
        .patch(`/api/monitors/${created.id}`)
        .send({
          numeric_selector: '#stock-level',
          numeric_unit: 'units'
        });

      assert.equal(updatedRes.status, 200);
      assert.equal(updatedRes.body.data.numeric_selector, '#stock-level');
      assert.equal(updatedRes.body.data.numeric_unit, 'units');
    });

    it('does not make numeric tracking a prerequisite for core monitoring', async () => {
      const res = await request(testEnv.app)
        .post('/api/monitors')
        .send({
          url: serverUrl,
          name: 'Plain Monitor',
          check_cadence: '30m'
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.numeric_selector, null);
      assert.equal(res.body.data.numeric_unit, null);
    });
  });

  describe('3. Time Series Storage & History API', () => {
    it('records points and calculates increases, decreases, and deltas deterministically', async () => {
      const monitor = await createMonitor({
        name: 'Price Monitor',
        numericSelector: '#price-tag'
      });

      const snap1 = await snapshotRepository.create({
        canonical_target_id: monitor.canonical_target_id,
        scan_number: 1,
        http_status_code: 200,
        text_content: 'Nordic Chair $99.99',
        text_hash: 'hash1'
      });

      const snap2 = await snapshotRepository.create({
        canonical_target_id: monitor.canonical_target_id,
        scan_number: 2,
        http_status_code: 200,
        text_content: 'Nordic Chair $129.99',
        text_hash: 'hash2'
      });

      const snap3 = await snapshotRepository.create({
        canonical_target_id: monitor.canonical_target_id,
        scan_number: 3,
        http_status_code: 200,
        text_content: 'Nordic Chair $119.99',
        text_hash: 'hash3'
      });

      // Record 3 points in chronological sequence
      await numericSeriesRepository.recordPoint({
        monitor_id: monitor.id,
        snapshot_id: snap1.id,
        raw_text: '$99.99',
        parsed_value: 99.99,
        unit_or_currency: '$',
        is_valid: true,
        captured_at: new Date('2026-10-17T10:00:00Z')
      });

      await numericSeriesRepository.recordPoint({
        monitor_id: monitor.id,
        snapshot_id: snap2.id,
        raw_text: '$129.99',
        parsed_value: 129.99,
        unit_or_currency: '$',
        is_valid: true,
        captured_at: new Date('2026-10-17T10:15:00Z')
      });

      await numericSeriesRepository.recordPoint({
        monitor_id: monitor.id,
        snapshot_id: snap3.id,
        raw_text: '$119.99',
        parsed_value: 119.99,
        unit_or_currency: '$',
        is_valid: true,
        captured_at: new Date('2026-10-17T10:30:00Z')
      });

      // Query metrics via API
      const res = await request(testEnv.app)
        .get(`/api/monitors/${monitor.id}/metrics`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.hasNumericTracking, true);
      assert.equal(res.body.data.points.length, 3);

      const [p1, p2, p3] = res.body.data.points;

      // First point: baseline
      assert.equal(p1.parsedValue, 99.99);
      assert.equal(p1.delta, null);
      assert.equal(p1.changeType, 'none');
      assert.equal(p1.snapshotId, snap1.id);

      // Second point: increase (+30)
      assert.equal(p2.parsedValue, 129.99);
      assert.equal(p2.delta, 30);
      assert.equal(p2.changeType, 'increase');
      assert.equal(p2.snapshotId, snap2.id);

      // Third point: decrease (-10)
      assert.equal(p3.parsedValue, 119.99);
      assert.equal(p3.delta, -10);
      assert.equal(p3.changeType, 'decrease');
      assert.equal(p3.snapshotId, snap3.id);

      // Summary checks
      const summary = res.body.data.summary;
      assert.equal(summary.initialValue, 99.99);
      assert.equal(summary.latestValue, 119.99);
      assert.equal(summary.min, 99.99);
      assert.equal(summary.max, 129.99);
      assert.equal(summary.totalDelta, 20);
    });

    it('returns empty tracking status when monitor has no numeric selector', async () => {
      const monitor = await createMonitor({
        name: 'Untracked Monitor'
      });

      const res = await request(testEnv.app)
        .get(`/api/monitors/${monitor.id}/metrics`);

      assert.equal(res.status, 200);
      assert.equal(res.body.data.hasNumericTracking, false);
      assert.equal(res.body.data.points.length, 0);
    });
  });

  describe('4. End-to-End Live Check & Failure Isolation', () => {
    it('extracts displayed value from successful capture and stores point', async () => {
      serverState.priceText = '$149.00';

      const monitor = await createMonitor({
        name: 'E2E Oak Chair Tracker',
        numericSelector: '#price-tag'
      });

      // Run live check
      const result = await monitorRunner.runCheck(monitor.id);
      assert.equal(result.newStatus, 'healthy');

      // Verify recorded point
      const metricsRes = await request(testEnv.app)
        .get(`/api/monitors/${monitor.id}/metrics`);

      assert.equal(metricsRes.status, 200);
      assert.equal(metricsRes.body.data.points.length, 1);
      const point = metricsRes.body.data.points[0];
      assert.equal(point.rawText, '$149.00');
      assert.equal(point.parsedValue, 149);
      assert.equal(point.unit, '$');
      assert.equal(point.isValid, true);
      assert.ok(point.snapshotId);
    });

    it('AVOIDS recording a data point from failed captures (Requirement 12)', async () => {
      const monitor = await createMonitor({
        name: 'Fail Safe Monitor',
        numericSelector: '#price-tag'
      });

      // 1. Establish successful baseline
      serverState.statusCode = 200;
      serverState.priceText = '$89.00';
      await monitorRunner.runCheck(monitor.id);

      const metricsBefore = await numericSeriesRepository.findByMonitorId(monitor.id);
      assert.equal(metricsBefore.length, 1);

      // 2. Simulate server failure (HTTP 500)
      serverState.statusCode = 500;
      const failResult = await monitorRunner.runCheck(monitor.id);
      assert.equal(failResult.newStatus, 'failing');

      // 3. Verify zero metric points were recorded from failed capture
      const metricsAfter = await numericSeriesRepository.findByMonitorId(monitor.id);
      assert.equal(metricsAfter.length, 1, 'Failed capture must NOT insert any metric data point');
    });

    it('records ambiguous values with is_valid=false and explicit error reason during live capture', async () => {
      const monitor = await createMonitor({
        name: 'Ambiguous Tracker',
        numericSelector: '#ambiguous-range'
      });

      serverState.statusCode = 200;
      await monitorRunner.runCheck(monitor.id);

      const metricsRes = await request(testEnv.app)
        .get(`/api/monitors/${monitor.id}/metrics`);

      assert.equal(metricsRes.status, 200);
      assert.equal(metricsRes.body.data.points.length, 1);
      const pt = metricsRes.body.data.points[0];
      assert.equal(pt.isValid, false);
      assert.equal(pt.parsedValue, null);
      assert.equal(pt.rawText, 'Between $50 and $100');
      assert.ok(pt.errorReason.includes('multiple'));
    });
  });
});

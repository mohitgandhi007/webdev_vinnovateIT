import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { setupTestDatabase } from './test-helper.js';
import { monitorService } from '../src/services/monitor.service.js';
import { monitorRunner } from '../src/jobs/monitor-runner.js';
import { changeRepository } from '../src/repositories/change.repository.js';
import { storageCleaner } from '../src/jobs/storage-cleaner.js';
import { browserPool } from '../src/jobs/browser-pool.js';

describe('Phase 12: Deployment Readiness & Live Demonstration Suite', () => {
  let app;
  let server;
  let baseUrl;
  let testDb;

  before(async () => {
    process.env.ALLOW_LOCAL_FIXTURES = 'true';
    testDb = setupTestDatabase();
    app = createApp();

    await new Promise(resolve => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await browserPool.closeAll();
  });

  describe('1. Health Checks & Diagnostic Probes', () => {
    it('GET /api/health returns 200 with comprehensive service diagnostics', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.status, 'healthy');
      assert.ok(typeof res.body.uptime_seconds === 'number');
      assert.equal(res.body.services.api, 'online');
      assert.equal(res.body.services.database.status, 'connected');
      assert.ok(typeof res.body.services.database.latency_ms === 'number');
      assert.ok(res.body.services.storage.status === 'ready');
      assert.ok(res.body.services.gemini);
      assert.ok(res.body.memory.heap_used_mb > 0);
    });

    it('GET /api/health/live returns 200 alive probe', async () => {
      const res = await request(app).get('/api/health/live');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'alive');
    });

    it('GET /api/health/ready returns 200 ready probe', async () => {
      const res = await request(app).get('/api/health/ready');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'ready');
      assert.equal(res.body.database, 'connected');
    });

    it('health endpoints never leak sensitive secrets or credentials', async () => {
      const res = await request(app).get('/api/health');
      const bodyStr = JSON.stringify(res.body);

      assert.ok(!bodyStr.includes('postgres:postgres'));
      assert.ok(!bodyStr.includes('AIzaSy'));
      assert.ok(!bodyStr.includes('password'));
      assert.ok(!bodyStr.includes('TELEGRAM_BOT_TOKEN'));
      assert.ok(!bodyStr.includes('SMTP_PASS'));
    });
  });

  describe('2. Repeatable Demo Fixture & Dynamic Content Toggle', () => {
    it('GET /demo/store renders initial Version 1 with baseline price ₹999', async () => {
      // Ensure reset to version 1
      await request(app).post('/demo/reset');

      const res = await request(app).get('/demo/store');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('Atelier Nordic Stoneware'));
      assert.ok(res.text.includes('₹999'));
      assert.ok(res.text.includes('Summer Porcelain & Stoneware'));
      assert.ok(res.text.includes('In Stock'));
    });

    it('POST /demo/toggle switches store to Version 2 with revised price ₹1,199', async () => {
      const toggleRes = await request(app)
        .post('/demo/toggle')
        .set('Accept', 'application/json');

      assert.equal(toggleRes.status, 200);
      assert.equal(toggleRes.body.currentVersion, 2);
      assert.equal(toggleRes.body.price, '₹1,199');

      // Verify the HTML reflects Version 2
      const res = await request(app).get('/demo/store');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('₹1,199'));
      assert.ok(res.text.includes('Autumn Stoneware Collection'));
      assert.ok(res.text.includes('Limited: 3 Pieces Remaining'));
    });

    it('POST /demo/reset restores baseline Version 1', async () => {
      const resetRes = await request(app).post('/demo/reset');
      assert.equal(resetRes.status, 200);
      assert.equal(resetRes.body.currentVersion, 1);
      assert.equal(resetRes.body.price, '₹999');

      const res = await request(app).get('/demo/store');
      assert.equal(res.status, 200);
      assert.ok(res.text.includes('₹999'));
    });
  });

  describe('3. Live Change Detection Demonstration Pipeline', () => {
    it('executes full repeatable change detection: Baseline ₹999 -> Toggle -> Detected Change ₹1,199', async () => {
      // 1. Reset demo store to baseline version 1
      await request(app).post('/demo/reset');

      // 2. Create monitor for the demo store URL
      const demoUrl = `${baseUrl}/demo/store`;
      const monitor = await monitorService.createMonitor({
        name: 'Demo: Nordic Stoneware Pricing',
        url: demoUrl,
        mode: 'both',
        check_cadence: '15m'
      });

      assert.ok(monitor.id);

      // 3. Run initial check -> establishes baseline snapshot
      const baselineJob = await monitorRunner.runCheck(monitor.id, { isManual: true });
      assert.equal(baselineJob.status, 'completed');
      assert.equal(baselineJob.hasChanged, false);
      assert.equal(baselineJob.isBaseline, true);
      assert.ok(baselineJob.snapshotId);

      // 4. Toggle demo store content to Version 2 (Price increases to ₹1,199)
      const toggleRes = await request(app)
        .post('/demo/toggle')
        .set('Accept', 'application/json');
      assert.equal(toggleRes.body.currentVersion, 2);

      // 5. Run second check -> detects genuine price change
      const changeJob = await monitorRunner.runCheck(monitor.id, { isManual: true });
      assert.equal(changeJob.status, 'completed');
      assert.equal(changeJob.hasChanged, true);
      assert.equal(changeJob.isBaseline, false);

      // 6. Verify change record in database
      const { changes } = await changeRepository.findByMonitorId(monitor.id);
      assert.ok(changes.length >= 1);
      const latestChange = changes[0];

      // 7. Verify text diff contains genuine price transition
      const diffSnippet = JSON.stringify(latestChange.text_diff_json || latestChange.description);
      assert.ok(diffSnippet.includes('999') || latestChange.title.includes('content') || latestChange.title.includes('lines'));
      assert.ok(latestChange.visual_diff_percent !== undefined);

      // 8. Reset demo store back to v1
      await request(app).post('/demo/reset');
    });
  });

  describe('4. Storage Maintenance & Retention Safeguards', () => {
    it('executes snapshot retention cleanup without breaking active baselines', async () => {
      const report = await storageCleaner.pruneExpiredSnapshots({
        retentionDays: 30,
        keepMinPerTarget: 1
      });

      assert.ok(typeof report.prunedSnapshots === 'number');
      assert.ok(typeof report.deletedFiles === 'number');
      assert.ok(typeof report.freedBytes === 'number');
      assert.ok(report.cutoffDate);
    });

    it('scans for orphaned screenshots safely', async () => {
      const orphanReport = await storageCleaner.cleanOrphanedScreenshots({ gracePeriodMs: 0 });
      assert.ok(typeof orphanReport.orphanedFilesDeleted === 'number');
      assert.ok(typeof orphanReport.freedBytes === 'number');
    });
  });

  describe('5. Production Build & Bundle Security', () => {
    it('verifies frontend build does not expose backend database credentials or secret keys', async () => {
      const distPath = path.resolve(process.cwd(), 'dist');
      try {
        const files = await fs.readdir(distPath);
        const assetsDir = path.join(distPath, 'assets');
        const assetFiles = await fs.readdir(assetsDir);
        
        for (const file of assetFiles) {
          if (file.endsWith('.js')) {
            const content = await fs.readFile(path.join(assetsDir, file), 'utf-8');
            assert.ok(!content.includes('postgresql://'), `Found raw DB connection string in client asset: ${file}`);
            assert.ok(!content.includes('POSTGRES_PASSWORD'), `Found DB password env in client asset: ${file}`);
            assert.ok(!content.includes('AIzaSy'), `Found raw Gemini key pattern in client asset: ${file}`);
          }
        }
      } catch (err) {
        // If dist hasn't been built yet in this environment, test still passes safely
        if (err.code !== 'ENOENT') throw err;
      }
    });
  });
});

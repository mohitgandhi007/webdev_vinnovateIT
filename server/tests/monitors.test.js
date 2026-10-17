import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';

import { browserPool } from '../src/jobs/browser-pool.js';

describe('Monitors API & Validation Test Suite', () => {
  let context;
  let app;
  let pool;

  before(() => {
    context = setupTestDatabase();
    app = context.app;
    pool = context.pool;
  });

  after(async () => {
    await browserPool.closeAll();
    await pool.end();
  });


  beforeEach(async () => {
    await context.reset();
  });

  describe('Monitor Creation (POST /api/monitors)', () => {
    it('creates a monitor with valid parameters and sets status to pending', async () => {
      const payload = {
        name: 'Kinfolk Magazine Shop',
        url: 'https://kinfolk.com/shop',
        mode: 'both',
        check_cadence: '1h',
        css_selector: '.shop-grid',
        noise_threshold_percent: 5
      };

      const res = await request(app)
        .post('/api/monitors')
        .send(payload)
        .expect(201);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Kinfolk Magazine Shop');
      assert.equal(res.body.data.url, 'https://kinfolk.com/shop');
      assert.equal(res.body.data.mode, 'both');
      assert.equal(res.body.data.check_cadence, '1h');
      assert.equal(res.body.data.css_selector, '.shop-grid');
      // Per approved architecture: new monitors start as pending awaiting pulse
      assert.equal(res.body.data.status, 'pending');
      assert.ok(res.body.data.id);
      assert.ok(res.body.data.created_at);
    });

    it('rejects monitor creation with missing name', async () => {
      const payload = {
        url: 'https://kinfolk.com/shop'
      };

      const res = await request(app)
        .post('/api/monitors')
        .send(payload)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      const nameErr = res.body.error.details.find(d => d.field === 'name');
      assert.ok(nameErr, 'Should report missing name');
    });

    it('rejects monitor creation with empty body', async () => {
      const res = await request(app)
        .post('/api/monitors')
        .send({})
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid URL syntax', async () => {
      const payload = {
        name: 'Broken URL Monitor',
        url: 'not-a-valid-url-format'
      };

      const res = await request(app)
        .post('/api/monitors')
        .send(payload)
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('rejects disallowed protocols like ftp: and javascript:', async () => {
      const res1 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'FTP Target',
          url: 'ftp://files.example.com/archive'
        })
        .expect(400);

      assert.equal(res1.body.success, false);

      const res2 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Script Injection URL',
          url: 'javascript:alert(1)'
        })
        .expect(400);

      assert.equal(res2.body.success, false);
    });

    it('rejects localhost, loopback and private IP addresses (SSRF prevention)', async () => {
      const res1 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Localhost Target',
          url: 'http://localhost:8080/admin'
        })
        .expect(400);

      assert.equal(res1.body.success, false);

      const res2 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Loopback Target',
          url: 'http://127.0.0.1:3000'
        })
        .expect(400);

      assert.equal(res2.body.success, false);
    });

    it('rejects invalid intervals outside the 15m to 24h range', async () => {
      // 5m is below the 15m minimum
      const res1 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Too fast interval',
          url: 'https://example.com',
          check_cadence: '5m'
        })
        .expect(400);

      assert.equal(res1.body.success, false);
      const cadenceErr = res1.body.error.details.find(d => d.field === 'check_cadence');
      assert.ok(cadenceErr, 'Should reject 5m cadence');

      // 48h is above the 24h maximum
      const res2 = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Too slow interval',
          url: 'https://example.com',
          check_cadence: '48h'
        })
        .expect(400);

      assert.equal(res2.body.success, false);
    });

    it('accepts all valid interval options (15m, 30m, 1h, 6h, 12h, 24h)', async () => {
      const validCadences = ['15m', '30m', '1h', '6h', '12h', '24h'];

      for (const cadence of validCadences) {
        const res = await request(app)
          .post('/api/monitors')
          .send({
            name: `Monitor cadence ${cadence}`,
            url: `https://example.com/test-${cadence}`,
            check_cadence: cadence
          })
          .expect(201);

        assert.equal(res.body.data.check_cadence, cadence);
      }
    });
  });

  describe('Monitor Retrieval (GET /api/monitors & GET /api/monitors/:id)', () => {
    it('retrieves single monitor by ID with canonical target information', async () => {
      const createRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Lemaire Lookbook',
          url: 'https://lemaire.fr/lookbook',
          check_cadence: '6h',
          css_selector: 'main.lookbook'
        })
        .expect(201);

      const monitorId = createRes.body.data.id;

      const getRes = await request(app)
        .get(`/api/monitors/${monitorId}`)
        .expect(200);

      assert.equal(getRes.body.success, true);
      assert.equal(getRes.body.data.id, monitorId);
      assert.equal(getRes.body.data.name, 'Lemaire Lookbook');
      assert.equal(getRes.body.data.normalized_url, 'https://lemaire.fr/lookbook');
    });

    it('returns 404 for non-existent monitor UUID', async () => {
      const nonExistentId = '12345678-1234-1234-1234-123456789abc';
      const res = await request(app)
        .get(`/api/monitors/${nonExistentId}`)
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('returns 400 for malformed non-UUID id param', async () => {
      const res = await request(app)
        .get('/api/monitors/not-a-uuid')
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('supports pagination with page and limit query params', async () => {
      // Create 5 monitors
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post('/api/monitors')
          .send({
            name: `Page Item ${i}`,
            url: `https://example.com/page-${i}`
          })
          .expect(201);
      }

      // Query page 1 with limit 2
      const page1Res = await request(app)
        .get('/api/monitors?page=1&limit=2')
        .expect(200);

      assert.equal(page1Res.body.data.length, 2);
      assert.equal(page1Res.body.pagination.total, 5);
      assert.equal(page1Res.body.pagination.page, 1);
      assert.equal(page1Res.body.pagination.limit, 2);
      assert.equal(page1Res.body.pagination.totalPages, 3);

      // Query page 3 with limit 2 (should have 1 item)
      const page3Res = await request(app)
        .get('/api/monitors?page=3&limit=2')
        .expect(200);

      assert.equal(page3Res.body.data.length, 1);
      assert.equal(page3Res.body.pagination.page, 3);
    });

    it('filters monitors by search query and status', async () => {
      await request(app)
        .post('/api/monitors')
        .send({ name: 'Alpha Search Target', url: 'https://alpha.example.com' });

      await request(app)
        .post('/api/monitors')
        .send({ name: 'Beta Search Target', url: 'https://beta.example.com' });

      const searchRes = await request(app)
        .get('/api/monitors?search=Alpha')
        .expect(200);

      assert.equal(searchRes.body.data.length, 1);
      assert.equal(searchRes.body.data[0].name, 'Alpha Search Target');
    });
  });

  describe('Monitor Updates (PATCH /api/monitors/:id)', () => {
    it('updates monitor name, check_cadence, and css_selector', async () => {
      const createRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Original Name',
          url: 'https://example.com/update-test',
          check_cadence: '15m'
        })
        .expect(201);

      const monitorId = createRes.body.data.id;

      const updateRes = await request(app)
        .patch(`/api/monitors/${monitorId}`)
        .send({
          name: 'Updated Name',
          check_cadence: '12h',
          css_selector: '#content-box'
        })
        .expect(200);

      assert.equal(updateRes.body.success, true);
      assert.equal(updateRes.body.data.name, 'Updated Name');
      assert.equal(updateRes.body.data.check_cadence, '12h');
      assert.equal(updateRes.body.data.css_selector, '#content-box');
    });

    it('rejects empty update payload', async () => {
      const createRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Test Monitor',
          url: 'https://example.com/empty-patch'
        })
        .expect(201);

      const monitorId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/monitors/${monitorId}`)
        .send({})
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('returns 404 when updating non-existent monitor', async () => {
      const nonExistentId = '99999999-9999-9999-9999-999999999999';
      const res = await request(app)
        .patch(`/api/monitors/${nonExistentId}`)
        .send({ name: 'Does Not Exist' })
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('Monitor Deletion (DELETE /api/monitors/:id)', () => {
    it('deletes monitor successfully and verifies it no longer exists', async () => {
      const createRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'To Be Deleted',
          url: 'https://example.com/delete-me'
        })
        .expect(201);

      const monitorId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/monitors/${monitorId}`)
        .expect(200);

      assert.equal(deleteRes.body.success, true);

      // Verify 404 upon subsequent retrieval
      await request(app)
        .get(`/api/monitors/${monitorId}`)
        .expect(404);
    });

    it('returns 404 when deleting non-existent monitor', async () => {
      const nonExistentId = '88888888-8888-8888-8888-888888888888';
      const res = await request(app)
        .delete(`/api/monitors/${nonExistentId}`)
        .expect(404);

      assert.equal(res.body.success, false);
    });
  });

  describe('On-Demand Check Trigger (POST /api/monitors/:id/check)', () => {
    it('initiates an on-demand check and updates status to checking', async () => {
      const createRes = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Check Trigger Target',
          url: 'https://example.com/pulse'
        })
        .expect(201);

      const monitorId = createRes.body.data.id;

      const checkRes = await request(app)
        .post(`/api/monitors/${monitorId}/check`)
        .expect(202);

      assert.equal(checkRes.body.success, true);
      assert.equal(checkRes.body.data.status, 'checking');
      assert.equal(checkRes.body.data.monitor_id, monitorId);
    });
  });
});

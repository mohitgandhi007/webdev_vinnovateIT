import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';

describe('Health API Endpoint', () => {
  let app;
  let pool;

  before(() => {
    const context = setupTestDatabase();
    app = context.app;
    pool = context.pool;
  });

  after(async () => {
    await pool.end();
  });

  it('GET /api/health should return 200 with service status and database connectivity', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.status, 'healthy');
    assert.equal(res.body.services.api, 'online');
    assert.equal(res.body.services.database.status, 'connected');
    assert.ok(typeof res.body.services.database.latency_ms === 'number');
    assert.ok(typeof res.body.uptime_seconds === 'number');
    assert.ok(res.body.timestamp);
  });
});

import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestDatabase } from './test-helper.js';

describe('Database Constraints & Relational Integrity', () => {
  let context;
  let pool;

  before(() => {
    context = setupTestDatabase();
    pool = context.pool;
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await context.reset();
  });

  it('enforces foreign key constraint: monitor cannot reference non-existent workspace', async () => {
    const fakeWorkspaceId = '00000000-0000-0000-0000-000000000000';
    
    // First create a canonical target
    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash)
      VALUES ('https://example.com', 'dummyhash123')
      RETURNING id;
    `);
    const targetId = targetRes.rows[0].id;

    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO monitors (workspace_id, canonical_target_id, name, url)
          VALUES ($1, $2, 'Orphan Monitor', 'https://example.com');
        `, [fakeWorkspaceId, targetId]);
      },
      /violates foreign key constraint/i
    );
  });

  it('enforces foreign key constraint: monitor cannot reference non-existent canonical target', async () => {
    // Create workspace
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug)
      VALUES ('Test WS', 'test-ws')
      RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;
    const fakeTargetId = '00000000-0000-0000-0000-000000000000';

    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO monitors (workspace_id, canonical_target_id, name, url)
          VALUES ($1, $2, 'Targetless Monitor', 'https://example.com');
        `, [workspaceId, fakeTargetId]);
      },
      /violates foreign key constraint/i
    );
  });

  it('enforces check constraint on monitor check_cadence (15m, 30m, 1h, 6h, 12h, 24h)', async () => {
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug) VALUES ('WS', 'ws-cadence') RETURNING id;
    `);
    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash) VALUES ('https://ex.com', 'h1') RETURNING id;
    `);

    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO monitors (workspace_id, canonical_target_id, name, url, check_cadence)
          VALUES ($1, $2, 'Illegal Cadence Monitor', 'https://ex.com', '5m');
        `, [wsRes.rows[0].id, targetRes.rows[0].id]);
      },
      /check constraint "chk_cadence"/i
    );
  });

  it('enforces check constraint on monitor mode (text, visual, both)', async () => {
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug) VALUES ('WS', 'ws-mode') RETURNING id;
    `);
    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash) VALUES ('https://ex.com', 'h2') RETURNING id;
    `);

    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO monitors (workspace_id, canonical_target_id, name, url, mode)
          VALUES ($1, $2, 'Illegal Mode Monitor', 'https://ex.com', 'audio');
        `, [wsRes.rows[0].id, targetRes.rows[0].id]);
      },
      /check constraint "chk_mode"/i
    );
  });


  it('enforces unique constraint on canonical_targets (url_hash, css_selector, viewport_width, viewport_height)', async () => {
    await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash, css_selector, viewport_width, viewport_height)
      VALUES ('https://dedup.example.com', 'hash_dedup_1', '.hero', 1440, 900);
    `);

    // Duplicate insert should violate unique constraint
    await assert.rejects(
      async () => {
        await pool.query(`
          INSERT INTO canonical_targets (normalized_url, url_hash, css_selector, viewport_width, viewport_height)
          VALUES ('https://dedup.example.com', 'hash_dedup_1', '.hero', 1440, 900);
        `);
      },
      /violates unique constraint/i
    );
  });

  it('cascades deletion from workspace down to monitors', async () => {
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug) VALUES ('Temp WS', 'temp-ws') RETURNING id;
    `);
    const wsId = wsRes.rows[0].id;

    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash) VALUES ('https://cascade.com', 'hash_casc') RETURNING id;
    `);

    const monRes = await pool.query(`
      INSERT INTO monitors (workspace_id, canonical_target_id, name, url)
      VALUES ($1, $2, 'Cascade Monitor', 'https://cascade.com')
      RETURNING id;
    `, [wsId, targetRes.rows[0].id]);
    const monitorId = monRes.rows[0].id;

    // Delete workspace
    await pool.query('DELETE FROM workspaces WHERE id = $1', [wsId]);

    // Monitor should have been cascade deleted
    const checkMon = await pool.query('SELECT * FROM monitors WHERE id = $1', [monitorId]);
    assert.equal(checkMon.rows.length, 0);
  });
});

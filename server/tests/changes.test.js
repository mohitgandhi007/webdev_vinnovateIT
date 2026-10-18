import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { setupTestDatabase } from './test-helper.js';

describe('Snapshots & Changes API Test Suite', () => {
  let context;
  let app;
  let pool;

  before(() => {
    context = setupTestDatabase();
    app = context.app;
    pool = context.pool;
  });

  after(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await context.reset();
  });

  async function seedTestMonitorWithChanges() {
    // 1. Workspace
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug) VALUES ('Atelier Workspace', 'atelier-ws') RETURNING id;
    `);
    const workspaceId = wsRes.rows[0].id;

    // 2. Canonical Target
    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash, css_selector)
      VALUES ('https://atelier.test/catalog', 'hash_atelier', '.catalog')
      RETURNING id;
    `);
    const targetId = targetRes.rows[0].id;

    // 3. Monitor
    const monRes = await pool.query(`
      INSERT INTO monitors (workspace_id, canonical_target_id, name, url, status)
      VALUES ($1, $2, 'Atelier Nordic', 'https://atelier.test/catalog', 'healthy')
      RETURNING id;
    `, [workspaceId, targetId]);
    const monitorId = monRes.rows[0].id;

    // 4. Snapshots (Baseline and Current)
    const snap1Res = await pool.query(`
      INSERT INTO snapshots (
        canonical_target_id, scan_number, http_status_code, response_time_ms,
        text_content, text_hash, screenshot_path
      )
      VALUES ($1, 1, 200, 350, 'Summer catalog with ceramic wares.', 'hash_s1', '/uploads/snap1.webp')
      RETURNING id;
    `, [targetId]);
    const baselineId = snap1Res.rows[0].id;

    const snap2Res = await pool.query(`
      INSERT INTO snapshots (
        canonical_target_id, scan_number, http_status_code, response_time_ms,
        text_content, text_hash, screenshot_path
      )
      VALUES ($1, 2, 200, 310, 'Autumn catalog with stoneware and terracotta.', 'hash_s2', '/uploads/snap2.webp')
      RETURNING id;
    `, [targetId]);
    const currentId = snap2Res.rows[0].id;

    // 5. Detected Change
    const changeRes = await pool.query(`
      INSERT INTO detected_changes (
        monitor_id, baseline_snapshot_id, current_snapshot_id, change_type,
        title, description, dom_nodes_modified, visual_diff_percent, is_reviewed
      )
      VALUES (
        $1, $2, $3, 'content',
        'Autumn Lookbook Released',
        'Seasonal update with stoneware collection and pricing revisions.',
        24, 8.5, false
      )
      RETURNING id;
    `, [monitorId, baselineId, currentId]);
    const changeId = changeRes.rows[0].id;

    // 6. AI Insight
    await pool.query(`
      INSERT INTO ai_insights (
        detected_change_id, workspace_id, headline, category, impact_level,
        observed_facts, business_inference, executive_summary
      )
      VALUES (
        $1, $2, 'Seasonal Catalog Transition Detected', 'Catalog Update', 'medium',
        '["Autumn stoneware launched", "Summer promotional discount expired"]'::jsonb,
        'Shift to fall retail merchandise.',
        'Atelier Nordic has transitioned showroom wares to fall line.'
      );
    `, [changeId, workspaceId]);

    return { workspaceId, targetId, monitorId, baselineId, currentId, changeId };
  }

  describe('Snapshots Endpoints', () => {
    it('GET /api/monitors/:id/snapshots returns snapshot list for a monitor', async () => {
      const { monitorId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/snapshots`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 2);
      assert.equal(res.body.pagination.total, 2);
    });

    it('GET /api/snapshots/:id returns single snapshot by ID', async () => {
      const { baselineId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .get(`/api/snapshots/${baselineId}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, baselineId);
      assert.equal(res.body.data.scan_number, 1);
      assert.equal(res.body.data.screenshot_path, '/uploads/snap1.webp');
    });

    it('GET /api/snapshots/:id returns 404 for non-existent snapshot', async () => {
      const nonExistent = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/snapshots/${nonExistent}`)
        .expect(404);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  describe('Changes Endpoints', () => {
    it('GET /api/monitors/:id/changes returns change events for a monitor', async () => {
      const { monitorId, changeId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/changes`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].id, changeId);
      assert.equal(res.body.data[0].title, 'Autumn Lookbook Released');
      assert.equal(res.body.data[0].is_reviewed, false);
    });

    it('GET /api/changes/:id returns single change details with baseline & current timestamps', async () => {
      const { changeId, monitorId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .get(`/api/changes/${changeId}`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.id, changeId);
      assert.equal(res.body.data.monitor_id, monitorId);
      assert.ok(res.body.data.baseline_captured_at);
      assert.ok(res.body.data.current_captured_at);
    });

    it('PATCH /api/changes/:id updates review status to true and syncs monitor is_reviewed', async () => {
      const { changeId, monitorId } = await seedTestMonitorWithChanges();

      // Put monitor in unreviewed state
      await pool.query(`UPDATE monitors SET is_reviewed = false WHERE id = $1`, [monitorId]);

      const patchRes = await request(app)
        .patch(`/api/changes/${changeId}`)
        .send({ is_reviewed: true })
        .expect(200);

      assert.equal(patchRes.body.success, true);
      assert.equal(patchRes.body.data.is_reviewed, true);
      assert.ok(patchRes.body.data.reviewed_at);

      // Verify monitor is_reviewed was synced back to true
      const monRes = await pool.query(`SELECT is_reviewed FROM monitors WHERE id = $1`, [monitorId]);
      assert.equal(monRes.rows[0].is_reviewed, true);
    });

    it('PATCH /api/changes/:monitorId marks all changes for monitor as reviewed and syncs monitor is_reviewed', async () => {
      const { changeId, monitorId } = await seedTestMonitorWithChanges();

      // Put monitor in unreviewed state
      await pool.query(`UPDATE monitors SET is_reviewed = false WHERE id = $1`, [monitorId]);

      const patchRes = await request(app)
        .patch(`/api/changes/${monitorId}`)
        .send({ is_reviewed: true })
        .expect(200);

      assert.equal(patchRes.body.success, true);

      // Verify change record is reviewed
      const chgRes = await pool.query(`SELECT is_reviewed FROM detected_changes WHERE id = $1`, [changeId]);
      assert.equal(chgRes.rows[0].is_reviewed, true);

      // Verify monitor is_reviewed was synced back to true
      const monRes = await pool.query(`SELECT is_reviewed FROM monitors WHERE id = $1`, [monitorId]);
      assert.equal(monRes.rows[0].is_reviewed, true);
    });

    it('GET /api/monitors/:id/compare returns active changeId and isReviewed', async () => {
      const { monitorId, changeId } = await seedTestMonitorWithChanges();

      const compRes = await request(app)
        .get(`/api/monitors/${monitorId}/compare`)
        .expect(200);

      assert.equal(compRes.body.success, true);
      assert.equal(compRes.body.data.changeId, changeId);
      assert.equal(compRes.body.data.isReviewed, false);

      // Review it and re-check
      await request(app)
        .patch(`/api/changes/${changeId}`)
        .send({ is_reviewed: true })
        .expect(200);

      const compRes2 = await request(app)
        .get(`/api/monitors/${monitorId}/compare`)
        .expect(200);

      assert.equal(compRes2.body.data.isReviewed, true);
    });

    it('PATCH /api/changes/:id rejects non-boolean is_reviewed', async () => {
      const { changeId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .patch(`/api/changes/${changeId}`)
        .send({ is_reviewed: 'not-a-bool' })
        .expect(400);

      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    });

    it('GET /api/changes/:id/summary returns combined diff and AI intelligence summary', async () => {
      const { changeId } = await seedTestMonitorWithChanges();

      const res = await request(app)
        .get(`/api/changes/${changeId}/summary`)
        .expect(200);

      assert.equal(res.body.success, true);
      assert.equal(res.body.data.change_id, changeId);
      assert.equal(res.body.data.title, 'Autumn Lookbook Released');
      assert.equal(res.body.data.ai_headline, 'Seasonal Catalog Transition Detected');
      assert.equal(res.body.data.ai_category, 'Catalog Update');
      assert.equal(res.body.data.ai_impact_level, 'medium');
    });
  });
});

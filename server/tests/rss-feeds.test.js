import { describe, it, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { setupTestDatabase } from './test-helper.js';

describe('RSS 2.0 Monitor Change Feeds Test Suite', () => {
  let context;
  let app;
  let pool;
  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

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

  // Helper to seed a workspace and monitor
  async function seedMonitor(options = {}) {
    const uniqueSlug = `ws-${crypto.randomBytes(6).toString('hex')}`;
    const wsRes = await pool.query(`
      INSERT INTO workspaces (name, slug)
      VALUES ($1, $2)
      RETURNING id;
    `, [`Atelier Design ${uniqueSlug}`, uniqueSlug]);
    const workspaceId = wsRes.rows[0].id;

    const uniqueId = crypto.randomBytes(4).toString('hex');
    const targetUrl = `https://atelier.test/pricing-${uniqueId}`;
    const urlHash = `hash_pricing_${uniqueId}`;

    const targetRes = await pool.query(`
      INSERT INTO canonical_targets (normalized_url, url_hash, css_selector)
      VALUES ($1, $2, '.pricing-tier')
      RETURNING id;
    `, [targetUrl, urlHash]);
    const targetId = targetRes.rows[0].id;

    const feedToken = options.feedToken !== undefined 
      ? options.feedToken 
      : crypto.randomBytes(32).toString('hex');

    const monRes = await pool.query(`
      INSERT INTO monitors (
        workspace_id, canonical_target_id, name, url, status, feed_token, feed_enabled
      )
      VALUES ($1, $2, 'Nordic Pricing Observatory', $3, 'healthy', $4, $5)
      RETURNING id, feed_token, feed_enabled;
    `, [workspaceId, targetId, targetUrl, feedToken, options.feedEnabled ?? true]);

    const monitor = monRes.rows[0];
    return { workspaceId, targetId, monitorId: monitor.id, feedToken: monitor.feed_token };
  }

  // Helper to record a detected change
  async function addDetectedChange(params) {
    const { monitorId, targetId, workspaceId, title, description, aiInsight, detectedAt } = params;

    const snapRes = await pool.query(`
      INSERT INTO snapshots (
        canonical_target_id, scan_number, http_status_code, response_time_ms,
        text_content, text_hash, captured_at
      )
      VALUES ($1, 1, 200, 240, 'Pricing snapshot', 'hash_snap', $2)
      RETURNING id;
    `, [targetId, detectedAt || new Date()]);
    const snapId = snapRes.rows[0].id;

    const changeRes = await pool.query(`
      INSERT INTO detected_changes (
        monitor_id, baseline_snapshot_id, current_snapshot_id, change_type,
        title, description, visual_diff_percent, detected_at
      )
      VALUES ($1, $2, $2, 'content', $3, $4, 4.2, $5)
      RETURNING id;
    `, [
      monitorId,
      snapId,
      title || 'Price Plan Altered',
      description || 'Enterprise plan was adjusted from $99/mo to $129/mo.',
      detectedAt || new Date()
    ]);
    const changeId = changeRes.rows[0].id;

    if (aiInsight) {
      await pool.query(`
        INSERT INTO ai_insights (
          detected_change_id, workspace_id, headline, category, impact_level,
          business_inference, executive_summary
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7);
      `, [
        changeId,
        workspaceId,
        aiInsight.headline || 'Quarterly Pricing Escalation',
        aiInsight.category || 'Pricing',
        aiInsight.impactLevel || 'high',
        aiInsight.inference || 'Enterprise pricing revised upward.',
        aiInsight.summary || 'Subscription tiers updated with revised enterprise pricing.'
      ]);
    }

    return { changeId, snapId };
  }

  describe('Standards-Compliant RSS 2.0 Generation & Parsing', () => {
    it('generates well-formed, standards-compliant RSS 2.0 XML that parses cleanly', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();

      // Seed 2 detected changes (one with AI insights, one without)
      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Enterprise Price Updated',
        description: 'Enterprise tier shifted to $129/mo with premium SLA.',
        aiInsight: {
          headline: 'Enterprise Price Increased to $129/mo',
          summary: 'Atelier raised their Enterprise subscription by 30% with SLA inclusion.'
        },
        detectedAt: new Date(Date.now() - 3600000)
      });

      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Terms of Service Section Added',
        description: 'New clause regarding data retention was published in footer.',
        detectedAt: new Date(Date.now() - 1800000)
      });

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      // Verify content-type
      assert.match(res.headers['content-type'], /application\/rss\+xml/);

      // Validate with XMLValidator
      const validationResult = XMLValidator.validate(res.text);
      assert.equal(validationResult, true, `XML was not valid: ${JSON.stringify(validationResult)}`);

      // Parse with XMLParser
      const parsed = xmlParser.parse(res.text);
      assert.ok(parsed.rss, 'Missing <rss> root tag');
      assert.equal(parsed.rss['@_version'], '2.0');
      assert.equal(parsed.rss['@_xmlns:atom'], 'http://www.w3.org/2005/Atom');

      const channel = parsed.rss.channel;
      assert.ok(channel, 'Missing <channel>');
      assert.match(channel.title, /Nordic Pricing Observatory/);
      assert.equal(channel.language, 'en-us');
      assert.ok(channel.lastBuildDate);
      assert.ok(channel['atom:link']);
      assert.equal(channel['atom:link']['@_rel'], 'self');

      // Verify Items
      assert.ok(Array.isArray(channel.item));
      assert.equal(channel.item.length, 2);

      // Most recent change first
      const item1 = channel.item[0];
      assert.equal(item1.title, 'Terms of Service Section Added');
      assert.match(item1.description, /New clause regarding data retention/);
      assert.ok(item1.pubDate);
      assert.ok(item1.link);
      assert.match(item1.link, new RegExp(`/compare/${monitorId}\\?changeId=`));

      // AI-enriched change
      const item2 = channel.item[1];
      assert.equal(item2.title, 'Enterprise Price Increased to $129/mo');
      assert.match(item2.description, /Atelier raised their Enterprise subscription/);
      assert.ok(item2.pubDate);
    });

    it('generates stable, opaque item GUIDs without exposing internal database UUIDs', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();

      const { changeId } = await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Feature Matrix Update',
        description: 'New add-on options listed.'
      });

      const res1 = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const parsed1 = xmlParser.parse(res1.text);
      const guid1 = parsed1.rss.channel.item.guid;

      // Ensure guid is stable and opaque
      assert.ok(guid1['#text'] || typeof guid1 === 'string');
      const guidValue = guid1['#text'] || guid1;
      assert.match(guidValue, /^urn:pagepulse:change:[a-f0-9]{32}$/);
      assert.notEqual(guidValue, changeId, 'GUID must not expose raw internal change UUID');

      // Fetch again to ensure deterministic stability
      const res2 = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const parsed2 = xmlParser.parse(res2.text);
      const guid2 = parsed2.rss.channel.item.guid;
      const guidValue2 = guid2['#text'] || guid2;
      assert.equal(guidValue, guidValue2, 'GUID must remain identical across repeated requests');
    });

    it('converts timestamps to valid RFC 822 format in UTC', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();
      const detectedDate = new Date('2026-10-15T14:30:00Z');

      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        detectedAt: detectedDate
      });

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const parsed = xmlParser.parse(res.text);
      const pubDate = parsed.rss.channel.item.pubDate;

      // RFC 822 UTC: 'Thu, 15 Oct 2026 14:30:00 GMT'
      assert.equal(pubDate, 'Thu, 15 Oct 2026 14:30:00 GMT');
      assert.ok(!isNaN(Date.parse(pubDate)), 'pubDate must be parsable as a valid date');
    });

    it('supports alias path /api/feeds/monitors/:id.xml and /feed.xml', async () => {
      const { monitorId, feedToken } = await seedMonitor();

      // Test /feed.xml
      const res1 = await request(app)
        .get(`/api/monitors/${monitorId}/feed.xml?token=${feedToken}`)
        .expect(200);
      assert.match(res1.headers['content-type'], /application\/rss\+xml/);

      // Test /api/feeds/monitors/:id.xml alias
      const res2 = await request(app)
        .get(`/api/feeds/monitors/${monitorId}.xml?token=${feedToken}`)
        .expect(200);
      assert.match(res2.headers['content-type'], /application\/rss\+xml/);
    });
  });

  describe('Access Control & Security Model', () => {
    it('rejects access without a token or workspace authorization (401)', async () => {
      const { monitorId } = await seedMonitor();

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml`)
        .expect(401);

      assert.match(res.headers['content-type'], /xml/);
      assert.match(res.text, /RSS feed is protected/i);
    });

    it('rejects access with an invalid or guessed token (401)', async () => {
      const { monitorId } = await seedMonitor();

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=invalid_random_string_00000000`)
        .expect(401);

      assert.match(res.headers['content-type'], /xml/);
      assert.match(res.text, /Invalid, revoked, or disabled/i);
    });

    it('allows access via x-feed-token HTTP header', async () => {
      const { monitorId, feedToken } = await seedMonitor();

      await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml`)
        .set('x-feed-token', feedToken)
        .expect(200);
    });

    it('allows access via authenticated workspace header x-workspace-id without query token', async () => {
      const { workspaceId, monitorId } = await seedMonitor();

      await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml`)
        .set('x-workspace-id', workspaceId)
        .expect(200);
    });

    it('prevents cross-monitor token sharing', async () => {
      const monA = await seedMonitor();
      const monB = await seedMonitor();

      // Attempting to access Monitor B's feed with Monitor A's token must fail
      const res = await request(app)
        .get(`/api/monitors/${monB.monitorId}/rss.xml?token=${monA.feedToken}`)
        .expect(401);

      assert.match(res.text, /Invalid, revoked, or disabled/i);
    });

    it('does NOT provide any global endpoint exposing all monitors or cross-user history', async () => {
      // Trying to fetch a global feed should result in 404
      await request(app)
        .get('/api/feeds/global.xml')
        .expect(404);

      await request(app)
        .get('/api/rss.xml')
        .expect(404);
    });

    it('never leaks internal user credentials, webhook secrets, or session data in RSS feed', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();

      // Add a notification destination with sensitive webhook URL in workspace
      await pool.query(`
        INSERT INTO notification_destinations (
          workspace_id, channel, target_destination, is_active
        )
        VALUES ($1, 'discord', 'https://discord.com/api/webhooks/SECRET_123456/TOKEN_ABC', true);
      `, [workspaceId]);

      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Privacy Policy Revised',
        description: 'New clause published regarding user rights.'
      });

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const xml = res.text;
      assert.ok(!xml.includes('SECRET_123456'), 'RSS feed must never contain notification secrets');
      assert.ok(!xml.includes('TOKEN_ABC'), 'RSS feed must never contain credentials');
      assert.ok(!xml.includes('workspace_id'), 'RSS feed must not leak internal database column names');
    });
  });

  describe('Token Rotation & Revocation', () => {
    it('allows rotating a feed token, instantly invalidating the old token', async () => {
      const { workspaceId, monitorId, feedToken: oldToken } = await seedMonitor();

      // Rotate token via POST /:id/feed-token/rotate
      const rotateRes = await request(app)
        .post(`/api/monitors/${monitorId}/feed-token/rotate`)
        .set('x-workspace-id', workspaceId)
        .expect(200);

      assert.equal(rotateRes.body.success, true);
      const newToken = rotateRes.body.data.feedToken;
      assert.ok(newToken);
      assert.notEqual(newToken, oldToken);
      assert.equal(rotateRes.body.data.feedEnabled, true);

      // Old token must now be rejected with 401
      const oldTokenRes = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${oldToken}`)
        .expect(401);
      assert.match(oldTokenRes.text, /Invalid, revoked, or disabled/i);

      // New token must be accepted
      await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${newToken}`)
        .expect(200);
    });

    it('allows revoking a feed token, disabling the feed until regenerated', async () => {
      const { workspaceId, monitorId, feedToken } = await seedMonitor();

      // Revoke token via DELETE /:id/feed-token
      const revokeRes = await request(app)
        .delete(`/api/monitors/${monitorId}/feed-token`)
        .set('x-workspace-id', workspaceId)
        .expect(200);

      assert.equal(revokeRes.body.success, true);
      assert.equal(revokeRes.body.data.feedEnabled, false);
      assert.equal(revokeRes.body.data.feedToken, null);

      // Access with revoked token must now fail (401)
      const feedRes = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(401);
      assert.match(feedRes.text, /Invalid, revoked, or disabled/i);
    });

    it('retrieves feed metadata via GET /:id/feed-token', async () => {
      const { workspaceId, monitorId, feedToken } = await seedMonitor();

      const metaRes = await request(app)
        .get(`/api/monitors/${monitorId}/feed-token`)
        .set('x-workspace-id', workspaceId)
        .expect(200);

      assert.equal(metaRes.body.success, true);
      assert.equal(metaRes.body.data.feedToken, feedToken);
      assert.equal(metaRes.body.data.feedEnabled, true);
      assert.ok(metaRes.body.data.feedUrl);
      assert.match(metaRes.body.data.feedUrl, new RegExp(`token=${feedToken}`));
    });
  });

  describe('HTTP Caching & Duplicate Prevention', () => {
    it('supports ETag and returns 304 Not Modified when content is unchanged', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();
      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Initial Announcement'
      });

      // First fetch
      const res1 = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const etag = res1.headers['etag'];
      const lastModified = res1.headers['last-modified'];
      assert.ok(etag, 'ETag header must be set');
      assert.ok(lastModified, 'Last-Modified header must be set');
      assert.equal(res1.headers['cache-control'], 'private, max-age=60, must-revalidate');

      // Subsequent fetch with If-None-Match
      const res304Etag = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .set('If-None-Match', etag)
        .expect(304);

      assert.equal(res304Etag.text, '', 'Body should be empty on 304 response');

      // Subsequent fetch with If-Modified-Since
      const res304Mod = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .set('If-Modified-Since', lastModified)
        .expect(304);

      assert.equal(res304Mod.text, '', 'Body should be empty on 304 response');
    });

    it('updates ETag and Last-Modified when a new change is detected', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();
      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Initial Change'
      });

      const res1 = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const etag1 = res1.headers['etag'];

      // Add second detected change
      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Subsequent Change',
        detectedAt: new Date(Date.now() + 5000)
      });

      // Sending old ETag now must yield fresh 200 with new content
      const res2 = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .set('If-None-Match', etag1)
        .expect(200);

      const etag2 = res2.headers['etag'];
      assert.notEqual(etag1, etag2, 'ETag must change after new detected change');

      const parsed = xmlParser.parse(res2.text);
      assert.equal(parsed.rss.channel.item.length, 2);
    });

    it('ensures unchanged checks do NOT generate duplicate RSS items', async () => {
      const { workspaceId, targetId, monitorId, feedToken } = await seedMonitor();

      // Seed 1 detected change
      await addDetectedChange({
        monitorId,
        targetId,
        workspaceId,
        title: 'Single Change Event'
      });

      // Simulate 5 periodic checks that detected NO change (only snapshots recorded, no detected_changes)
      for (let i = 2; i <= 6; i++) {
        await pool.query(`
          INSERT INTO snapshots (
            canonical_target_id, scan_number, http_status_code, response_time_ms,
            text_content, text_hash, captured_at
          )
          VALUES ($1, $2, 200, 180, 'Unchanged content identically captured', 'hash_unchanged', NOW());
        `, [targetId, i]);
      }

      // Fetch RSS feed
      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const parsed = xmlParser.parse(res.text);

      // Verify that there is strictly 1 RSS item, despite 6 total snapshots
      const items = Array.isArray(parsed.rss.channel.item) 
        ? parsed.rss.channel.item 
        : [parsed.rss.channel.item];

      assert.equal(items.length, 1, 'Only actual detected_changes should appear in RSS feed');
      assert.equal(items[0].title, 'Single Change Event');
    });

    it('returns an empty channel with valid XML when monitor has zero detected changes', async () => {
      const { monitorId, feedToken } = await seedMonitor();

      const res = await request(app)
        .get(`/api/monitors/${monitorId}/rss.xml?token=${feedToken}`)
        .expect(200);

      const validationResult = XMLValidator.validate(res.text);
      assert.equal(validationResult, true);

      const parsed = xmlParser.parse(res.text);
      assert.ok(parsed.rss.channel);
      assert.equal(parsed.rss.channel.item, undefined, 'No items should exist for monitor with 0 changes');
    });
  });
});

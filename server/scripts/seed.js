import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { db } from '../src/config/database.js';

function hashUrl(url) {
  return crypto.createHash('sha256').update(url.trim().toLowerCase()).digest('hex');
}

export async function runSeeds(customDb = db) {
  console.log('[Seed] Seeding initial PagePulse development database...');

  // 1. Seed default workspace
  const wsRes = await customDb.query(`
    INSERT INTO workspaces (name, slug)
    VALUES ('Personal Space', 'personal')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);
  const workspaceId = wsRes.rows[0].id;
  console.log(`[Seed] Workspace ready: ${workspaceId}`);

  // 2. Canonical targets
  const atelierUrl = 'https://atelier-nordic.com/catalog';
  const atelierHash = hashUrl(atelierUrl);
  const targetRes = await customDb.query(`
    INSERT INTO canonical_targets (normalized_url, url_hash, css_selector, viewport_width, viewport_height)
    VALUES ($1, $2, '.catalog-grid', 1440, 900)
    ON CONFLICT (url_hash, css_selector, viewport_width, viewport_height) DO UPDATE SET normalized_url = EXCLUDED.normalized_url
    RETURNING id;
  `, [atelierUrl, atelierHash]);
  const canonicalTargetId = targetRes.rows[0].id;

  // 3. Monitor
  const monitorRes = await customDb.query(`
    INSERT INTO monitors (
      workspace_id,
      canonical_target_id,
      name,
      url,
      mode,
      check_cadence,
      css_selector,
      noise_threshold_percent,
      status,
      is_active,
      is_reviewed,
      last_checked_at,
      last_change_at,
      last_change_summary
    )
    VALUES (
      $1, $2, 'Atelier Nordic Catalog', $3, 'both', '1h', '.catalog-grid', 5,
      'healthy', true, true, NOW(), NOW() - INTERVAL '2 hours',
      'Hero product line expanded with Autumn collection ceramics.'
    )
    RETURNING id;
  `, [workspaceId, canonicalTargetId, atelierUrl]);
  const monitorId = monitorRes.rows[0].id;
  console.log(`[Seed] Monitor ready: ${monitorId}`);

  // 4. Snapshots (Baseline and Current)
  const snap1Res = await customDb.query(`
    INSERT INTO snapshots (
      canonical_target_id,
      scan_number,
      http_status_code,
      response_time_ms,
      text_content,
      text_hash,
      screenshot_path,
      screenshot_hash,
      dom_node_count,
      status_category,
      captured_at
    )
    VALUES (
      $1, 1, 200, 420,
      'Atelier Nordic Summer Catalog. Handcrafted ceramics and minimalist stoneware.',
      $2, '/uploads/screenshots/snap1.webp', $3, 1420, 'NOMINAL_CLEAN',
      NOW() - INTERVAL '2 days'
    )
    RETURNING id;
  `, [canonicalTargetId, hashUrl('snap1_text'), hashUrl('snap1_img')]);
  const baselineSnapId = snap1Res.rows[0].id;

  const snap2Res = await customDb.query(`
    INSERT INTO snapshots (
      canonical_target_id,
      scan_number,
      http_status_code,
      response_time_ms,
      text_content,
      text_hash,
      screenshot_path,
      screenshot_hash,
      dom_node_count,
      status_category,
      captured_at
    )
    VALUES (
      $1, 2, 200, 395,
      'Atelier Nordic Autumn Catalog. New sculptural vessels, walnut joinery, and terracotta series.',
      $2, '/uploads/screenshots/snap2.webp', $3, 1510, 'NOMINAL_CLEAN',
      NOW() - INTERVAL '2 hours'
    )
    RETURNING id;
  `, [canonicalTargetId, hashUrl('snap2_text'), hashUrl('snap2_img')]);
  const currentSnapId = snap2Res.rows[0].id;

  // 5. Detected Change
  const changeRes = await customDb.query(`
    INSERT INTO detected_changes (
      monitor_id,
      baseline_snapshot_id,
      current_snapshot_id,
      change_type,
      title,
      description,
      dom_nodes_modified,
      text_diff_json,
      visual_diff_percent,
      diff_overlay_path,
      is_reviewed,
      detected_at
    )
    VALUES (
      $1, $2, $3, 'content',
      'Seasonal Lookbook Overhaul',
      'Replaced 4 hero lifestyle cards with Autumn Stoneware collection and updated pricing table.',
      34,
      '{"added": ["Autumn Catalog", "sculptural vessels", "walnut joinery"], "removed": ["Summer Catalog"]}'::jsonb,
      12.4,
      '/uploads/diffs/diff_overlay_1.webp',
      false,
      NOW() - INTERVAL '2 hours'
    )
    RETURNING id;
  `, [monitorId, baselineSnapId, currentSnapId]);
  const changeId = changeRes.rows[0].id;

  // 6. AI Insight
  await customDb.query(`
    INSERT INTO ai_insights (
      detected_change_id,
      workspace_id,
      headline,
      category,
      impact_level,
      observed_facts,
      business_inference,
      executive_summary,
      model_version
    )
    VALUES (
      $1, $2,
      'Competitor Launched Autumn Line with 15% Price Reduction on Ceramics',
      'Competitive Intelligence',
      'high',
      '["Added 8 new SKU entries under /catalog/autumn", "Promotional headline updated to Early Harvest Exclusive", "Hero banner hero_autumn.webp replaced hero_summer.webp"]'::jsonb,
      'Atelier Nordic appears to be accelerating their Q4 launch schedule ahead of seasonal retail demand. Margin pressure likely in the table ceramics category.',
      'A notable seasonal transition detected across the main showroom catalog, marking new product introductions and updated pricing tiers.',
      'gemini-2.5-flash'
    );
  `, [changeId, workspaceId]);

  console.log('[Seed] Seeding completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSeeds()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

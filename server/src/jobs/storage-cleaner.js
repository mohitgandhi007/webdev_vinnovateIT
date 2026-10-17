import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../config/database.js';
import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Storage Cleaner Service for PagePulse
 * Enforces retention policies, prevents unbounded screenshot disk growth,
 * and preserves referenced baseline and change record artifacts.
 */
export const storageCleaner = {
  /**
   * Prune expired snapshots past retention window, guaranteeing:
   * - Never deletes the latest snapshot for any active monitor/canonical target (active baseline)
   * - Never deletes snapshots referenced by detected_changes records (change history integrity)
   * - Retains a minimum number of snapshots per target regardless of age
   * - Safely deletes unreferenced screenshot files from disk
   */
  async pruneExpiredSnapshots({
    retentionDays = 30,
    keepMinPerTarget = 5,
    screenshotsDir = config.screenshotsDir
  } = {}) {
    logger.info('STORAGE_CLEANUP_START', `Starting snapshot retention cleanup (retention: ${retentionDays}d, keepMin: ${keepMinPerTarget})`);

    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    // 1. Identify snapshots eligible for deletion
    // A snapshot is eligible ONLY IF:
    // - created_at < cutoffDate
    // - NOT in the top `keepMinPerTarget` recent snapshots for its canonical_target_id
    // - NOT referenced by detected_changes as baseline_snapshot_id or current_snapshot_id
    // - NOT the latest snapshot for any canonical target
    // 1. Fetch snapshots older than cutoff date that are not referenced in changes
    const eligibleQuery = `
      SELECT s.id, s.canonical_target_id, s.screenshot_path, s.scan_number, s.captured_at
      FROM snapshots s
      WHERE s.captured_at < $1
        AND s.id NOT IN (
          SELECT baseline_snapshot_id FROM detected_changes WHERE baseline_snapshot_id IS NOT NULL
        )
        AND s.id NOT IN (
          SELECT current_snapshot_id FROM detected_changes WHERE current_snapshot_id IS NOT NULL
        )
      ORDER BY s.scan_number ASC
    `;

    const res = await db.query(eligibleQuery, [cutoffDate]);
    const candidates = res.rows;

    if (candidates.length === 0) {
      return { prunedSnapshots: 0, deletedFiles: 0, freedBytes: 0, cutoffDate: cutoffDate.toISOString() };
    }

    // 2. Fetch maximum scan number and total count for each canonical target to protect baseline and keepMin
    const statsQuery = `
      SELECT canonical_target_id, MAX(scan_number) as max_scan, COUNT(*) as total_count
      FROM snapshots
      GROUP BY canonical_target_id
    `;
    const statsRes = await db.query(statsQuery);
    const targetStats = new Map();
    for (const row of statsRes.rows) {
      targetStats.set(row.canonical_target_id, {
        maxScan: parseInt(row.max_scan, 10),
        totalCount: parseInt(row.total_count, 10)
      });
    }

    // Filter out active baselines and enforce keepMinPerTarget
    const eligibleSnapshots = [];
    const prunedPerTarget = new Map();

    for (const snap of candidates) {
      const stats = targetStats.get(snap.canonical_target_id) || { maxScan: 0, totalCount: 0 };
      // NEVER delete the active baseline (highest scan number for a target)
      if (snap.scan_number >= stats.maxScan) {
        continue;
      }

      const alreadyPruned = prunedPerTarget.get(snap.canonical_target_id) || 0;
      // Retain at least keepMinPerTarget snapshots per target
      if (stats.totalCount - alreadyPruned <= keepMinPerTarget) {
        continue;
      }

      prunedPerTarget.set(snap.canonical_target_id, alreadyPruned + 1);
      eligibleSnapshots.push(snap);
    }

    let deletedSnapshotsCount = 0;
    let deletedFilesCount = 0;
    let freedBytes = 0;

    for (const snap of eligibleSnapshots) {
      // Check if this screenshot_path is still used by other snapshots or detected_changes
      if (snap.screenshot_path) {
        const snapRef = await db.query(
          `SELECT id FROM snapshots WHERE screenshot_path = $1 AND id != $2 LIMIT 1`,
          [snap.screenshot_path, snap.id]
        );
        const changeRef = await db.query(
          `SELECT id FROM detected_changes WHERE diff_overlay_path = $1 LIMIT 1`,
          [snap.screenshot_path]
        );

        if (snapRef.rows.length === 0 && changeRef.rows.length === 0) {
          const filename = path.basename(snap.screenshot_path);
          const fullPath = path.join(screenshotsDir, filename);
          try {
            const stat = await fs.stat(fullPath);
            await fs.unlink(fullPath);
            deletedFilesCount++;
            freedBytes += stat.size;
          } catch (err) {
            if (err.code !== 'ENOENT') {
              logger.warn('FILE_CLEANUP_WARN', `Could not delete screenshot ${fullPath}: ${err.message}`);
            }
          }
        }
      }

      // Delete snapshot DB row
      await db.query(`DELETE FROM snapshots WHERE id = $1`, [snap.id]);
      deletedSnapshotsCount++;
    }

    const report = {
      prunedSnapshots: deletedSnapshotsCount,
      deletedFiles: deletedFilesCount,
      freedBytes,
      cutoffDate: cutoffDate.toISOString()
    };

    logger.info('STORAGE_CLEANUP_COMPLETED', `Snapshot cleanup finished`, report);
    return report;
  },

  /**
   * Scan disk for orphaned screenshot files not referenced in database
   */
  async cleanOrphanedScreenshots({
    gracePeriodMs = 60 * 60 * 1000, // 1 hour grace period to protect active in-flight jobs
    screenshotsDir = config.screenshotsDir
  } = {}) {
    try {
      await fs.access(screenshotsDir);
    } catch {
      return { orphanedFilesDeleted: 0, freedBytes: 0 };
    }

    const files = await fs.readdir(screenshotsDir);
    const pngFiles = files.filter(f => f.endsWith('.png'));

    if (pngFiles.length === 0) {
      return { orphanedFilesDeleted: 0, freedBytes: 0 };
    }

    // Get all active screenshot paths from DB
    const dbPathsRes = await db.query(`
      SELECT screenshot_path AS p FROM snapshots WHERE screenshot_path IS NOT NULL
      UNION
      SELECT diff_overlay_path AS p FROM detected_changes WHERE diff_overlay_path IS NOT NULL
    `);

    const activeFilenames = new Set(
      dbPathsRes.rows.map(r => path.basename(r.p))
    );

    let orphanedFilesDeleted = 0;
    let freedBytes = 0;
    const now = Date.now();

    for (const filename of pngFiles) {
      if (!activeFilenames.has(filename)) {
        const fullPath = path.join(screenshotsDir, filename);
        try {
          const stat = await fs.stat(fullPath);
          // Only remove if older than grace period
          if (now - stat.mtimeMs > gracePeriodMs) {
            await fs.unlink(fullPath);
            orphanedFilesDeleted++;
            freedBytes += stat.size;
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            logger.warn('ORPHAN_CLEANUP_WARN', `Failed to delete orphan ${filename}: ${err.message}`);
          }
        }
      }
    }

    return { orphanedFilesDeleted, freedBytes };
  }
};

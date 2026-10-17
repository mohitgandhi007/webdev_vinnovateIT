import { storageCleaner } from '../src/jobs/storage-cleaner.js';
import { db } from '../src/config/database.js';

async function main() {
  console.log('[PagePulse Storage Cleaner] Starting storage and snapshot cleanup...');
  
  const retentionDays = parseInt(process.env.SNAPSHOT_RETENTION_DAYS || '30', 10);
  const keepMinPerTarget = parseInt(process.env.KEEP_MIN_SNAPSHOTS || '5', 10);

  try {
    const pruneResult = await storageCleaner.pruneExpiredSnapshots({
      retentionDays,
      keepMinPerTarget
    });

    console.log(`[PagePulse Storage Cleaner] Snapshot Prune Summary:`);
    console.log(`  - Pruned snapshots: ${pruneResult.prunedSnapshots}`);
    console.log(`  - Deleted files: ${pruneResult.deletedFiles}`);
    console.log(`  - Freed bytes: ${(pruneResult.freedBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Cutoff date: ${pruneResult.cutoffDate}`);

    const orphanResult = await storageCleaner.cleanOrphanedScreenshots();
    console.log(`[PagePulse Storage Cleaner] Orphaned Files Summary:`);
    console.log(`  - Orphaned files deleted: ${orphanResult.orphanedFilesDeleted}`);
    console.log(`  - Freed bytes: ${(orphanResult.freedBytes / 1024 / 1024).toFixed(2)} MB`);

    console.log('[PagePulse Storage Cleaner] Cleanup completed successfully.');
    await db.closePool();
    process.exit(0);
  } catch (err) {
    console.error('[PagePulse Storage Cleaner] Cleanup failed:', err);
    await db.closePool();
    process.exit(1);
  }
}

main();

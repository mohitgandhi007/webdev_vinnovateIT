import { db } from '../config/database.js';
import { monitorRunner } from './monitor-runner.js';
import { logger } from '../utils/logger.js';

export class Scheduler {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs || 10000; // Poll every 10 seconds
    this.timer = null;
    this.isRunning = false;
    this.isTicking = false;
  }

  /**
   * Start background scheduler loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('SCHEDULER_START', `Scheduler service active (polling every ${this.pollIntervalMs / 1000}s)`);

    // Recover any orphaned jobs from previous crashes
    this.recoverStuckJobs().catch(err => {
      logger.warn('RECOVERY_ERROR', `Failed recovering stuck jobs: ${err.message}`);
    });

    this.timer = setInterval(() => {
      this.tick().catch(err => {
        logger.error('SCHEDULER_TICK_ERROR', `Error in scheduler tick: ${err.message}`);
      });
    }, this.pollIntervalMs);

    // Initial tick
    this.tick().catch(() => {});
  }

  /**
   * Stop background scheduler loop
   */
  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('SCHEDULER_STOP', 'Scheduler service stopped');
  }

  /**
   * Reclaims monitors stuck in checking status from prior process exits
   */
  async recoverStuckJobs() {
    const res = await db.query(
      `UPDATE monitors
       SET is_checking = false
       WHERE is_checking = true AND last_attempt_at < NOW() - INTERVAL '5 minutes'
       RETURNING id, name`
    );

    if (res.rows.length > 0) {
      logger.info('RECOVERED_STUCK_JOBS', `Reclaimed ${res.rows.length} stuck monitor(s) after restart`, {
        monitors: res.rows.map(r => r.name)
      });
    }
  }

  /**
   * Poll for due monitors and execute checks
   */
  async tick() {
    if (!this.isRunning || this.isTicking) return;
    this.isTicking = true;

    try {
      // Find monitors that are active, not currently checking, and due for a check
      const res = await db.query(
        `SELECT id, name, url, check_cadence
         FROM monitors
         WHERE is_active = true 
           AND is_checking = false 
           AND (next_check_at IS NULL OR next_check_at <= NOW())
         ORDER BY next_check_at ASC NULLS FIRST
         LIMIT 5`
      );

      const dueMonitors = res.rows;
      if (dueMonitors.length > 0) {
        logger.info('SCHEDULER_POLL', `Found ${dueMonitors.length} monitor(s) due for check`);

        // Execute checks concurrently (bounded by browserPool concurrency)
        await Promise.allSettled(
          dueMonitors.map(m => monitorRunner.runCheck(m.id))
        );
      }
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Trigger an on-demand check for a monitor
   */
  async triggerImmediate(monitorId) {
    return await monitorRunner.runCheck(monitorId, { isManual: true });
  }
}

export const scheduler = new Scheduler();

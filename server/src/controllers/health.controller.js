import fs from 'node:fs/promises';
import { db } from '../config/database.js';
import { scheduler } from '../jobs/scheduler.js';
import { config } from '../config/env.js';

export const healthController = {
  /**
   * Comprehensive system health check
   */
  async getHealth(req, res, next) {
    try {
      const startTime = Date.now();
      let dbStatus = 'disconnected';
      let dbLatencyMs = null;

      try {
        await db.query('SELECT 1 AS alive');
        dbStatus = 'connected';
        dbLatencyMs = Date.now() - startTime;
      } catch (err) {
        dbStatus = 'error';
      }

      // Storage write check
      let storageStatus = 'ready';
      try {
        await fs.mkdir(config.screenshotsDir, { recursive: true });
        await fs.access(config.screenshotsDir, (fs.constants || 2).W_OK);
      } catch {
        storageStatus = 'unwritable';
      }

      const isHealthy = dbStatus === 'connected' && storageStatus === 'ready';

      res.status(isHealthy ? 200 : 503).json({
        success: isHealthy,
        status: isHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        services: {
          api: 'online',
          database: {
            status: dbStatus,
            latency_ms: dbLatencyMs
          },
          worker: 'ready',
          worker_state: {
            status: scheduler.isRunning ? 'running' : 'idle',
            poll_interval_ms: scheduler.pollIntervalMs
          },
          storage: {
            status: storageStatus,
            directory: config.screenshotsDir
          },
          gemini: {
            status: config.hasGeminiKey ? 'configured' : 'fallback_mode',
            model: config.geminiModel
          }
        },
        memory: {
          rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
        }
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * Kubernetes/Docker Liveness Probe
   */
  getLiveness(req, res) {
    res.status(200).json({ status: 'alive', uptime: Math.floor(process.uptime()) });
  },

  /**
   * Kubernetes/Docker Readiness Probe
   */
  async getReadiness(req, res) {
    try {
      await db.query('SELECT 1 AS alive');
      res.status(200).json({ status: 'ready', database: 'connected' });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', error: err.message });
    }
  }
};

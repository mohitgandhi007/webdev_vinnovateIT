import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { scheduler } from './jobs/scheduler.js';
import { browserPool } from './jobs/browser-pool.js';

const PORT = env.PORT || 3001;

async function start() {
  const dbStatus = await db.testConnection();
  if (!dbStatus.connected) {
    console.log('[PagePulse Backend] External PostgreSQL not connected. Initializing in-memory PostgreSQL engine...');
    const { setupTestDatabase } = await import('../tests/test-helper.js');
    setupTestDatabase();
    console.log('[PagePulse Backend] In-memory PostgreSQL engine ready with migrations applied.');
  } else {
    console.log(`[PagePulse Backend] Connected to PostgreSQL (${dbStatus.latencyMs}ms latency)`);
  }

  const server = app.listen(PORT, () => {
    console.log(`[PagePulse Backend] Server listening on http://localhost:${PORT}`);
    console.log(`[PagePulse Backend] Environment: ${env.NODE_ENV}`);
    console.log(`[PagePulse Backend] Live Demo Store: http://localhost:${PORT}/demo/store`);

    // Start background monitoring scheduler
    if (env.NODE_ENV !== 'test') {
      scheduler.start({ pollIntervalMs: 15000 });
    }
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\n[PagePulse Backend] Received ${signal}. Starting graceful shutdown...`);
    
    // 1. Stop scheduler polling
    scheduler.stop();

    // 2. Close HTTP server
    server.close(async () => {
      console.log('[PagePulse Backend] HTTP server closed.');
      try {
        // 3. Close Playwright browser pool
        await browserPool.closeAll();
        console.log('[PagePulse Backend] Browser pool closed.');

        // 4. Close database pool
        await db.closePool();
        console.log('[PagePulse Backend] Database pool closed.');
        process.exit(0);
      } catch (err) {
        console.error('[PagePulse Backend] Error closing resources:', err);
        process.exit(1);
      }
    });

    // Force exit if close takes too long
    setTimeout(() => {
      console.error('[PagePulse Backend] Forceful shutdown initiated after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(err => {
  console.error('[PagePulse Backend] Fatal error during startup:', err);
  process.exit(1);
});


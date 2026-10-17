import { app } from '../server/src/app.js';
import { db } from '../server/src/config/database.js';

let isDbInitialized = false;

async function ensureDatabase() {
  if (isDbInitialized) return;
  try {
    const status = await db.testConnection();
    if (!status.connected) {
      const { setupTestDatabase } = await import('../server/tests/test-helper.js');
      setupTestDatabase();
    }
    isDbInitialized = true;
  } catch (err) {
    try {
      const { setupTestDatabase } = await import('../server/tests/test-helper.js');
      setupTestDatabase();
      isDbInitialized = true;
    } catch (innerErr) {
      console.error('[Vercel Serverless] Database initialization failure:', innerErr);
    }
  }
}

export default async function handler(req, res) {
  await ensureDatabase();
  return app(req, res);
}

process.env.NODE_ENV = 'test';

import fs from 'node:fs';
import path from 'node:path';

import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { newDb } from 'pg-mem';
import { setPool } from '../src/config/database.js';
import { createApp } from '../src/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

export function setupTestDatabase() {
  const memDb = newDb();

  // Register Postgres functions
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    impure: true,
    implementation: () => crypto.randomUUID()
  });

  // Apply all migrations in order
  const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    memDb.public.none(sql);
  }


  // Create pg pool adapter
  const pgAdapter = memDb.adapters.createPg();
  const testPool = new pgAdapter.Pool();

  // Wire into application database config
  setPool(testPool);

  const app = createApp();

  return {
    memDb,
    pool: testPool,
    app,
    async reset() {
      // Clear data from tables in dependency order
      await testPool.query('DELETE FROM notification_deliveries;');
      await testPool.query('DELETE FROM notification_destinations;');
      await testPool.query('DELETE FROM web_push_subscriptions;');
      await testPool.query('DELETE FROM ai_insights;');
      await testPool.query('DELETE FROM detected_changes;');
      await testPool.query('DELETE FROM numeric_metric_series;');
      await testPool.query('DELETE FROM snapshots;');
      await testPool.query('DELETE FROM monitors;');
      await testPool.query('DELETE FROM canonical_targets;');
      await testPool.query('DELETE FROM workspaces;');
    }
  };
}

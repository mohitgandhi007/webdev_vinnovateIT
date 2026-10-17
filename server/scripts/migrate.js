import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../src/config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

export async function runMigrations(customDb = db) {
  console.log('[Migrate] Connecting to database...');

  // Ensure schema_migrations table exists
  await customDb.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Read applied migrations
  const res = await customDb.query('SELECT version FROM schema_migrations ORDER BY version ASC');
  const appliedVersions = new Set(res.rows.map(r => r.version));

  // Read migration files
  const files = await fs.readdir(MIGRATIONS_DIR);
  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`[Migrate] Found ${migrationFiles.length} migration file(s).`);

  for (const file of migrationFiles) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const name = match[2];

    if (appliedVersions.has(version)) {
      console.log(`[Migrate] Skipping already applied: ${file}`);
      continue;
    }

    console.log(`[Migrate] Applying ${file}...`);
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = await fs.readFile(filePath, 'utf-8');

    // Run within transaction
    const client = await customDb.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
        [version, name]
      );
      await client.query('COMMIT');
      console.log(`[Migrate] Successfully applied ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Migrate] FAILED applying ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('[Migrate] All migrations completed successfully.');
}

// Run directly from CLI if invoked as main module
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

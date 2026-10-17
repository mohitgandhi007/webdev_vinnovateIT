import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

let pool = new Pool({
  connectionString: config.databaseUrl,
  min: config.pool.min,
  max: config.pool.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000, // 10s query execution timeout to prevent runaway locks
  query_timeout: 10000
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Error] Unexpected idle client error:', err.message);
});

export const db = {
  async query(text, params = []) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      if (config.isDev && process.env.DEBUG_SQL === 'true') {
        console.log(`[SQL] (${duration}ms) ${text.substring(0, 80)}...`);
      }
      return res;
    } catch (err) {
      if (config.isDev) {
        console.error(`[SQL Error] ${err.message} in query: ${text}`);
      }
      throw err;
    }
  },

  async getClient() {
    return await pool.connect();
  },

  async testConnection() {
    const start = Date.now();
    try {
      await pool.query('SELECT 1');
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  },

  setPool(newPool) {
    pool = newPool;
  },

  getPool() {
    return pool;
  },

  async closePool() {
    if (pool) {
      await pool.end();
    }
  }
};

export const setPool = (newPool) => db.setPool(newPool);
export const getPool = () => db.getPool();
export default db;


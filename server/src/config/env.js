import dotenv from 'dotenv';
import path from 'path';

// Load .env file if present
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT || '3001', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/pagepulse';
const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR || path.resolve(process.cwd(), 'uploads/screenshots');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ALLOW_LOCAL_FIXTURES = process.env.ALLOW_LOCAL_FIXTURES === 'true';

// Validate port range
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`[Config Error] Invalid PORT specified: ${process.env.PORT}`);
}

export function validateProductionConfig() {
  const issues = [];
  if (NODE_ENV === 'production') {
    if (ALLOW_LOCAL_FIXTURES) {
      issues.push('ALLOW_LOCAL_FIXTURES is enabled in production mode; internal loopback addresses are permitted.');
    }
  }
  return { valid: true, warnings: issues };
}

export const config = {
  NODE_ENV,
  env: NODE_ENV,
  PORT,
  isProd: NODE_ENV === 'production',
  isDev: NODE_ENV === 'development',
  isTest: NODE_ENV === 'test',
  port: PORT,
  corsOrigin: CORS_ORIGIN,
  databaseUrl: DATABASE_URL,
  screenshotsDir: SCREENSHOTS_DIR,
  geminiApiKey: GEMINI_API_KEY,
  geminiModel: GEMINI_MODEL,
  hasGeminiKey: Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim()),
  allowLocalFixtures: ALLOW_LOCAL_FIXTURES,
  pool: {
    min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
    max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
  }
};

export const env = config;
export default config;

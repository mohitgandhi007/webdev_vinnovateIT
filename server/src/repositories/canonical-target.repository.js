import crypto from 'crypto';
import { db } from '../config/database.js';

export const canonicalTargetRepository = {
  hashUrl(normalizedUrl) {
    return crypto.createHash('sha256').update(normalizedUrl).digest('hex');
  },

  async findOrCreate(options) {
    const targetUrl = options.normalizedUrl || options.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      throw new Error('Valid URL string is required to find or create canonical target');
    }
    const selector = options.cssSelector || options.css_selector || '';
    const width = options.viewportWidth || options.viewport_width || 1440;
    const height = options.viewportHeight || options.viewport_height || 900;
    const urlHash = this.hashUrl(targetUrl);

    // Check if canonical target already exists
    const existing = await db.query(
      `SELECT * FROM canonical_targets 
       WHERE url_hash = $1 AND css_selector = $2 AND viewport_width = $3 AND viewport_height = $4`,
      [urlHash, selector, width, height]
    );

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    // Insert new canonical target
    const inserted = await db.query(
      `INSERT INTO canonical_targets 
       (normalized_url, url_hash, css_selector, viewport_width, viewport_height, last_fetch_status)
       VALUES ($1, $2, $3, $4, $5, 'unpolled')
       RETURNING *`,
      [targetUrl, urlHash, selector, width, height]
    );

    return inserted.rows[0];
  },


  async findById(id) {
    const res = await db.query('SELECT * FROM canonical_targets WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async updateLastFetch(id, { status, fetchedAt = new Date() }) {
    const res = await db.query(
      `UPDATE canonical_targets
       SET last_fetch_status = $2, last_fetched_at = $3
       WHERE id = $1
       RETURNING *`,
      [id, status, fetchedAt]
    );
    return res.rows[0] || null;
  }
};

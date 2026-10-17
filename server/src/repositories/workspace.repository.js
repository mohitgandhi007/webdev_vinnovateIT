import { db } from '../config/database.js';

export const workspaceRepository = {
  async findOrCreateDefault() {
    const slug = 'digital-atelier';
    const existing = await db.query('SELECT * FROM workspaces WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const inserted = await db.query(
      `INSERT INTO workspaces (name, slug)
       VALUES ($1, $2)
       RETURNING *`,
      ['Digital Atelier Labs', slug]
    );
    return inserted.rows[0];
  },

  async findById(id) {
    const res = await db.query('SELECT * FROM workspaces WHERE id = $1', [id]);
    return res.rows[0] || null;
  },

  async create({ name, slug }) {
    const res = await db.query(
      `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING *`,
      [name, slug]
    );
    return res.rows[0];
  }
};

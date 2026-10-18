import { Router } from 'express';
import { pool } from '../db.js';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_request, response) => {
  try {
    const { rows } = await pool.query(`
      SELECT category_id, category_name
      FROM categories
      ORDER BY category_id
    `);

    response.json({
      categories: rows.map((row) => ({
        id: Number(row.category_id),
        name: row.category_name,
      })),
    });
  } catch (error) {
    console.error('Failed to load categories:', error);
    response.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Categories are temporarily unavailable.',
      },
    });
  }
});

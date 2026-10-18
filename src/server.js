import { mkdir } from 'node:fs/promises';
import cors from 'cors';
import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { categoriesRouter } from './routes/categories.js';

await mkdir(config.uploadDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny' }));
app.use('/api/categories', categoriesRouter);

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/health/db', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({ database: 'connected' });
  } catch (error) {
    console.error('Database health check failed:', error);
    response.status(503).json({ database: 'unavailable' });
  }
});

app.listen(config.port, config.host, () => {
  console.log(`Korna API listening on http://${config.host}:${config.port}`);
});

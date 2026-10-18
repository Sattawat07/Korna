import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  ...config.database,
  max: 10,
  connectionTimeoutMillis: 3000,
});

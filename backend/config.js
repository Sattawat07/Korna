import 'dotenv/config';
import { fileURLToPath } from 'node:url';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and set its value.`);
  }
  return value;
}

function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`${name} must be a port number from 1 to 65535.`);
  }
  return value;
}

export const config = {
  host: process.env.HOST?.trim() || '127.0.0.1',
  port: port('PORT', 3000),
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: fileURLToPath(new URL('../uploads/', import.meta.url)),
  database: {
    host: required('PGHOST'),
    port: port('PGPORT', 5432),
    database: required('PGDATABASE'),
    user: required('PGUSER'),
    password: required('PGPASSWORD'),
  },
};

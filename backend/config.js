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

const sessionSecret = required('SESSION_SECRET');
if (Buffer.byteLength(sessionSecret, 'utf8') < 32) {
	throw new Error('SESSION_SECRET must contain at least 32 bytes.');
}

export const config = {
	host: process.env.HOST?.trim() || '127.0.0.1',
	port: port('PORT', 3000),
	sessionSecret,
	secureCookie: process.env.COOKIE_SECURE === 'true',
	trustProxy: process.env.TRUST_PROXY === 'true',
	frontendDir: fileURLToPath(new URL('../frontend/', import.meta.url)),
	uploadDir: fileURLToPath(new URL('../uploads/', import.meta.url)),
	database: {
		host: required('PGHOST'),
		port: port('PGPORT', 5432),
		database: required('PGDATABASE'),
		user: required('PGUSER'),
		password: required('PGPASSWORD'),
	},
	smtp: {
		host: required('SMTP_HOST'),
		port: port('SMTP_PORT', 465),
		secure: process.env.SMTP_SECURE === 'true',
		user: required('SMTP_USER'),
		pass: required('SMTP_PASS'),
		from: required('SMTP_FROM'),
	}
};

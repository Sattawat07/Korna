import { mkdir } from 'node:fs/promises';
import express from 'express';
import session from 'express-session';
import cookieParser from "cookie-parser";
import { config } from './config.js';
import { pool } from './db.js';
import { createSessionStore } from './session-store.js';
import { categoriesRouter } from './routes/categories.js';
import { authRouter } from './routes/auth.js';

await mkdir(config.uploadDir, { recursive: true });

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);
app.use(session({
	name: 'sid',
	secret: config.sessionSecret,
	store: createSessionStore(pool),
	resave: false,
	saveUninitialized: false,
	cookie: {
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookie,
	},
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(config.uploadDir, { index: false, dotfiles: 'deny' }));
app.use('/api/categories', categoriesRouter);
app.use('/api/auth', authRouter);

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

app.use(express.static(config.frontendDir, { dotfiles: 'deny' }));

app.listen(config.port, config.host, () => {
	console.log(`Korna API listening on http://${config.host}:${config.port}`);
});

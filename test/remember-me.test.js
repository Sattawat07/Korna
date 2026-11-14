import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import session from 'express-session';
import { config } from '../backend/config.js';
import { pool } from '../backend/db.js';
import { requireAuth } from '../backend/middleware/auth.js';
import { hashPassword } from '../backend/password.js';
import { authRouter } from '../backend/routes/auth.js';
import { createSessionStore, REMEMBERED_SESSION_MAX_AGE_MS, SESSION_TTL_SECONDS } from '../backend/session-store.js';

test('login sets browser and database session lifetimes from remember_me', async (t) => {
	const { passwordHash } = await hashPassword('correct-password');
	const user = {
		id: '99', name: 'Test User', email: 'remember@example.com',
		password_hash: passwordHash, role: 'user', room_number: 'A-1',
		phone_number: null, created_at: new Date(),
	};
	t.mock.method(pool, 'query', async (sql) => {
		if (sql.includes('FROM users')) return { rows: [user] };
		throw new Error(`Unexpected user query: ${sql}`);
	});

	const sessions = new Map();
	const sessionPool = {
		async query(sql, params) {
			if (sql.startsWith('INSERT INTO')) {
				sessions.set(params[2], { sess: JSON.parse(JSON.stringify(params[0])), expire: params[1] });
				return { rows: [{ sid: params[2] }] };
			}
			if (sql.startsWith('SELECT sess')) {
				const row = sessions.get(params[0]);
				return { rows: row && row.expire >= params[1] ? [{ sess: row.sess }] : [] };
			}
			if (sql.startsWith('DELETE FROM')) {
				sessions.delete(params[0]);
				return { rows: [] };
			}
			throw new Error(`Unexpected session query: ${sql}`);
		},
	};
	const store = createSessionStore(sessionPool);
	const app = express();
	app.use(session({
		name: 'sid', secret: config.sessionSecret, store,
		resave: false, saveUninitialized: false,
		cookie: { httpOnly: true, sameSite: 'lax', secure: false },
	}));
	app.use(express.json());
	app.use('/api/auth', authRouter);
	app.get('/private', requireAuth, (req, res) => res.json({ id: req.user.id }));

	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(async () => {
		await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		await store.close();
	});
	const baseUrl = `http://127.0.0.1:${server.address().port}`;

	for (const rememberMe of [undefined, false, true]) {
		const body = { email: user.email, password: 'correct-password' };
		if (rememberMe !== undefined) body.remember_me = rememberMe;
		const before = Date.now();
		const login = await fetch(`${baseUrl}/api/auth/login`, {
			method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
		});
		const after = Date.now();
		assert.equal(login.status, 200);
		assert.equal((await login.json()).user.email, user.email);
		const setCookie = login.headers.get('set-cookie');
		assert.match(setCookie, /^sid=/);
		assert.equal(/; Expires=|; Max-Age=/i.test(setCookie), rememberMe === true);
		const cookie = setCookie.split(';', 1)[0];
		const [sid, row] = [...sessions.entries()].at(-1);
		const expectedSeconds = rememberMe === true ? REMEMBERED_SESSION_MAX_AGE_MS / 1000 : SESSION_TTL_SECONDS;
		assert.ok(row.expire >= Math.floor(before / 1000) + expectedSeconds);
		assert.ok(row.expire <= Math.ceil(after / 1000) + expectedSeconds);
		assert.equal(row.sess.userId, user.id);

		const privateResponse = await fetch(`${baseUrl}/private`, { headers: { cookie } });
		assert.equal(privateResponse.status, 200);
		assert.equal(privateResponse.headers.get('set-cookie'), null);
		assert.equal(sessions.get(sid).expire, row.expire);

		const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { cookie } });
		assert.equal(logout.status, 204);
		assert.match(logout.headers.get('set-cookie'), /^sid=;/);
		assert.equal(sessions.has(sid), false);
		const afterLogout = await fetch(`${baseUrl}/private`, { headers: { cookie } });
		assert.equal(afterLogout.status, 401);
	}

	const invalid = await fetch(`${baseUrl}/api/auth/login`, {
		method: 'POST', headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: user.email, password: 'correct-password', remember_me: 'true' }),
	});
	assert.equal(invalid.status, 400);
	assert.ok((await invalid.json()).error.details.remember_me);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import { pool } from '../backend/db.js';
import { verifyPassword } from '../backend/password.js';
import { createPasswordResetToken } from '../backend/password-reset-tokens.js';
import { authRouter } from '../backend/routes/auth.js';

async function startApp(t) {
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use('/api/auth', authRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/auth/forgot-password/reset`;
	return (tokenId, newPassword) => fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(tokenId ? { cookie: `reset_token=${tokenId}` } : {}),
		},
		body: JSON.stringify({ new_password: newPassword }),
	});
}

test('password reset changes the password and removes old sessions in one transaction', async (t) => {
	const calls = [];
	let released = false;
	let savedHash;
	let savedSalt;
	const client = {
		async query(sql, params) {
			calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
			if (sql.includes('UPDATE users')) {
				[savedHash, savedSalt] = params;
				assert.equal(params[2], '42');
				return { rows: [{ user_id: '42' }] };
			}
			if (sql.includes('DELETE FROM sessions')) {
				assert.deepEqual(params, ['42']);
				return { rowCount: 2 };
			}
			return {};
		},
		release() { released = true; },
	};
	t.mock.method(pool, 'connect', async () => client);
	const request = await startApp(t);
	const { tokenId } = createPasswordResetToken('42');

	assert.equal((await request(tokenId, 'short')).status, 400);
	assert.equal((await request(null, 'a-new-password')).status, 410);
	const response = await request(tokenId, 'a-new-password');
	assert.equal(response.status, 204);
	assert.equal(await response.text(), '');
	assert.ok(response.headers.getSetCookie().some(cookie => /^reset_token=;/i.test(cookie)));
	assert.ok(await verifyPassword(savedHash, 'a-new-password'));
	assert.match(savedSalt, /^[A-Za-z0-9+/]+=*$/);
	assert.deepEqual(calls, ['BEGIN', 'UPDATE users SET', 'DELETE FROM sessions', 'COMMIT']);
	assert.equal(released, true);
	assert.equal((await request(tokenId, 'another-password')).status, 410);
});

test('password reset rolls back when old sessions cannot be deleted', async (t) => {
	const calls = [];
	let released = false;
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'connect', async () => ({
		async query(sql) {
			calls.push(sql.trim().split(/\s+/).slice(0, 3).join(' '));
			if (sql.includes('UPDATE users')) return { rows: [{ user_id: '43' }] };
			if (sql.includes('DELETE FROM sessions')) throw new Error('database unavailable');
			return {};
		},
		release() { released = true; },
	}));
	const request = await startApp(t);
	const { tokenId } = createPasswordResetToken('43');
	const response = await request(tokenId, 'a-new-password');
	assert.equal(response.status, 503);
	assert.equal((await response.json()).error.code, 'DATABASE_UNAVAILABLE');
	assert.deepEqual(calls, ['BEGIN', 'UPDATE users SET', 'DELETE FROM sessions', 'ROLLBACK']);
	assert.equal(released, true);
});

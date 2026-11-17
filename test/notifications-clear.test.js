import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { notificationsRouter } from '../backend/routes/notifications.js';

test('DELETE notification endpoints clear read-only or all visible notifications for the signed-in user', async (t) => {
	let userId = 7;
	let failUpdate = false;
	const updates = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		updates.push({ sql, values });
		if (failUpdate) throw new Error('database unavailable');
		return { rowCount: 2 };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/notifications', notificationsRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/notifications`;
	const clear = (path = '') => fetch(url + path, { method: 'DELETE' });

	const readOnly = await clear('/read');
	assert.equal(readOnly.status, 204);
	assert.equal(await readOnly.text(), '');
	assert.deepEqual(updates[0].values, [7]);
	assert.match(updates[0].sql, /WHERE recipient_user_id = \$1 AND read_at IS NOT NULL AND cleared_at IS NULL/);
	assert.doesNotMatch(updates[0].sql, /DELETE FROM|SET read_at/);

	const first = await clear();
	assert.equal(first.status, 204);
	assert.equal(await first.text(), '');
	assert.deepEqual(updates[1].values, [7]);
	assert.match(updates[1].sql, /UPDATE notifications\s+SET cleared_at = NOW\(\)/);
	assert.match(updates[1].sql, /WHERE recipient_user_id = \$1 AND cleared_at IS NULL/);
	assert.doesNotMatch(updates[1].sql, /read_at IS NOT NULL|DELETE FROM|SET read_at/);
	assert.equal((await clear()).status, 204);

	userId = null;
	const unauthenticated = await clear();
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');
	assert.equal((await clear('/read')).status, 401);
	assert.equal(updates.length, 3);

	userId = 7;
	failUpdate = true;
	const unavailable = await clear();
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
	const readUnavailable = await clear('/read');
	assert.equal(readUnavailable.status, 503);
	assert.equal((await readUnavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

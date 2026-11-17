import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { notificationsRouter } from '../backend/routes/notifications.js';

test('PATCH /api/notifications/:id/read updates only the recipient notification', async (t) => {
	let userId = 7;
	let failUpdate = false;
	let readRows = [{
		notification_id: '41', notification_type: 'request_received',
		notification_item_id: '12', notification_request_id: '31',
		notification_decision: null, read_at: '2026-10-18T12:00:00.000Z',
		created_at: '2026-10-18T11:00:00.000Z',
	}];
	const updates = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		updates.push({ sql, values });
		if (failUpdate) throw new Error('database unavailable');
		return { rows: readRows };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/notifications', notificationsRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/notifications`;
	const patch = id => fetch(`${url}/${id}/read`, { method: 'PATCH' });

	const read = await patch('41');
	assert.equal(read.status, 200);
	assert.deepEqual(await read.json(), {
		notification: {
			id: 41, type: 'request_received', item_id: 12, request_id: 31,
			read_at: '2026-10-18T12:00:00.000Z', created_at: '2026-10-18T11:00:00.000Z',
		},
	});
	assert.deepEqual(updates[0].values, [41, 7]);
	assert.match(updates[0].sql, /SET read_at = COALESCE\(read_at, NOW\(\)\)/);
	assert.match(updates[0].sql, /WHERE notification_id = \$1 AND recipient_user_id = \$2 AND cleared_at IS NULL/);

	readRows = [{ ...readRows[0], notification_type: 'request_decided', notification_decision: 'accepted' }];
	const decided = await patch('41');
	assert.equal(decided.status, 200);
	assert.equal((await decided.json()).notification.decision, 'accepted');

	readRows = [];
	const missing = await patch('41');
	assert.equal(missing.status, 404);
	assert.equal((await missing.json()).error.code, 'NOT_FOUND');

	const updateCount = updates.length;
	for (const id of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
		const invalid = await patch(id);
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(updates.length, updateCount);

	userId = null;
	const unauthenticated = await patch('41');
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');

	userId = 7;
	failUpdate = true;
	const unavailable = await patch('41');
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

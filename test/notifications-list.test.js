import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { notificationsRouter } from '../backend/routes/notifications.js';

test('GET /api/notifications paginates only the current user’s notifications', async (t) => {
	let userId = 7;
	let failCount = false;
	let countRow = { total: '3', unread_count: '2' };
	let notificationRows = [{
		notification_id: '41', notification_type: 'request_received',
		notification_item_id: '12', notification_request_id: '31',
		notification_decision: null, actor_id: '8', actor_name: 'Ton', actor_avatar_url: null,
		read_at: null, created_at: '2026-10-18T11:00:00.000Z',
	}];
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		queries.push({ sql, values });
		if (sql.includes('COUNT(*) AS total')) {
			if (failCount) throw new Error('database unavailable');
			return { rows: [countRow] };
		}
		return { rows: notificationRows };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/notifications', notificationsRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/notifications`;

	const first = await fetch(url);
	assert.equal(first.status, 200);
	const firstBody = await first.json();
	assert.deepEqual(firstBody.pagination, { page: 1, limit: 20, total: 3, total_pages: 1 });
	assert.equal(firstBody.unread_count, 2);
	assert.deepEqual(firstBody.notifications[0], {
		id: 41, type: 'request_received', item_id: 12, request_id: 31,
		actor: { id: 8, name: 'Ton', avatar_url: null }, read_at: null,
		created_at: '2026-10-18T11:00:00.000Z',
	});
	assert.deepEqual(queries[0].values, [7]);
	assert.deepEqual(queries[1].values, [7, 20, 0]);
	assert.match(queries[0].sql, /recipient_user_id = \$1 AND cleared_at IS NULL/);
	assert.match(queries[1].sql, /n\.recipient_user_id = \$1 AND n\.cleared_at IS NULL/);
	assert.match(queries[1].sql, /ORDER BY n\.created_at DESC, n\.notification_id DESC/);
	assert.equal(queries.every(query => /^\s*SELECT/.test(query.sql)), true);

	notificationRows = [{
		notification_id: '40', notification_type: 'request_decided',
		notification_item_id: '12', notification_request_id: '30',
		notification_decision: 'accepted', actor_id: '9', actor_name: 'May',
		read_at: '2026-10-19T11:00:00.000Z', created_at: '2026-10-18T10:00:00.000Z',
	}];
	const second = await fetch(`${url}?page=2&limit=1`);
	assert.equal(second.status, 200);
	const secondBody = await second.json();
	assert.deepEqual(secondBody.pagination, { page: 2, limit: 1, total: 3, total_pages: 3 });
	assert.equal(secondBody.unread_count, 2);
	assert.equal(secondBody.notifications[0].decision, 'accepted');
	assert.deepEqual(queries.at(-1).values, [7, 1, 1]);

	const queryCount = queries.length;
	for (const query of ['?page=0', '?page=no', '?limit=0', '?limit=51', '?limit=1.5']) {
		const invalid = await fetch(url + query);
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, queryCount);

	userId = null;
	const unauthenticated = await fetch(url);
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');

	userId = 7;
	countRow = { total: '0', unread_count: '0' };
	notificationRows = [];
	const empty = await fetch(url);
	assert.equal(empty.status, 200);
	assert.deepEqual(await empty.json(), {
		notifications: [], unread_count: 0,
		pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
	});

	failCount = true;
	const unavailable = await fetch(url);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

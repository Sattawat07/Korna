import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('GET /api/admin/users searches and paginates members for admins', async (t) => {
	let userId = 7;
	let role = 'admin';
	let failUsers = false;
	let total = '1';
	let userRows = [{ user_id: '8', user_name: 'Nina', user_email: 'nina@example.com',
		role: 'user', user_room_number: 'A-304', user_phone_number: '0812345678',
		user_created_at: '2026-10-18T10:00:00.000Z', items_count: '3' }];
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role }] };
		queries.push({ sql, values });
		if (failUsers) throw new Error('database unavailable');
		return sql.includes('COUNT(*) AS total') ? { rows: [{ total }] } : { rows: userRows };
	});
	const app = express();
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/users`;

	userId = null;
	assert.equal((await fetch(url)).status, 401);
	userId = 7;
	role = 'user';
	assert.equal((await fetch(url)).status, 403);
	assert.equal(queries.length, 0);
	role = 'admin';

	const response = await fetch(url);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		users: [{ id: 8, name: 'Nina', email: 'nina@example.com', role: 'user',
			room_number: 'A-304', phone_number: '0812345678',
			created_at: '2026-10-18T10:00:00.000Z', items_count: 3 }],
		pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
	});
	assert.deepEqual(queries[0].values, []);
	assert.deepEqual(queries[1].values, [20, 0]);
	assert.match(queries[1].sql, /item_status <> 'removed'/);
	assert.match(queries[1].sql, /ORDER BY u\.user_created_at DESC, u\.user_id DESC/);

	queries.length = 0;
	const filtered = await fetch(`${url}?q=nina%40example.com&page=2&limit=1`);
	assert.equal(filtered.status, 200);
	assert.deepEqual(queries[0].values, ['nina@example.com']);
	assert.deepEqual(queries[1].values, ['nina@example.com', 1, 1]);
	for (const { sql } of queries) {
		assert.match(sql, /strpos\(lower\(u\.user_name\), lower\(\$1\)\)/);
		assert.match(sql, /strpos\(lower\(u\.user_email\), lower\(\$1\)\)/);
	}
	const queryCount = queries.length;
	for (const query of ['page=0', 'page=abc', 'page=9007199254740992',
		'limit=0', 'limit=51', 'q=a&q=b']) {
		const invalid = await fetch(`${url}?${query}`);
		assert.equal(invalid.status, 400, query);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, queryCount);

	total = '0';
	userRows = [];
	const empty = await fetch(url);
	assert.equal(empty.status, 200);
	assert.deepEqual(await empty.json(), {
		users: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 },
	});
	failUsers = true;
	const unavailable = await fetch(url);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

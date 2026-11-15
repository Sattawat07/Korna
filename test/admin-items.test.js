import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('GET /api/admin/items filters and paginates all item statuses for admins', async (t) => {
	let userId = 7;
	let role = 'admin';
	let total = '2';
	let failItems = false;
	let itemRows = [{
		item_id: '12', item_owner_id: '8', item_title: 'Desk lamp',
		item_description: 'Works well', item_defects: 'Scratch', item_type: 'swap',
		item_status: 'removed', item_created_at: '2026-10-18T10:00:00.000Z',
		category_id: '4', category_name: 'Electronics', owner_name: 'Nina',
		image_url: '/uploads/items/lamp.webp',
		images: [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }],
		desired_category_id: '1', desired_category_name: 'Books',
		desired_description: 'A novel',
	}, {
		item_id: '11', item_owner_id: '8', item_title: 'Chair',
		item_description: null, item_defects: null, item_type: 'free',
		item_status: 'completed', item_created_at: '2026-10-17T10:00:00.000Z',
		category_id: '2', category_name: 'Furniture', owner_name: 'Nina',
		image_url: null, images: [], desired_category_id: null,
		desired_category_name: null, desired_description: null,
	}];
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role }] };
		queries.push({ sql, values });
		if (failItems) throw new Error('database unavailable');
		if (sql.includes('COUNT(*) AS total')) return { rows: [{ total }] };
		return { rows: itemRows };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/items`;

	userId = null;
	assert.equal((await fetch(url)).status, 401);
	role = 'user';
	userId = 7;
	assert.equal((await fetch(url)).status, 403);
	assert.equal(queries.length, 0);

	role = 'admin';
	const response = await fetch(url);
	assert.equal(response.status, 200);
	const body = await response.json();
	assert.deepEqual(body.pagination, { page: 1, limit: 12, total: 2, total_pages: 1 });
	assert.deepEqual(body.items.map((item) => item.status), ['removed', 'completed']);
	assert.deepEqual(body.items[0], {
		id: 12, title: 'Desk lamp', description: 'Works well', defects: 'Scratch',
		type: 'swap', status: 'removed', category: { id: 4, name: 'Electronics' },
		image_url: '/uploads/items/lamp.webp',
		images: [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }],
		owner: { id: 8, name: 'Nina' },
		swap_details: { desired_category: { id: 1, name: 'Books' }, desired_description: 'A novel' },
		created_at: '2026-10-18T10:00:00.000Z',
	});
	assert.equal(body.items[1].swap_details, null);
	assert.deepEqual(body.items[1].images, []);
	assert.match(queries[1].sql, /ORDER BY i\.item_created_at DESC, i\.item_id DESC/);
	assert.deepEqual(queries[1].values, [12, 0]);

	queries.length = 0;
	const filtered = await fetch(`${url}?q=Nina&owner_id=8&status=removed&type=swap&category_id=4&page=2&limit=1`);
	assert.equal(filtered.status, 200);
	assert.deepEqual((await filtered.json()).pagination,
		{ page: 2, limit: 1, total: 2, total_pages: 2 });
	assert.deepEqual(queries[0].values, ['Nina', 8, 'removed', 'swap', 4]);
	assert.deepEqual(queries[1].values, ['Nina', 8, 'removed', 'swap', 4, 1, 1]);
	for (const sql of queries.map((query) => query.sql)) {
		assert.match(sql, /strpos\(lower\(i\.item_title\), lower\(\$1\)\)/);
		assert.match(sql, /strpos\(lower\(u\.user_name\), lower\(\$1\)\)/);
		assert.match(sql, /i\.item_owner_id = \$2/);
		assert.match(sql, /i\.item_status = \$3/);
		assert.match(sql, /i\.item_type = \$4/);
		assert.match(sql, /i\.item_category_id = \$5/);
	}

	const queryCount = queries.length;
	for (const query of ['page=0', 'page=abc', 'page=9007199254740992', 'limit=0',
		'limit=51', 'owner_id=-1', 'category_id=abc', 'status=other', 'type=other',
		'q=a&q=b']) {
		const invalid = await fetch(`${url}?${query}`);
		assert.equal(invalid.status, 400, query);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, queryCount);

	total = '0';
	itemRows = [];
	const empty = await fetch(url);
	assert.equal(empty.status, 200);
	assert.deepEqual(await empty.json(), {
		items: [], pagination: { page: 1, limit: 12, total: 0, total_pages: 0 },
	});

	failItems = true;
	const unavailable = await fetch(url);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

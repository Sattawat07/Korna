import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { meRouter } from '../backend/routes/me.js';

test('GET /api/me/items returns owned items with images, swap details, and request counts', async (t) => {
	let userId = 7;
	let failItems = false;
	let itemRows = [
		{
			item_id: '12', item_owner_id: '7', item_title: 'Desk lamp',
			item_description: 'Works well', item_defects: 'Scratch', item_type: 'swap',
			item_status: 'pending', category_id: '4', category_name: 'Electronics',
			owner_name: 'Nina', image_url: '/uploads/items/lamp.webp',
			images: [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }],
			desired_category_id: '1', desired_category_name: 'Books',
			desired_description: 'A novel', item_created_at: '2026-10-18T10:00:00.000Z',
			requests_count: '3',
		},
		{
			item_id: '11', item_owner_id: '7', item_title: 'Chair',
			item_description: null, item_defects: null, item_type: 'free',
			item_status: 'removed', category_id: '2', category_name: 'Furniture',
			owner_name: 'Nina', image_url: null, images: [],
			desired_category_id: null, desired_category_name: null,
			desired_description: null, item_created_at: '2026-10-17T10:00:00.000Z',
			requests_count: '0',
		},
	];
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		queries.push({ sql, values });
		if (failItems) throw new Error('database unavailable');
		return { rows: itemRows };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/me', meRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/me/items`;

	const found = await fetch(url);
	assert.equal(found.status, 200);
	const { items } = await found.json();
	assert.deepEqual(items.map(item => item.id), [12, 11]);
	assert.equal(items[0].requests_count, 3);
	assert.deepEqual(items[0].images, [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }]);
	assert.deepEqual(items[0].swap_details, {
		desired_category: { id: 1, name: 'Books' }, desired_description: 'A novel',
	});
	assert.equal(items[1].status, 'removed');
	assert.equal(items[1].swap_details, null);
	assert.deepEqual(items[1].images, []);
	assert.deepEqual(queries[0].values, [7]);
	assert.match(queries[0].sql, /WHERE i\.item_owner_id = \$1/);
	assert.match(queries[0].sql, /ORDER BY i\.item_created_at DESC, i\.item_id DESC/);

	itemRows = [];
	const empty = await fetch(url);
	assert.equal(empty.status, 200);
	assert.deepEqual(await empty.json(), { items: [] });

	userId = null;
	const unauthenticated = await fetch(url);
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');

	userId = 7;
	failItems = true;
	const unavailable = await fetch(url);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

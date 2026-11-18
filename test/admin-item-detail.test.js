import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('GET /api/admin/items/:id returns removed posts with the list item shape', async (t) => {
	let userId = 7;
	let role = 'admin';
	let found = true;
	let failQuery = false;
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role }] };
		queries.push({ sql, values });
		if (failQuery) throw new Error('database unavailable');
		return { rows: found ? [{
			item_id: '12', item_owner_id: '8', item_title: 'Desk lamp',
			item_description: 'Works well', item_defects: 'Scratch', item_type: 'swap',
			item_status: 'removed', item_created_at: '2026-10-18T10:00:00.000Z',
			category_id: '4', category_name: 'Electronics', owner_name: 'Nina',
			owner_avatar_url: '/uploads/avatars/nina.webp',
			image_url: '/uploads/items/lamp.webp',
			images: [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }],
			desired_category_id: '1', desired_category_name: 'Books',
			desired_description: 'A novel',
		}] : [] };
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
	assert.equal((await fetch(`${url}/12`)).status, 401);
	userId = 7;
	role = 'user';
	assert.equal((await fetch(`${url}/12`)).status, 403);
	assert.equal(queries.length, 0);

	role = 'admin';
	for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) {
		const response = await fetch(`${url}/${id}`);
		assert.equal(response.status, 400, id);
		assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, 0);

	const response = await fetch(`${url}/12`);
	assert.equal(response.status, 200);
	assert.deepEqual((await response.json()).item, {
		id: 12, title: 'Desk lamp', description: 'Works well', defects: 'Scratch',
		type: 'swap', status: 'removed', category: { id: 4, name: 'Electronics' },
		image_url: '/uploads/items/lamp.webp',
		images: [{ id: 101, url: '/uploads/items/lamp.webp', position: 0 }],
		owner: { id: 8, name: 'Nina', avatar_url: '/uploads/avatars/nina.webp' },
		swap_details: { desired_category: { id: 1, name: 'Books' }, desired_description: 'A novel' },
		created_at: '2026-10-18T10:00:00.000Z',
	});
	assert.deepEqual(queries[0].values, [12]);
	assert.match(queries[0].sql, /WHERE i\.item_id = \$1\s*$/);
	assert.doesNotMatch(queries[0].sql, /item_status\s*(?:<>|!=|=)/);
	assert.match(queries[0].sql, /JOIN users u/);
	assert.match(queries[0].sql, /JOIN categories c/);
	assert.match(queries[0].sql, /FROM item_images im/);
	assert.match(queries[0].sql, /LEFT JOIN item_swap_details sd/);

	role = 'super_admin';
	assert.equal((await fetch(`${url}/12`)).status, 200);
	found = false;
	assert.equal((await fetch(`${url}/12`)).status, 404);
	failQuery = true;
	assert.equal((await fetch(`${url}/12`)).status, 503);
});

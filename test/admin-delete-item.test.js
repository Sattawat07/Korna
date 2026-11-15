import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('DELETE /api/admin/items/:id hides an item and rejects pending requests atomically', async (t) => {
	let userId = 7;
	let role = 'admin';
	let itemStatus = 'pending';
	let missingItem = false;
	let failNotification = false;
	let connectFails = false;
	const statements = [];
	let releases = 0;
	const itemRow = {
		item_id: '12', item_owner_id: '8', item_title: 'Desk lamp',
		item_description: 'Works well', item_defects: null, item_type: 'free',
		item_created_at: '2026-10-18T10:00:00.000Z', category_id: '4',
		category_name: 'Electronics', owner_name: 'Nina', desired_description: null,
		desired_category_id: null, desired_category_name: null,
		images: [], image_url: null,
	};
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role }] };
		assert.fail('Admin deletion must use its transaction client');
	});
	t.mock.method(pool, 'connect', async () => {
		if (connectFails) throw new Error('database unavailable');
		return {
			query: async (sql, values) => {
				statements.push({ sql, values });
				if (sql.includes('FOR UPDATE OF i')) {
					return { rows: missingItem ? [] : [{ ...itemRow, item_status: itemStatus }] };
				}
				if (sql.includes('WITH rejected')) {
					if (failNotification) throw new Error('notification insert failed');
					return { rows: [] };
				}
				return { rows: [] };
			},
			release: () => { releases++; },
		};
	});
	const app = express();
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/items/12`;

	userId = null;
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
	userId = 7;
	role = 'user';
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 403);
	role = 'admin';
	assert.equal(statements.length, 0);
	for (const id of ['0', 'abc', '9007199254740992']) {
		const invalid = await fetch(url.replace(/\/12$/, `/${id}`), { method: 'DELETE' });
		assert.equal(invalid.status, 400);
	}
	assert.equal(statements.length, 0);

	missingItem = true;
	const missing = await fetch(url, { method: 'DELETE' });
	assert.equal(missing.status, 404);
	assert.equal((await missing.json()).error.code, 'NOT_FOUND');
	assert.deepEqual(statements.map(({ sql }) => sql.trim().split(/\s+/)[0]),
		['BEGIN', 'SELECT', 'ROLLBACK']);
	assert.equal(releases, 1);

	statements.length = 0;
	missingItem = false;
	itemStatus = 'removed';
	const alreadyRemoved = await fetch(url, { method: 'DELETE' });
	assert.equal(alreadyRemoved.status, 409);
	assert.equal((await alreadyRemoved.json()).error.code, 'INVALID_STATE');
	assert.deepEqual(statements.map(({ sql }) => sql.trim().split(/\s+/)[0]),
		['BEGIN', 'SELECT', 'ROLLBACK']);
	assert.equal(releases, 2);

	statements.length = 0;
	itemStatus = 'pending';
	const removed = await fetch(url, { method: 'DELETE' });
	assert.equal(removed.status, 200);
	const { item } = await removed.json();
	assert.equal(item.id, 12);
	assert.equal(item.status, 'removed');
	assert.deepEqual(item.owner, { id: 8, name: 'Nina' });
	assert.deepEqual(item.images, []);
	assert.deepEqual(statements.map(({ sql }) => sql.trim().split(/\s+/)[0]),
		['BEGIN', 'SELECT', 'UPDATE', 'WITH', 'COMMIT']);
	assert.deepEqual(statements[1].values, [12]);
	assert.match(statements[1].sql, /FOR UPDATE OF i/);
	assert.deepEqual(statements[2].values, [12]);
	assert.match(statements[2].sql, /SET item_status = 'removed'/);
	assert.deepEqual(statements[3].values, [12, 7]);
	assert.match(statements[3].sql, /request_status = 'pending'/);
	assert.match(statements[3].sql, /SET request_status = 'rejected'/);
	assert.match(statements[3].sql, /'request_decided', 'rejected'/);
	assert.equal(releases, 3);

	statements.length = 0;
	failNotification = true;
	const failed = await fetch(url, { method: 'DELETE' });
	assert.equal(failed.status, 503);
	assert.equal((await failed.json()).error.code, 'DATABASE_UNAVAILABLE');
	assert.equal(statements.at(-1).sql, 'ROLLBACK');
	assert.equal(statements.some(({ sql }) => sql === 'COMMIT'), false);
	assert.equal(releases, 4);

	connectFails = true;
	const unavailable = await fetch(url, { method: 'DELETE' });
	assert.equal(unavailable.status, 503);
	assert.equal(releases, 4);
});

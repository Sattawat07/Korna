import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('permanent admin deletion enforces role and removed status, then deletes dependencies transactionally', async (t) => {
	let userId = 7;
	let role = 'admin';
	let itemStatus = 'removed';
	let missing = false;
	let failRequests = false;
	const statements = [];
	let releases = 0;
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role }] };
		assert.fail('Deletion must use the transaction client');
	});
	t.mock.method(pool, 'connect', async () => ({
		query: async (sql, values) => {
			statements.push({ sql, values });
			if (sql.includes('FOR UPDATE')) return { rows: missing ? [] : [{ item_status: itemStatus }] };
			if (sql.includes('SELECT image_url FROM item_images')) return { rows: [] };
			if (sql.includes('DELETE FROM requests') && failRequests) throw new Error('write failed');
			return { rows: [] };
		},
		release: () => { releases++; },
	}));
	const app = express();
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/items/12/permanent`;

	userId = null;
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
	userId = 7;
	role = 'user';
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 403);
	role = 'admin';
	assert.equal((await fetch(url.replace('/12/', '/abc/'), { method: 'DELETE' })).status, 400);
	assert.equal(statements.length, 0);

	missing = true;
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 404);
	assert.equal(statements.at(-1).sql, 'ROLLBACK');
	statements.length = 0;
	missing = false;
	itemStatus = 'available';
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 409);
	assert.equal(statements.at(-1).sql, 'ROLLBACK');
	statements.length = 0;
	itemStatus = 'removed';
	const success = await fetch(url, { method: 'DELETE' });
	assert.equal(success.status, 200);
	assert.deepEqual(await success.json(), { deleted: true, id: 12 });
	assert.deepEqual(statements.map(({ sql }) => sql.trim().split(/\s+/)[0]),
		['BEGIN', 'SELECT', 'SELECT', 'DELETE', 'DELETE', 'DELETE', 'COMMIT']);
	assert.match(statements[3].sql, /DELETE FROM notifications/);
	assert.match(statements[4].sql, /DELETE FROM requests/);
	assert.match(statements[5].sql, /DELETE FROM items/);
	assert.equal(releases, 3);

	statements.length = 0;
	failRequests = true;
	assert.equal((await fetch(url, { method: 'DELETE' })).status, 503);
	assert.equal(statements.at(-1).sql, 'ROLLBACK');
	assert.equal(statements.some(({ sql }) => sql === 'COMMIT'), false);
});

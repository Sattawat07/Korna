import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('PATCH /api/admin/users/:id/role promotes users and is idempotent', async (t) => {
	let userId = 7;
	let actorRole = 'admin';
	let targetRole = 'user';
	let targetExists = true;
	let failUpdate = false;
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) {
			return { rows: [{ id: '7', role: actorRole }] };
		}
		queries.push({ sql, values });
		if (failUpdate) throw new Error('database unavailable');
		if (!targetExists) return { rows: [] };
		targetRole = 'admin';
		return { rows: [{
			user_id: '8', user_name: 'Nina', user_email: 'nina@example.com',
			role: targetRole, user_room_number: 'A-304', user_phone_number: null,
			user_created_at: '2026-10-18T10:00:00.000Z', items_count: '3',
		}] };
	});
	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/users/8/role`;
	const patch = (target, body) => fetch(target, {
		method: 'PATCH', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

	userId = null;
	assert.equal((await patch(url, { role: 'admin' })).status, 401);
	userId = 7;
	actorRole = 'user';
	assert.equal((await patch(url, { role: 'admin' })).status, 403);
	actorRole = 'admin';
	assert.equal(queries.length, 0);

	for (const [target, body] of [
		[url.replace('/users/8/', '/users/0/'), { role: 'admin' }],
		[url, { role: 'user' }],
		[url, {}],
		[url, { role: 'super_admin' }],
	]) {
		const invalid = await patch(target, body);
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, 0);

	const promoted = await patch(url, { role: 'admin' });
	assert.equal(promoted.status, 200);
	assert.deepEqual(await promoted.json(), {
		user: { id: 8, name: 'Nina', email: 'nina@example.com', role: 'admin',
			room_number: 'A-304', phone_number: null,
			created_at: '2026-10-18T10:00:00.000Z', items_count: 3 },
	});
	assert.deepEqual(queries[0].values, [8]);
	assert.match(queries[0].sql, /UPDATE users SET role = 'admin' WHERE user_id = \$1/);
	assert.match(queries[0].sql, /item_status <> 'removed'/);
	assert.doesNotMatch(queries[0].sql, /password_hash|password_salt/);
	assert.equal(targetRole, 'admin');

	const repeated = await patch(url, { role: 'admin' });
	assert.equal(repeated.status, 200);
	assert.equal((await repeated.json()).user.role, 'admin');

	targetExists = false;
	const missing = await patch(url, { role: 'admin' });
	assert.equal(missing.status, 404);
	assert.equal((await missing.json()).error.code, 'NOT_FOUND');

	failUpdate = true;
	const unavailable = await patch(url, { role: 'admin' });
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

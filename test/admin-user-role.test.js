import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('only a super admin can change another user role', async (t) => {
	let sessionUserId = 7;
	let sessionRole = 'super_admin';
	let actorRole = 'super_admin';
	let targetRole = 'user';
	let targetExists = true;
	let superAdminCount = '2';
	let failUpdate = false;
	let releases = 0;
	const statements = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql) => {
		assert.match(sql, /SELECT user_id AS id, role/);
		return { rows: [{ id: '7', role: sessionRole }] };
	});
	t.mock.method(pool, 'connect', async () => ({
		async query(sql, values) {
			statements.push({ sql, values });
			if (sql === 'SELECT role FROM users WHERE user_id = $1') {
				return { rows: values[0] === 7 ? [{ role: actorRole }] :
					(targetExists ? [{ role: targetRole }] : []) };
			}
			if (sql.includes('SELECT COUNT(*) AS total FROM users')) {
				return { rows: [{ total: superAdminCount }] };
			}
			if (sql.includes('WITH updated AS')) {
				if (failUpdate) throw new Error('database unavailable');
				targetRole = values[1];
				return { rows: [{ user_id: '8', user_name: 'Nina', user_email: 'nina@example.com',
					role: targetRole, user_avatar_url: null, user_room_number: '101',
					user_phone_number: null, user_created_at: '2026-01-01', items_count: '3' }] };
			}
			return { rows: [] };
		},
		release() { releases++; },
	}));

	const app = express();
	app.use(express.json());
	app.use((req, _res, next) => { req.session = sessionUserId ? { userId: sessionUserId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/users`;
	const patch = async (id, role) => fetch(`${url}/${id}/role`, {
		method: 'PATCH', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ role }),
	});

	sessionUserId = null;
	assert.equal((await patch(8, 'admin')).status, 401);
	sessionUserId = 7;
	for (const deniedRole of ['user', 'admin']) {
		sessionRole = deniedRole;
		assert.equal((await patch(8, 'admin')).status, 403);
	}
	assert.equal(statements.length, 0);
	sessionRole = 'super_admin';
	assert.equal((await patch(8, 'super_admin')).status, 400);
	assert.equal((await patch(7, 'user')).status, 409);
	assert.equal(statements.length, 0);

	const promoted = await patch(8, 'admin');
	assert.equal(promoted.status, 200);
	assert.deepEqual((await promoted.json()).user, {
		id: 8, name: 'Nina', avatar_url: null, email: 'nina@example.com', role: 'admin',
		room_number: '101', phone_number: null, created_at: '2026-01-01', items_count: 3,
	});
	assert.ok(statements.some(({ sql, values }) => sql.includes('WITH updated AS') &&
		values[0] === 8 && values[1] === 'admin'));
	assert.ok(statements.some(({ sql }) => sql === 'LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE'));
	assert.equal((await patch(8, 'user')).status, 200);
	assert.equal(targetRole, 'user');

	targetRole = 'super_admin';
	superAdminCount = '1';
	assert.equal((await patch(8, 'user')).status, 409);
	assert.equal(targetRole, 'super_admin');
	superAdminCount = '2';
	assert.equal((await patch(8, 'user')).status, 200);

	actorRole = 'admin';
	assert.equal((await patch(8, 'admin')).status, 403);
	actorRole = 'super_admin';
	targetExists = false;
	assert.equal((await patch(8, 'admin')).status, 404);
	targetExists = true;
	failUpdate = true;
	assert.equal((await patch(8, 'admin')).status, 503);
	assert.ok(statements.some(({ sql }) => sql === 'ROLLBACK'));
	assert.ok(releases >= 7);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { meRouter } from '../backend/routes/me.js';

test('PATCH /api/me validates fields and updates only the supplied profile values', async (t) => {
	const updates = [];
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		updates.push({ sql, values });
		return { rows: [{
			id: '7', name: 'Nina', email: 'nina@example.com', role: 'user',
			room_number: 'A-304', phone_number: values[0], created_at: '2026-10-18T10:00:00.000Z',
		}] };
	});

	const app = express();
	app.use(express.json());
	let userId = 7;
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/me', meRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/me`;
	const patch = body => fetch(url, {
		method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
	});

	const invalid = await patch({ name: '   ', role: 'admin' });
	assert.equal(invalid.status, 400);
	assert.deepEqual(Object.keys((await invalid.json()).error.details).sort(), ['name', 'role']);
	assert.equal(updates.length, 0);
	const unusualField = await patch(JSON.parse('{"__proto__":"admin"}'));
	assert.equal(unusualField.status, 400);
	assert.equal((await unusualField.json()).error.details.__proto__, 'This field cannot be updated');
	assert.equal(updates.length, 0);

	const cleared = await patch({ phone_number: null });
	assert.equal(cleared.status, 200);
	assert.equal((await cleared.json()).user.phone_number, null);
	assert.deepEqual(updates[0].values, [null, 7]);
	assert.match(updates[0].sql, /SET user_phone_number = \$1/);
	assert.doesNotMatch(updates[0].sql, /user_name =|user_room_number =/);

	const renamed = await patch({ name: '  Nina  ', room_number: '  A-305  ' });
	assert.equal(renamed.status, 200);
	assert.deepEqual(updates[1].values, ['Nina', 'A-305', 7]);
	assert.doesNotMatch(updates[1].sql, /user_phone_number =/);

	userId = null;
	const unauthenticated = await patch({ name: 'Nina' });
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');
	assert.equal(updates.length, 2);
});

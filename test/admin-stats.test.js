import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { adminRouter } from '../backend/routes/admin.js';

test('GET /api/admin/stats enforces admin access and returns the contracted dashboard data', async (t) => {
	let userId = 7;
	let role = 'admin';
	let failStats = false;
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) {
			return { rows: [{ id: '7', role }] };
		}
		queries.push({ sql, values });
		if (failStats) throw new Error('database unavailable');
		if (sql.includes('FROM items i')) {
			return { rows: [{ id: '4', name: 'Electronics', total: '12' }] };
		}
		if (sql.includes('FROM items')) {
			return { rows: [{
				total: '12', active: '10', removed: '2', available_count: '4',
				pending_count: '3', completed_count: '3', free_count: '7', swap_count: '5',
			}] };
		}
		if (sql.includes('FROM users')) return { rows: [{ total: '8' }] };
		if (sql.includes('FROM days d')) {
			return { rows: Array.from({ length: 7 }, (_, i) => ({
				date: `2026-10-${String(i + 12).padStart(2, '0')}`,
				pending: i === 6 ? '1' : '0', accepted: '0', rejected: '0',
			})) };
		}
		if (sql.includes('ORDER BY request_created_at DESC')) {
			return { rows: [{ id: '31', item_id: '12', status: 'pending',
				created_at: '2026-10-18T11:00:00.000Z' }] };
		}
		return { rows: [{ total: '6', pending_count: '2', accepted_count: '3', rejected_count: '1' }] };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
	app.use('/api/admin', adminRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise((resolve) => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) =>
		server.close((error) => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/admin/stats`;

	userId = null;
	const unauthenticated = await fetch(url);
	assert.equal(unauthenticated.status, 401);
	assert.equal(queries.length, 0);

	userId = 7;
	role = 'user';
	const forbidden = await fetch(url);
	assert.equal(forbidden.status, 403);
	assert.equal(queries.length, 0);

	role = 'admin';
	const response = await fetch(url);
	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		total: 12, active: 10, removed: 2, total_users: 8, total_requests: 6,
		by_status: { available: 4, pending: 3, completed: 3, removed: 2 },
		requests_by_status: { pending: 2, accepted: 3, rejected: 1 },
		by_type: { free: 7, swap: 5 },
		by_category: [{ id: 4, name: 'Electronics', total: 12 }],
		requests_last_7_days: Array.from({ length: 7 }, (_, i) => ({
			date: `2026-10-${String(i + 12).padStart(2, '0')}`,
			pending: i === 6 ? 1 : 0, accepted: 0, rejected: 0,
		})),
		recent_requests: [{ id: 31, item_id: 12, status: 'pending',
			created_at: '2026-10-18T11:00:00.000Z' }],
	});
	assert.deepEqual(queries.find(({ sql }) => sql.includes('LIMIT $1')).values, [5]);
	const daysSql = queries.find(({ sql }) => sql.includes('FROM days d')).sql;
	assert.match(daysSql, /generate_series\(6, 0, -1\)/);
	assert.match(daysSql, /request_created_at.*Asia\/Bangkok/);
	assert.match(queries.find(({ sql }) => sql.includes('FROM items') && !sql.includes('FROM items i')).sql,
		/item_status = 'removed'/);

	const custom = await fetch(`${url}?recent_requests_limit=10`);
	assert.equal(custom.status, 200);
	assert.deepEqual(queries.findLast(({ sql }) => sql.includes('LIMIT $1')).values, [10]);

	const queryCount = queries.length;
	for (const query of ['0', '51', '1.5', '-1', 'abc', '1&recent_requests_limit=2']) {
		const invalid = await fetch(`${url}?recent_requests_limit=${query}`);
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}
	assert.equal(queries.length, queryCount);

	failStats = true;
	const unavailable = await fetch(url);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

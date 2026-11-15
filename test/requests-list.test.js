import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { requestsRouter } from '../backend/routes/requests.js';

test('GET /api/requests lists sent and received requests with ownership checks', async (t) => {
	let userId = 7;
	let itemOwnerId = '7';
	let itemExists = true;
	let failList = false;
	let requestRows = [
		{
			request_id: '31', request_message: 'Interested', request_status: 'pending',
			request_created_at: '2026-10-18T11:00:00.000Z', item_id: '12',
			item_title: 'Lamp', item_type: 'swap', item_status: 'pending',
			requester_id: '7', requester_name: 'Nina', offer_id: '90',
			offer_description: 'A novel', item_image_url: '/uploads/items/lamp.webp',
			offer_image_url: '/uploads/offers/book.webp',
			offer_images: [{ id: 201, url: '/uploads/offers/book.webp', position: 0 }],
		},
	];
	const queries = [];
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (sql, values) => {
		if (sql.includes('SELECT user_id AS id, role')) return { rows: [{ id: '7', role: 'user' }] };
		queries.push({ sql, values });
		if (sql.includes('SELECT item_owner_id FROM items'))
			return { rows: itemExists ? [{ item_owner_id: itemOwnerId }] : [] };
		if (failList) throw new Error('database unavailable');
		return { rows: requestRows };
	});

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/requests', requestsRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/requests`;

	const sent = await fetch(`${url}?role=sent`);
	assert.equal(sent.status, 200);
	const sentRequests = (await sent.json()).requests;
	assert.equal(sentRequests[0].id, 31);
	assert.deepEqual(sentRequests[0].swap_offer, {
		description: 'A novel', image_url: '/uploads/offers/book.webp',
		images: [{ id: 201, url: '/uploads/offers/book.webp', position: 0 }],
	});
	assert.deepEqual(queries[0].values, [7]);
	assert.match(queries[0].sql, /r\.requester_user_id = \$1/);
	itemOwnerId = '8';
	const sentFiltered = await fetch(`${url}?role=sent&item_id=12`);
	assert.equal(sentFiltered.status, 200);
	assert.equal((await sentFiltered.json()).requests[0].id, 31);
	assert.deepEqual(queries[1].values, [7, 12]);
	assert.match(queries[1].sql, /r\.requester_user_id = \$1 AND i\.item_id = \$2/);
	itemOwnerId = '7';

	requestRows = [{
		request_id: '32', request_message: null, request_status: 'accepted',
		request_created_at: '2026-10-19T11:00:00.000Z', item_id: '12',
		item_title: 'Chair', item_type: 'free', item_status: 'completed',
		requester_id: '8', requester_name: 'Ton', offer_id: null,
		item_image_url: null, offer_image_url: null, offer_images: [],
	}];
	const received = await fetch(`${url}?role=received&item_id=12`);
	assert.equal(received.status, 200);
	const receivedRequests = (await received.json()).requests;
	assert.equal(receivedRequests[0].requester.name, 'Ton');
	assert.equal(receivedRequests[0].swap_offer, null);
	assert.deepEqual(queries.at(-2).values, [12]);
	assert.deepEqual(queries.at(-1).values, [7, 12]);
	assert.match(queries.at(-1).sql, /i\.item_owner_id = \$1 AND i\.item_id = \$2/);

	itemOwnerId = '8';
	const forbidden = await fetch(`${url}?role=received&item_id=12`);
	assert.equal(forbidden.status, 403);
	assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');

	itemExists = false;
	const missingItem = await fetch(`${url}?role=received&item_id=12`);
	assert.equal(missingItem.status, 404);
	assert.equal((await missingItem.json()).error.code, 'NOT_FOUND');

	for (const query of ['?role=other', '?role=received&item_id=0', '?role=sent&item_id=0']) {
		const invalid = await fetch(url + query);
		assert.equal(invalid.status, 400);
		assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	}

	userId = null;
	const unauthenticated = await fetch(`${url}?role=sent`);
	assert.equal(unauthenticated.status, 401);
	assert.equal((await unauthenticated.json()).error.code, 'UNAUTHENTICATED');

	userId = 7;
	requestRows = [];
	const empty = await fetch(`${url}?role=sent`);
	assert.equal(empty.status, 200);
	assert.deepEqual(await empty.json(), { requests: [] });

	failList = true;
	const unavailable = await fetch(`${url}?role=sent`);
	assert.equal(unavailable.status, 503);
	assert.equal((await unavailable.json()).error.code, 'DATABASE_UNAVAILABLE');
});

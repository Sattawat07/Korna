import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { itemsRouter } from '../backend/routes/items.js';

test('request creation permits multiple users, rejects duplicates, and notifies the owner atomically', async (t) => {
  let userId = 7;
  let itemOwnerId = '8';
  let itemStatus = 'available';
  let duplicate = false;
  const statements = [];
  t.mock.method(pool, 'query', async (_sql, values) => ({ rows: [{ id: String(values[0]), role: 'user' }] }));
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT item_owner_id, item_type')) return { rows: [{ item_owner_id: itemOwnerId,
        item_type: 'free', item_status: itemStatus }] };
      if (sql.includes('SELECT request_id FROM requests')) return { rows: duplicate ? [{ request_id: '31' }] : [] };
      if (sql.includes('RETURNING request_id')) return { rows: [{ request_id: '31' }] };
      if (sql.includes('SELECT r.request_id')) return { rows: [{
        request_id: '31', request_message: 'May I have it?', request_status: 'pending',
        request_created_at: '2026-10-18T11:00:00.000Z', item_id: '12', item_title: 'Chair',
        item_type: 'free', item_status: 'pending', requester_id: String(userId),
        requester_name: 'Ton', offer_id: null, item_image_url: null,
      }] };
      return { rows: [] };
    }, release: () => {},
  }));
  const app = express();
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use('/api/items', itemsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/items/12/requests`;
  const send = () => { const body = new FormData(); body.set('message', 'May I have it?');
    return fetch(url, { method: 'POST', body }); };
  userId = null;
  assert.equal((await send()).status, 401);
  userId = 7;
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{}' })).status, 415);
  const created = await send();
  assert.equal(created.status, 201);
  assert.equal((await created.json()).request.item.status, 'pending');
  assert.ok(statements.some(({ sql }) => sql.includes('FOR UPDATE')));
  assert.ok(statements.some(({ sql }) => sql.includes("SET item_status = 'pending'")));
  assert.ok(statements.some(({ sql, values }) => sql.includes("'request_received'") && values[0] === 8));
  assert.equal(statements.at(-1).sql, 'COMMIT');
  itemStatus = 'pending'; userId = 9;
  assert.equal((await send()).status, 201);
  duplicate = true;
  assert.equal((await send()).status, 409);
  itemOwnerId = '9';
  assert.equal((await send()).status, 403);
  itemOwnerId = '8'; itemStatus = 'completed';
  assert.equal((await send()).status, 409);
});

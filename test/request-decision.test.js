import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { requestsRouter } from '../backend/routes/requests.js';

test('owner acceptance completes item and rejects others; rejection restores availability when last', async (t) => {
  let userId = 7;
  let ownerId = '7';
  let requestStatus = 'pending';
  let itemStatus = 'pending';
  let pendingCount = 0;
  const statements = [];
  t.mock.method(pool, 'query', async (_sql, values) => ({ rows: [{ id: String(values[0]), role: 'user' }] }));
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT request_item_id FROM requests')) return { rows: [{ request_item_id: '12' }] };
      if (sql.includes('SELECT item_owner_id, item_status')) return { rows: [{ item_owner_id: ownerId, item_status: itemStatus }] };
      if (sql.includes('SELECT request_status, requester_user_id')) return { rows: [{ request_status: requestStatus, requester_user_id: '8' }] };
      if (sql.includes('COUNT(*) AS pending_count')) return { rows: [{ pending_count: String(pendingCount) }] };
      if (sql.includes('SELECT r.request_id')) return { rows: [{
        request_id: '31', request_message: null, request_status: values && statements.some((s) => s.sql.includes("SET request_status = 'rejected'")) ? 'accepted' : 'rejected',
        request_created_at: '2026-10-18T11:00:00.000Z', item_id: '12', item_title: 'Chair',
        item_type: 'free', item_status: itemStatus, requester_id: '8', requester_name: 'Ton',
        offer_id: null, item_image_url: null,
      }] };
      return { rows: [] };
    }, release: () => {},
  }));
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use('/api/requests', requestsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/requests/31/decision`;
  const decide = (decision) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
  userId = null;
  assert.equal((await decide('accepted')).status, 401);
  userId = 7;
  assert.equal((await decide('other')).status, 400);
  ownerId = '9';
  assert.equal((await decide('accepted')).status, 403);
  ownerId = '7';
  const accepted = await decide('accepted');
  assert.equal(accepted.status, 200);
  assert.ok(statements.some(({ sql }) => sql.includes('WITH rejected AS')));
  assert.ok(statements.some(({ sql }) => sql.includes("SET item_status = 'completed'")));
  assert.ok(statements.some(({ sql, values }) => sql.includes("'request_decided', $5") && values[4] === 'accepted'));
  assert.equal(statements.at(-1).sql, 'COMMIT');
  statements.length = 0;
  requestStatus = 'accepted'; itemStatus = 'completed';
  assert.equal((await decide('accepted')).status, 409);
  requestStatus = 'pending'; itemStatus = 'pending';
  assert.equal((await decide('rejected')).status, 200);
  assert.ok(statements.some(({ sql }) => sql.includes("SET item_status = 'available'")));
  statements.length = 0; pendingCount = 1;
  assert.equal((await decide('rejected')).status, 200);
  assert.equal(statements.some(({ sql }) => sql.includes("SET item_status = 'available'")), false);
});

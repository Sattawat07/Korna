import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { itemsRouter } from '../backend/routes/items.js';

test('owner can edit and hide available items, with state checks under a row lock', async (t) => {
  let userId = 7;
  let ownerId = '7';
  let status = 'available';
  const statements = [];
  const item = {
    item_id: '12', item_owner_id: ownerId, item_title: 'Lamp',
    item_description: null, item_defects: null, item_type: 'swap', item_status: status,
    item_created_at: '2026-10-18T10:00:00.000Z', category_id: '4',
    category_name: 'Electronics', owner_name: 'Nina', desired_description: 'Novel',
    desired_category_id: null, desired_category_name: null, images: [], image_url: null,
  };
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: '7', role: 'user' }] }));
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT category_id FROM categories')) return { rows: [{ category_id: values[0] }] };
      if (sql.includes('SELECT i.item_id')) return { rows: [{ ...item, item_owner_id: ownerId,
        item_status: status, item_title: sql.includes('FOR UPDATE') ? 'Lamp' : 'New lamp' }] };
      return { rows: [] };
    },
    release: () => {},
  }));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.session = userId ? { userId } : {}; next(); });
  app.use('/api/items', itemsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/items/12`;
  const patch = (body) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const edited = await patch({ title: 'New lamp', desired_description: 'Textbook' });
  assert.equal(edited.status, 200);
  assert.equal((await edited.json()).item.title, 'New lamp');
  assert.ok(statements.some(({ sql }) => sql.includes('FOR UPDATE OF i')));
  assert.ok(statements.some(({ sql }) => sql.includes('UPDATE item_swap_details')));
  assert.equal(statements.at(-1).sql, 'COMMIT');
  statements.length = 0;
  ownerId = '8';
  assert.equal((await patch({ title: 'Hijack' })).status, 403);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 403);
  assert.equal(statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
  ownerId = '7'; status = 'pending'; statements.length = 0;
  assert.equal((await patch({ title: 'Late' })).status, 409);
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 409);
  assert.equal(statements.some(({ sql }) => sql.startsWith('UPDATE')), false);
  status = 'available';
  assert.equal((await patch({ type: 'free' })).status, 400);
  assert.equal((await patch({ category_id: [4] })).status, 400);
  assert.equal((await patch({ desired_description: '' })).status, 400);
  const removed = await fetch(url, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).item.status, 'removed');
  assert.ok(statements.some(({ sql }) => sql.includes("SET item_status = 'removed'")));
  userId = null;
  assert.equal((await fetch(url, { method: 'DELETE' })).status, 401);
});

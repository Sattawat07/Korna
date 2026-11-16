import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { pool } from '../backend/db.js';
import { itemsRouter } from '../backend/routes/items.js';

test('feed filters, paginates and exposes public item detail', async (t) => {
  const queries = [];
  const row = {
    item_id: '12', item_owner_id: '8', item_title: 'Lamp', item_description: 'Works',
    item_defects: null, item_type: 'swap', item_status: 'pending',
    item_created_at: '2026-10-18T10:00:00.000Z', category_id: '4',
    category_name: 'Electronics', owner_name: 'Nina', desired_description: 'Novel',
    desired_category_id: '1', desired_category_name: 'Books',
    images: [{ id: 2, url: '/uploads/items/lamp.webp', position: 0 }],
    image_url: '/uploads/items/lamp.webp',
  };
  let missing = false;
  let viewerId = null;
  t.mock.method(pool, 'query', async (sql, values) => {
    queries.push({ sql, values });
    const hiddenOwnPost = sql.includes('i.item_owner_id <>') && values.includes(8);
    if (sql.includes('COUNT(*) AS total')) return { rows: [{ total: hiddenOwnPost ? '0' : '1' }] };
    return { rows: missing || hiddenOwnPost ? [] : [row] };
  });
  const app = express();
  app.use((req, _res, next) => { req.session = viewerId ? { userId: viewerId } : {}; next(); });
  app.use('/api/items', itemsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/items`;
  const feed = await fetch(`${url}?q=lamp&category_id=4&type=swap&sort=oldest&from=2026-10-18&to=2026-10-19&page=2&limit=1`);
  assert.equal(feed.status, 200);
  assert.equal((await feed.json()).items[0].owner.name, 'Nina');
  assert.deepEqual(queries[0].values, ['lamp', 4, 'swap', '2026-10-18', '2026-10-19']);
  assert.match(queries[1].sql, /item_created_at ASC, i\.item_id ASC/);
  assert.match(queries[1].sql, /item_status IN \('available', 'pending'\)/);
  assert.match(queries[1].sql, /Asia\/Bangkok/);
  const detail = await fetch(`${url}/12`);
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).item.swap_details.desired_description, 'Novel');
  assert.match(queries.at(-1).sql, /item_status <> 'removed'/);
  viewerId = '8';
  const ownFeed = await fetch(`${url}?q=lamp`);
  assert.equal(ownFeed.status, 200);
  assert.deepEqual(await ownFeed.json(), {
    items: [], pagination: { page: 1, limit: 12, total: 0, total_pages: 0 },
  });
  assert.deepEqual(queries.at(-2).values, ['lamp', 8]);
  assert.deepEqual(queries.at(-1).values, ['lamp', 8, 12, 0]);
  assert.match(queries.at(-2).sql, /i\.item_owner_id <> \$2/);
  assert.match(queries.at(-1).sql, /i\.item_owner_id <> \$2/);
  assert.equal((await fetch(`${url}/12`)).status, 200);
  viewerId = 7;
  const otherFeed = await fetch(url);
  assert.equal((await otherFeed.json()).items[0].id, 12);
  viewerId = null;
  missing = true;
  assert.equal((await fetch(`${url}/12`)).status, 404);
  const queryCount = queries.length;
  for (const query of ['page=0', 'limit=51', 'from=2026-02-30', 'from=0000-01-01', 'from=2026-10-20&to=2026-10-19', 'sort=random', 'q=a&q=b']) {
    const response = await fetch(`${url}?${query}`);
    assert.equal(response.status, 400, query);
  }
  assert.equal((await fetch(`${url}/0`)).status, 400);
  assert.equal(queries.length, queryCount);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import { pool } from '../backend/db.js';
import { config } from '../backend/config.js';
import { itemsRouter } from '../backend/routes/items.js';

test('creating a swap post validates multipart fields and stores images in order', async (t) => {
  let userId = 7;
  const statements = [];
  let imageUrl;
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: '7', role: 'user' }] }));
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.includes('SELECT category_id FROM categories')) return { rows: [{ category_id: values[0] }] };
      if (sql.includes('RETURNING item_id')) return { rows: [{ item_id: '12' }] };
      if (sql.includes('INSERT INTO item_images')) imageUrl = values[1];
      if (sql.includes('SELECT i.item_id')) return { rows: [{
        item_id: '12', item_owner_id: '7', item_title: 'Lamp', item_description: null,
        item_defects: null, item_type: 'swap', item_status: 'available',
        item_created_at: '2026-10-18T10:00:00.000Z', category_id: '4',
        category_name: 'Electronics', owner_name: 'Nina', desired_description: 'Novel',
        desired_category_id: null, desired_category_name: null,
        images: imageUrl ? [{ id: 1, url: imageUrl, position: 0 }] : [], image_url: imageUrl ?? null,
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
  t.after(async () => { if (imageUrl) await unlink(join(config.uploadDir, imageUrl.slice('/uploads/'.length))); });
  const url = `http://127.0.0.1:${server.address().port}/api/items`;
  const form = () => { const data = new FormData(); data.set('title', 'Lamp'); data.set('category_id', '4');
    data.set('type', 'swap'); data.set('desired_description', 'Novel'); return data; };
  userId = null;
  assert.equal((await fetch(url, { method: 'POST', body: form() })).status, 401);
  userId = 7;
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Lamp', category_id: 4, type: 'free' }) })).status, 415);
  const invalid = form(); invalid.delete('desired_description');
  assert.equal((await fetch(url, { method: 'POST', body: invalid })).status, 400);
  assert.equal(statements.length, 0);
  const badImage = form(); badImage.append('images', new Blob(['not image'], { type: 'image/png' }), 'fake.png');
  assert.equal((await fetch(url, { method: 'POST', body: badImage })).status, 415);
  assert.equal(statements.length, 0);
  const valid = form();
  valid.append('images', new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }), 'lamp.png');
  const created = await fetch(url, { method: 'POST', body: valid });
  assert.equal(created.status, 201);
  const { item } = await created.json();
  assert.equal(item.status, 'available');
  assert.match(item.image_url, /^\/uploads\/items\/[\w-]+\.png$/);
  assert.deepEqual(item.images[0], { id: 1, url: item.image_url, position: 0 });
  assert.ok(statements.some(({ sql }) => sql.includes('INSERT INTO item_swap_details')));
  assert.equal(statements.at(-1).sql, 'COMMIT');
});

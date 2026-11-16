import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { pool } from '../backend/db.js';
import { config } from '../backend/config.js';
import { itemsRouter } from '../backend/routes/items.js';

test('swap offer images are cleaned up if notification insert fails', async (t) => {
  let savedUrl;
  const statements = [];
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: '7', role: 'user' }] }));
  t.mock.method(pool, 'connect', async () => ({
    query: async (sql, values) => {
      statements.push(sql);
      if (sql.includes('SELECT item_owner_id, item_type')) return { rows: [{
        item_owner_id: '8', item_type: 'swap', item_status: 'available',
      }] };
      if (sql.includes('SELECT request_id FROM requests')) return { rows: [] };
      if (sql.includes('RETURNING request_id')) return { rows: [{ request_id: '31' }] };
      if (sql.includes('RETURNING offer_id')) return { rows: [{ offer_id: '50' }] };
      if (sql.includes('INSERT INTO request_swap_offer_images')) savedUrl = values[1];
      if (sql.includes('INSERT INTO notifications')) throw new Error('notification failed');
      return { rows: [] };
    }, release: () => {},
  }));
  const app = express();
  app.use((req, _res, next) => { req.session = { userId: 7 }; next(); });
  app.use('/api/items', itemsRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/items/12/requests`;
  const form = new FormData();
  form.set('offer_description', 'A novel');
  form.append('offer_images', new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])],
    { type: 'image/png' }), 'book.png');
  const response = await fetch(url, { method: 'POST', body: form });
  assert.equal(response.status, 503);
  assert.match(savedUrl, /^\/uploads\/offers\/[\w-]+\.png$/);
  assert.equal(existsSync(join(config.uploadDir, savedUrl.slice('/uploads/'.length))), false);
  assert.equal(statements.at(-1), 'ROLLBACK');
  assert.equal(statements.includes('COMMIT'), false);
});

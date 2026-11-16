import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { pool } from '../backend/db.js';
import { config } from '../backend/config.js';
import { meRouter } from '../backend/routes/me.js';

test('PUT /api/me/avatar uploads and replaces an avatar safely', async (t) => {
	const uploadDir = await mkdtemp(join(tmpdir(), 'korna-avatar-'));
	const originalUploadDir = config.uploadDir;
	config.uploadDir = uploadDir;
	t.after(async () => {
		config.uploadDir = originalUploadDir;
		await rm(uploadDir, { recursive: true, force: true });
	});

	let avatarUrl = null;
	let failUpdate = false;
	let userId = 7;
	t.mock.method(pool, 'query', async () => ({ rows: [{ id: '7', role: 'user' }] }));
	t.mock.method(pool, 'connect', async () => ({
		query: async (sql, values) => {
			if (sql.startsWith('SELECT user_avatar_url')) return { rows: [{ user_avatar_url: avatarUrl }] };
			if (sql.startsWith('UPDATE users')) {
				if (failUpdate) throw new Error('database failed');
				avatarUrl = values[0];
			}
			return { rows: [] };
		},
		release() {},
	}));

	const app = express();
	app.use((req, _res, next) => { req.session = { userId }; next(); });
	app.use('/api/me', meRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/me/avatar`;
	const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
	const upload = async (content, type = 'image/png') => {
		const body = new FormData();
		body.append('avatar', new Blob([content], { type }), 'avatar.png');
		return fetch(url, { method: 'PUT', body });
	};

	userId = null;
	assert.equal((await upload(png)).status, 401);
	userId = 7;
	assert.equal((await fetch(url, { method: 'PUT' })).status, 415);
	const invalid = await upload(Buffer.from('not an image'));
	assert.equal(invalid.status, 400);
	assert.equal((await invalid.json()).error.code, 'VALIDATION_ERROR');
	assert.deepEqual(await readdir(uploadDir), []);

	const first = await upload(png);
	assert.equal(first.status, 200);
	const firstUrl = (await first.json()).avatar_url;
	assert.match(firstUrl, /^\/uploads\/avatars\/[0-9a-f-]+\.png$/);
	assert.deepEqual(await readFile(join(uploadDir, 'avatars', firstUrl.split('/').at(-1))), png);

	const second = await upload(png);
	assert.equal(second.status, 200);
	assert.notEqual((await second.json()).avatar_url, firstUrl);
	assert.equal((await readdir(join(uploadDir, 'avatars'))).length, 1);

	failUpdate = true;
	const before = avatarUrl;
	const failed = await upload(png);
	assert.equal(failed.status, 503);
	assert.equal(avatarUrl, before);
	assert.equal((await readdir(join(uploadDir, 'avatars'))).length, 1);
});

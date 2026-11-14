import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import nodemailer from 'nodemailer';
import { pool } from '../backend/db.js';
import { verifyPasswordResetOtp } from '../backend/password-reset-challenges.js';

test('password reset request keeps account existence private and rate limits requests', async (t) => {
	const sent = [];
	t.mock.method(nodemailer, 'createTransport', () => ({
		async sendMail(message) {
			sent.push(message);
			if (message.to === 'smtp-fail@example.test') throw new Error('mail unavailable');
		},
	}));
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async (_sql, [email]) => {
		if (email === 'db-fail@example.test') throw new Error('database unavailable');
		return { rows: email === 'missing@example.test' ? [] : [{ id: '42' }] };
	});
	const { authRouter } = await import('../backend/routes/auth.js');
	const app = express();
	app.use(express.json());
	app.use('/api/auth', authRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/auth/forgot-password/request`;
	const request = email => fetch(url, {
		method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
	});
	const challengeId = response => response.headers.get('set-cookie').match(/^reset_challenge=([0-9a-f]{64})/)[1];

	const existing = await request('existing@example.test');
	const existingBody = await existing.json();
	assert.equal(existing.status, 202);
	assert.deepEqual(existingBody, { message: 'If this account exists, a verification code has been sent.' });
	assert.match(existing.headers.get('set-cookie'), /; Max-Age=300;/i);
	assert.match(existing.headers.get('set-cookie'), /; HttpOnly/i);
	assert.match(existing.headers.get('set-cookie'), /; SameSite=Lax/i);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].to, 'existing@example.test');
	assert.equal(sent[0].subject, 'รหัสยืนยันการตั้งรหัสผ่านใหม่ Korna');
	assert.match(sent[0].text, /รหัสนี้มีอายุ 5 นาที/);
	const deliveredOtp = sent[0].text.match(/\b[0-9]{6}\b/)[0];
	assert.deepEqual(verifyPasswordResetOtp(challengeId(existing), deliveredOtp), { status: 'valid', userId: '42' });

	const missing = await request('missing@example.test');
	assert.equal(missing.status, 202);
	assert.deepEqual(await missing.json(), existingBody);
	assert.match(missing.headers.get('set-cookie'), /; Max-Age=300;/i);
	assert.equal(sent.length, 1);
	assert.equal(verifyPasswordResetOtp(challengeId(missing), '123456').status, 'invalid');

	const resendTooSoon = await request('existing@example.test');
	assert.equal(resendTooSoon.status, 429);
	assert.ok(Number(resendTooSoon.headers.get('retry-after')) > 0);
	assert.equal(sent.length, 1);

	const mailFailure = await request('smtp-fail@example.test');
	assert.equal(mailFailure.status, 202);
	assert.deepEqual(await mailFailure.json(), existingBody);
	assert.match(mailFailure.headers.get('set-cookie'), /; Max-Age=300;/i);
	const failedOtp = sent.at(-1).text.match(/\b[0-9]{6}\b/)[0];
	assert.equal(verifyPasswordResetOtp(challengeId(mailFailure), failedOtp).status, 'invalid');

	const invalidEmail = await request('not-an-email');
	assert.equal(invalidEmail.status, 400);
	const databaseFailure = await request('db-fail@example.test');
	assert.equal(databaseFailure.status, 503);
});

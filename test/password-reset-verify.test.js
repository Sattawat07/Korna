import assert from 'node:assert/strict';
import { test } from 'node:test';
import cookieParser from 'cookie-parser';
import express from 'express';
import { createPasswordResetChallenge } from '../backend/password-reset-challenges.js';
import { consumePasswordResetToken } from '../backend/password-reset-tokens.js';
import { authRouter } from '../backend/routes/auth.js';

test('password reset verification exchanges a valid OTP for a one-time cookie', async (t) => {
	const app = express();
	app.use(express.json());
	app.use(cookieParser());
	app.use('/api/auth', authRouter);
	const server = app.listen(0, '127.0.0.1');
	await new Promise(resolve => server.once('listening', resolve));
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
	const url = `http://127.0.0.1:${server.address().port}/api/auth/forgot-password/verify`;
	const verify = (challengeId, otp) => fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(challengeId ? { cookie: `reset_challenge=${challengeId}` } : {}),
		},
		body: JSON.stringify({ otp }),
	});

	const missing = await verify(null, '123456');
	assert.equal(missing.status, 410);
	assert.equal((await missing.json()).error.code, 'OTP_EXPIRED');

	const { challengeId, otp } = createPasswordResetChallenge('42');
	const incorrect = await verify(challengeId, 'wrong');
	assert.equal(incorrect.status, 400);
	assert.equal((await incorrect.json()).error.code, 'INVALID_OTP');

	const verified = await verify(challengeId, otp);
	assert.equal(verified.status, 204);
	assert.equal(await verified.text(), '');
	const cookies = verified.headers.getSetCookie();
	assert.ok(cookies.some(cookie => /^reset_challenge=;/i.test(cookie)));
	const tokenCookie = cookies.find(cookie => /^reset_token=/i.test(cookie));
	assert.match(tokenCookie, /; Max-Age=300;/i);
	assert.match(tokenCookie, /; HttpOnly/i);
	assert.match(tokenCookie, /; SameSite=Lax/i);
	const tokenId = tokenCookie.match(/^reset_token=([0-9a-f]{64})/)[1];
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'valid', userId: '42' });
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'expired' });

	const repeated = await verify(challengeId, otp);
	assert.equal(repeated.status, 410);

	const locked = createPasswordResetChallenge('43');
	for (let attempt = 1; attempt <= 5; attempt++) {
		const response = await verify(locked.challengeId, 'wrong');
		assert.equal(response.status, attempt === 5 ? 429 : 400);
		if (attempt === 5) assert.equal((await response.json()).error.code, 'TOO_MANY_ATTEMPTS');
	}
	assert.equal((await verify(locked.challengeId, locked.otp)).status, 429);
});

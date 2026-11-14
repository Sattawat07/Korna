import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createPasswordResetChallenge,
	deletePasswordResetChallenge,
	removeExpiredPasswordResetChallenges,
	RESET_CHALLENGE_TTL_MS,
	verifyPasswordResetOtp,
} from '../backend/password-reset-challenges.js';

test('valid reset OTP returns the user once', (t) => {
	t.mock.method(Date, 'now', () => 1_000_000);
	const { challengeId, otp } = createPasswordResetChallenge('42');
	assert.match(challengeId, /^[0-9a-f]{64}$/);
	assert.match(otp, /^[0-9]{6}$/);
	assert.deepEqual(verifyPasswordResetOtp(challengeId, otp), { status: 'valid', userId: '42' });
	assert.deepEqual(verifyPasswordResetOtp(challengeId, otp), { status: 'expired' });
});

test('five wrong OTP attempts lock a reset challenge', (t) => {
	t.mock.method(Date, 'now', () => 2_000_000);
	const { challengeId, otp } = createPasswordResetChallenge(42);
	const wrongOtp = otp === '000000' ? '000001' : '000000';
	for (let attempt = 1; attempt <= 4; attempt++) {
		assert.equal(verifyPasswordResetOtp(challengeId, wrongOtp).status, 'invalid');
	}
	assert.equal(verifyPasswordResetOtp(challengeId, wrongOtp).status, 'too_many_attempts');
	assert.equal(verifyPasswordResetOtp(challengeId, otp).status, 'too_many_attempts');
	deletePasswordResetChallenge(challengeId);
});

test('dummy challenge cannot verify an OTP', (t) => {
	t.mock.method(Date, 'now', () => 3_000_000);
	const { challengeId, otp } = createPasswordResetChallenge(null);
	assert.equal(otp, null);
	assert.equal(verifyPasswordResetOtp(challengeId, '123456').status, 'invalid');
	assert.equal(deletePasswordResetChallenge(challengeId), true);
});

test('expired reset challenges are removed', (t) => {
	let now = 4_000_000;
	t.mock.method(Date, 'now', () => now);
	const { challengeId, otp } = createPasswordResetChallenge(42);
	now += RESET_CHALLENGE_TTL_MS;
	removeExpiredPasswordResetChallenges();
	assert.equal(verifyPasswordResetOtp(challengeId, otp).status, 'expired');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pool } from '../backend/db.js';
import { requireAuth, requireRole } from '../backend/middleware/auth.js';
import { createSignupChallenge, removeExpiredSignupChallenges, verifySignupOtp } from '../backend/signup-challenges.js';
import { checkSignupRateLimit } from '../backend/signup-rate-limit.js';

function response() {
	return {
		statusCode: 200,
		status(code) { this.statusCode = code; return this; },
		json(body) { this.body = body; return this; },
	};
}

test('registration limits repeated email and IP, then allows requests after expiry', (t) => {
	let now = 1_000_000;
	t.mock.method(Date, 'now', () => now);
	assert.equal(checkSignupRateLimit('one@example.com', 'test-ip-1').allowed, true);
	const repeated = checkSignupRateLimit('one@example.com', 'test-ip-1');
	assert.equal(repeated.allowed, false);
	assert.equal(repeated.retryAfterSeconds, 60);

	for (let i = 2; i <= 10; i++) {
		assert.equal(checkSignupRateLimit(`${i}@example.com`, 'test-ip-1').allowed, true);
	}
	assert.equal(checkSignupRateLimit('eleven@example.com', 'test-ip-1').allowed, false);
	assert.equal(checkSignupRateLimit('one@example.com', 'test-ip-2').allowed, false);

	now += 60 * 1000;
	assert.equal(checkSignupRateLimit('one@example.com', 'test-ip-2').allowed, true);
	assert.equal(checkSignupRateLimit('eleven@example.com', 'test-ip-1').allowed, false);

	now += 4 * 60 * 1000;
	assert.equal(checkSignupRateLimit('one@example.com', 'test-ip-1').allowed, true);
});

test('expired signup challenges are removed without a verification request', (t) => {
	let now = 2_000_000;
	t.mock.method(Date, 'now', () => now);
	const { challengeId, otp } = createSignupChallenge({ email: 'cleanup@example.com' }, 'hash', 'salt');
	assert.equal(verifySignupOtp(challengeId, otp).status, 'valid');
	now += 5 * 60 * 1000;
	removeExpiredSignupChallenges();
	assert.equal(verifySignupOtp(challengeId, otp).status, 'expired');
});

test('requireAuth rejects missing and deleted users and handles database errors', async (t) => {
	let queryCount = 0;
	t.mock.method(pool, 'query', async () => { queryCount++; return { rows: [] }; });
	const missingSession = response();
	await requireAuth({ session: {} }, missingSession, () => assert.fail('must not continue'));
	assert.equal(missingSession.statusCode, 401);
	assert.equal(queryCount, 0);

	const deletedUser = response();
	await requireAuth({ session: { userId: 7 } }, deletedUser, () => assert.fail('must not continue'));
	assert.equal(deletedUser.statusCode, 401);
	assert.equal(queryCount, 1);

	t.mock.restoreAll();
	t.mock.method(console, 'error', () => {});
	t.mock.method(pool, 'query', async () => { throw new Error('database offline'); });
	const unavailable = response();
	await requireAuth({ session: { userId: 7 } }, unavailable, () => assert.fail('must not continue'));
	assert.equal(unavailable.statusCode, 503);
});

test('requireRole uses the current database role', async (t) => {
	const unauthenticated = response();
	requireRole('admin')({}, unauthenticated, () => assert.fail('must not continue'));
	assert.equal(unauthenticated.statusCode, 401);

	let role = 'user';
	t.mock.method(pool, 'query', async () => ({ rows: [{ id: '7', role }] }));
	const req = { session: { userId: 7 } };
	const firstResponse = response();
	await requireAuth(req, firstResponse, () => {});
	assert.deepEqual(req.user, { id: 7, role: 'user' });
	requireRole('admin')(req, firstResponse, () => assert.fail('must not continue'));
	assert.equal(firstResponse.statusCode, 403);

	role = 'admin';
	const secondResponse = response();
	let continued = false;
	await requireAuth(req, secondResponse, () => {});
	requireRole('admin')(req, secondResponse, () => { continued = true; });
	assert.equal(continued, true);
	assert.equal(secondResponse.statusCode, 200);
});

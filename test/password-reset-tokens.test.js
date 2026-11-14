import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	consumePasswordResetToken,
	createPasswordResetToken,
	deletePasswordResetToken,
	removeExpiredPasswordResetTokens,
	RESET_TOKEN_TTL_MS,
} from '../backend/password-reset-tokens.js';

test('reset token is random and can be used only once', (t) => {
	t.mock.method(Date, 'now', () => 1_000_000);
	const { tokenId } = createPasswordResetToken('42');
	assert.match(tokenId, /^[0-9a-f]{64}$/);
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'valid', userId: '42' });
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'expired' });
});

test('missing users cannot receive a reset token', () => {
	assert.throws(() => createPasswordResetToken(null), TypeError);
	assert.throws(() => createPasswordResetToken(undefined), TypeError);
});

test('reset token expires after five minutes and is cleaned up', (t) => {
	let now = 2_000_000;
	t.mock.method(Date, 'now', () => now);
	const { tokenId } = createPasswordResetToken(42);
	now += RESET_TOKEN_TTL_MS;
	removeExpiredPasswordResetTokens();
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'expired' });
});

test('reset token can be revoked before use', (t) => {
	t.mock.method(Date, 'now', () => 3_000_000);
	const { tokenId } = createPasswordResetToken(42);
	assert.equal(deletePasswordResetToken(tokenId), true);
	assert.deepEqual(consumePasswordResetToken(tokenId), { status: 'expired' });
});

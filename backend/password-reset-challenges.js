import { randomBytes, randomInt } from 'node:crypto';

export const RESET_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const resetChallenges = new Map();

export function removeExpiredPasswordResetChallenges(now = Date.now()) {
	for (const [challengeId, challenge] of resetChallenges) {
		if (now >= challenge.expiresAt) resetChallenges.delete(challengeId);
	}
}

setInterval(removeExpiredPasswordResetChallenges, 60 * 1000).unref();

export function createPasswordResetChallenge(userId) {
	const challengeId = randomBytes(32).toString('hex');
	// A dummy challenge keeps the request response uniform for unknown emails.
	const otp = userId == null ? null : String(randomInt(0, 1_000_000)).padStart(6, '0');
	resetChallenges.set(challengeId, {
		userId: userId ?? null,
		otp,
		expiresAt: Date.now() + RESET_CHALLENGE_TTL_MS,
		failedAttempts: 0,
	});
	return { challengeId, otp };
}

export function verifyPasswordResetOtp(challengeId, otp) {
	const challenge = resetChallenges.get(challengeId);
	if (!challenge) return { status: 'expired' };
	if (Date.now() >= challenge.expiresAt) {
		deletePasswordResetChallenge(challengeId);
		return { status: 'expired' };
	}
	if (challenge.failedAttempts >= MAX_FAILED_ATTEMPTS) {
		return { status: 'too_many_attempts' };
	}

	if (challenge.userId == null || typeof otp !== 'string' || !/^[0-9]{6}$/.test(otp) || otp !== challenge.otp) {
		challenge.failedAttempts += 1;
		return { status: challenge.failedAttempts >= MAX_FAILED_ATTEMPTS ? 'too_many_attempts' : 'invalid' };
	}

	deletePasswordResetChallenge(challengeId);
	return { status: 'valid', userId: challenge.userId };
}

export function deletePasswordResetChallenge(challengeId) {
	return resetChallenges.delete(challengeId);
}

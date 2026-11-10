import { randomInt, randomBytes } from "node:crypto";

const signupChallenges = new Map();

export function createSignupChallenge(signupData, passwordHash, passwordSalt) {
	const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
	const challengeId = randomBytes(32).toString("hex");
	const ttlMs = 5 * 60 * 1000;
	const dateNow = Date.now();
	signupChallenges.set(challengeId, {
		signupData,
		passwordHash,
		passwordSalt,
		otp,
		expiresAt: dateNow + ttlMs,
		lastSentAt: dateNow,
		failedAttempts: 0,
		pendingResend: null
	});
	return { challengeId, otp };
}

export function verifySignupOtp(challengeId, otp) {
	const signupChallenge = signupChallenges.get(challengeId);

	if (!signupChallenge)
		return { status: 'expired' };

	if (Date.now() >= signupChallenge.expiresAt) {
		deleteSignupChallenge(challengeId);
		return { status: 'expired' };
	}

	if (signupChallenge.failedAttempts >= 5)
		return { status: 'too_many_attempts' };

	if (typeof otp !== 'string' || !/^[0-9]{6}$/.test(otp) || otp !== signupChallenge.otp) {
		signupChallenge.failedAttempts += 1;
		if (signupChallenge.failedAttempts >= 5)
			return { status: 'too_many_attempts' };
		else
			return { status: 'invalid' };
	}
	return {
		status: 'valid',
		signupData: signupChallenge.signupData,
		passwordHash: signupChallenge.passwordHash,
		passwordSalt: signupChallenge.passwordSalt
	};
}

export function prepareResendOtp(challengeId) {
	const signupChallenge = signupChallenges.get(challengeId);
	const dateNow = Date.now();

	if (!signupChallenge || dateNow >= signupChallenge.expiresAt) {
		deleteSignupChallenge(challengeId);
		return { status: 'expired' };
	}

	if (signupChallenge.failedAttempts >= 5)
		return { status: 'too_many_attempts' };

	if (dateNow - signupChallenge.lastSentAt < 60 * 1000 || signupChallenge.pendingResend !== null)
		return { status: 'too_soon' };

	const newOtp = String(randomInt(0, 1_000_000)).padStart(6, '0');
	const reservationId = randomBytes(16).toString('hex');

	signupChallenge.pendingResend = {
		reservationId,
		otp: newOtp,
	};
	return { status: 'ready', reservationId, newOtp, email: signupChallenge.signupData.email };
}

export function confirmResendOtp(challengeId, reservationId) {
	const signupChallenge = signupChallenges.get(challengeId);
	if (!signupChallenge)
		return { status: 'expired' };

	const pendingResend = signupChallenge.pendingResend;
	if (!pendingResend || pendingResend.reservationId !== reservationId)
		return { status: 'invalid_reservation' };

	const dateNow = Date.now();
	signupChallenge.otp = pendingResend.otp;
	signupChallenge.lastSentAt = dateNow;
	signupChallenge.expiresAt = dateNow + 5 * 60 * 1000;
	signupChallenge.pendingResend = null;
	return { status: 'confirmed' };
}

export function cancelResendOtp(challengeId, reservationId) {
	const signupChallenge = signupChallenges.get(challengeId);
	if (!signupChallenge)
		return { status: 'expired' };

	const pendingResend = signupChallenge.pendingResend;
	if (!pendingResend || pendingResend.reservationId !== reservationId)
		return { status: 'invalid_reservation' };

	signupChallenge.pendingResend = null;
	return { status: 'cancelled' };
}

export function deleteSignupChallenge(challengeId) {
	signupChallenges.delete(challengeId);
}

import { randomBytes } from 'node:crypto';

export const RESET_TOKEN_TTL_MS = 5 * 60 * 1000;
const resetTokens = new Map();

export function removeExpiredPasswordResetTokens(now = Date.now()) {
	for (const [tokenId, token] of resetTokens) {
		if (now >= token.expiresAt) resetTokens.delete(tokenId);
	}
}

setInterval(removeExpiredPasswordResetTokens, 60 * 1000).unref();

export function createPasswordResetToken(userId) {
	if (userId == null) throw new TypeError('A user ID is required to create a password reset token.');
	const tokenId = randomBytes(32).toString('hex');
	resetTokens.set(tokenId, {
		userId,
		expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
	});
	return { tokenId };
}

export function consumePasswordResetToken(tokenId) {
	const token = resetTokens.get(tokenId);
	if (!token) return { status: 'expired' };

	resetTokens.delete(tokenId);
	if (Date.now() >= token.expiresAt) return { status: 'expired' };
	return { status: 'valid', userId: token.userId };
}

export function deletePasswordResetToken(tokenId) {
	return resetTokens.delete(tokenId);
}

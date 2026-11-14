const EMAIL_COOLDOWN_MS = 60 * 1000;
const IP_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 10;
const MAX_KEYS = 10_000;

const emailAttempts = new Map();
const ipAttempts = new Map();

function removeExpiredAttempts(now = Date.now()) {
	for (const [email, expiresAt] of emailAttempts) {
		if (now >= expiresAt) emailAttempts.delete(email);
	}
	for (const [ip, attempt] of ipAttempts) {
		if (now >= attempt.expiresAt) ipAttempts.delete(ip);
	}
}

setInterval(removeExpiredAttempts, 60 * 1000).unref();

export function checkPasswordResetRateLimit(email, ip) {
	const now = Date.now();
	let emailExpiresAt = emailAttempts.get(email) ?? 0;
	let ipAttempt = ipAttempts.get(ip);
	if (emailExpiresAt && now >= emailExpiresAt) {
		emailAttempts.delete(email);
		emailExpiresAt = 0;
	}
	if (ipAttempt && now >= ipAttempt.expiresAt) {
		ipAttempts.delete(ip);
		ipAttempt = undefined;
	}

	if (now < emailExpiresAt) {
		return { allowed: false, retryAfterSeconds: Math.ceil((emailExpiresAt - now) / 1000) };
	}
	if (ipAttempt?.count >= MAX_REQUESTS_PER_IP) {
		return { allowed: false, retryAfterSeconds: Math.ceil((ipAttempt.expiresAt - now) / 1000) };
	}
	if (emailAttempts.size >= MAX_KEYS || (ipAttempts.size >= MAX_KEYS && !ipAttempt)) {
		removeExpiredAttempts(now);
	}
	if (emailAttempts.size >= MAX_KEYS || (ipAttempts.size >= MAX_KEYS && !ipAttempt)) {
		return { allowed: false, retryAfterSeconds: 60 };
	}

	emailAttempts.set(email, now + EMAIL_COOLDOWN_MS);
	if (ipAttempt) ipAttempt.count += 1;
	else ipAttempts.set(ip, { count: 1, expiresAt: now + IP_WINDOW_MS });
	return { allowed: true };
}

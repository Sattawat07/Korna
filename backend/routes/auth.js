import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { sendPasswordResetOtp, sendSignupOtp } from '../mail.js';
import { hashPassword, verifyPassword } from '../password.js';
import {
	createPasswordResetChallenge,
	verifyPasswordResetOtp,
	deletePasswordResetChallenge,
	RESET_CHALLENGE_TTL_MS,
} from '../password-reset-challenges.js';
import { createPasswordResetToken, RESET_TOKEN_TTL_MS } from '../password-reset-tokens.js';
import { REMEMBERED_SESSION_MAX_AGE_MS } from '../session-store.js';
import { checkPasswordResetRateLimit } from '../password-reset-rate-limit.js';
import { checkSignupRateLimit } from '../signup-rate-limit.js';
import {
	createSignupChallenge,
	deleteSignupChallenge,
	verifySignupOtp,
	prepareResendOtp,
	confirmResendOtp,
	cancelResendOtp,
} from '../signup-challenges.js';

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
	const { name, email, password, room_number, phone_number } = req.body ?? {};
	const details = {};

	const normalizedName = typeof name === 'string' ? name.trim() : '';
	if (!normalizedName || normalizedName.length > 100)
		details.name = 'Name is required and must be at most 100 characters';

	const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!normalizedEmail || normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
		details.email = 'Enter a valid email address of at most 255 characters';

	if (typeof password !== 'string' || password.length < 8)
		details.password = 'Password must be at least 8 characters';

	const normalizedRoomNumber = typeof room_number === 'string' ? room_number.trim() : '';
	if (!normalizedRoomNumber || normalizedRoomNumber.length > 20)
		details.room_number = 'Room number is required and must be at most 20 characters';

	const normalizedPhoneNumber = typeof phone_number === 'string' ? phone_number.trim() : null;
	if (phone_number != null && typeof phone_number !== 'string')
		details.phone_number = 'Phone number must be a string';
	else if (normalizedPhoneNumber && normalizedPhoneNumber.length > 20)
		details.phone_number = 'Phone number must be at most 20 characters';

	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details,
			},
		});
	}

	const rateLimit = checkSignupRateLimit(normalizedEmail, req.ip ?? req.socket.remoteAddress ?? 'unknown');
	if (!rateLimit.allowed) {
		res.set('Retry-After', String(rateLimit.retryAfterSeconds));
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Please wait before registering again.',
			},
		});
	}

	try {
		const { rows } = await pool.query(`
			SELECT 1
			FROM users
			WHERE user_email = $1
			LIMIT 1`,
			[normalizedEmail]
		);

		if (rows.length > 0) {
			return res.status(409).json({
				error: {
					code: 'CONFLICT',
					message: 'This email is already registered.',
				},
			});
		}
	} catch (error) {
		console.error('Failed to check email:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}

	let signupChallenge;
	try {
		const { passwordHash, passwordSalt } = await hashPassword(password);
		const signupData = {
			name: normalizedName,
			email: normalizedEmail,
			room_number: normalizedRoomNumber,
			phone_number: normalizedPhoneNumber,
		};
		signupChallenge = createSignupChallenge(signupData, passwordHash, passwordSalt);
	} catch (error) {
		console.error('Failed to prepare signup challenge:', error);
		return res.status(500).json({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Unable to prepare registration right now.',
			},
		});
	}

	try {
		await sendSignupOtp(normalizedEmail, signupChallenge.otp);
	} catch (error) {
		deleteSignupChallenge(signupChallenge.challengeId);
		console.error('Failed to send email:', error);
		return res.status(502).json({
			error: {
				code: 'EMAIL_DELIVERY_FAILED',
				message: 'Unable to send the verification code right now.',
			},
		});
	}

	res.cookie('signup_challenge', signupChallenge.challengeId, {
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookie,
		maxAge: 5 * 60 * 1000,
	});
	return res.status(202).json({
		message: 'Verification code sent',
		expires_in_seconds: 300,
	});
});

authRouter.post('/register/verify', async (req, res) => {
	const challengeId = req.cookies?.signup_challenge;

	if (!challengeId) {
		return res.status(410).json({
			error: {
				code: 'OTP_EXPIRED',
				message: 'Verification code has expired. Please register again.',
			},
		});
	}

	const otp = req.body?.otp;
	const verificationResult = verifySignupOtp(challengeId, otp);
	if (verificationResult.status === 'expired') {
		return res.status(410).json({
			error: {
				code: 'OTP_EXPIRED',
				message: 'Verification code has expired. Please register again.',
			},
		});
	}

	if (verificationResult.status === 'invalid') {
		return res.status(400).json({
			error: {
				code: 'INVALID_OTP',
				message: 'Invalid verification code.',
			}
		});
	}

	if (verificationResult.status === 'too_many_attempts') {
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Too many incorrect verification attempts.',
			}
		});
	}

	try {
		const { rows } = await pool.query(`
			SELECT 1
			FROM users
			WHERE user_email = $1
			LIMIT 1`,
			[verificationResult.signupData.email]
		);

		if (rows.length > 0) {
			return res.status(409).json({
				error: {
					code: 'CONFLICT',
					message: 'This email is already registered.',
				},
			});
		}
	} catch (error) {
		console.error('Failed to check email:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}

	try {
		const { signupData, passwordHash, passwordSalt } = verificationResult;
		const { rows } = await pool.query(`
			INSERT INTO users (
				user_name,
				user_email,
				password_hash,
				password_salt,
				role,
				user_room_number,
				user_phone_number
			)
			VALUES ($1, $2, $3, $4, 'user', $5, $6)
			ON CONFLICT (user_email) DO NOTHING
			RETURNING
				user_id AS id,
				user_name AS name,
				user_email AS email,
				role,
				user_room_number AS room_number,
				user_phone_number AS phone_number,
				user_created_at AS created_at`,
			[
				signupData.name,
				signupData.email,
				passwordHash,
				passwordSalt,
				signupData.room_number,
				signupData.phone_number,
			]
		);

		if (rows.length === 0) {
			return res.status(409).json({
				error: {
					code: 'CONFLICT',
					message: 'This email is already registered.',
				},
			});
		}

		deleteSignupChallenge(challengeId);
		res.clearCookie('signup_challenge', {
			httpOnly: true,
			sameSite: 'lax',
			secure: config.secureCookie,
		});
		return res.status(201).json({ user: { ...rows[0], id: Number(rows[0].id) } });
	} catch (error) {
		console.error('Failed to create user:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

authRouter.post('/register/resend', async (req, res) => {
	const challengeId = req.cookies?.signup_challenge;

	if (!challengeId) {
		return res.status(410).json({
			error: {
				code: 'OTP_EXPIRED',
				message: 'Verification code has expired. Please register again.',
			},
		});
	}

	const resendResult = prepareResendOtp(challengeId);
	if (resendResult.status === 'expired') {
		return res.status(410).json({
			error: {
				code: 'OTP_EXPIRED',
				message: 'Verification code has expired. Please register again.',
			},
		});
	}

	if (resendResult.status === 'too_many_attempts') {
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Too many incorrect verification attempts.',
			},
		});
	}

	if (resendResult.status === 'too_soon') {
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Please wait before requesting another verification code.',
			},
		});
	}

	try {
		await sendSignupOtp(resendResult.email, resendResult.newOtp);
		const confirmResult = confirmResendOtp(challengeId, resendResult.reservationId);

		if (confirmResult.status === 'expired') {
			return res.status(410).json({
				error: {
					code: 'OTP_EXPIRED',
					message: 'Verification code has expired. Please register again.',
				},
			});
		}

		if (confirmResult.status === 'invalid_reservation') {
			return res.status(409).json({
				error: {
					code: 'INVALID_STATE',
					message: 'Unable to complete the resend request.',
				},
			});
		}

		res.cookie('signup_challenge', challengeId, {
			httpOnly: true,
			sameSite: 'lax',
			secure: config.secureCookie,
			maxAge: 5 * 60 * 1000,
		});

		return res.status(202).json({
			message: 'Verification code sent',
			expires_in_seconds: 300,
		});
	} catch (error) {
		cancelResendOtp(challengeId, resendResult.reservationId);
		console.error('Failed to resend signup OTP:', error);
		return res.status(502).json({
			error: {
				code: 'EMAIL_DELIVERY_FAILED',
				message: 'Unable to send the verification code right now.',
			},
		});
	}
});

authRouter.post("/login", async (req, res) => {
	const { email, password, remember_me } = req.body ?? {};
	const details = {};

	const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!normalizedEmail || normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
		details.email = 'Enter a valid email address of at most 255 characters';

	if (typeof password !== 'string' || password.length < 8)
		details.password = 'Password must be at least 8 characters';

	if (remember_me !== undefined && typeof remember_me !== 'boolean')
		details.remember_me = 'Remember me must be true or false';

	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details,
			},
		});
	}

	let user;
	try {
		const { rows } = await pool.query(`
			SELECT
				user_id AS id,
				user_name AS name,
				user_email AS email,
				password_hash,
				role,
				user_room_number AS room_number,
				user_phone_number AS phone_number,
				user_created_at AS created_at
			FROM users
			WHERE user_email = $1
			LIMIT 1;`,
			[normalizedEmail]
		);

		if (rows.length === 0) {
			return res.status(401).json({
				error: {
					code: 'INVALID_CREDENTIALS',
					message: 'Invalid email or password.',
				},
			});
		}
		user = rows[0];
	} catch (error) {
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}

	try {
		const isPasswordValid = await verifyPassword(user.password_hash, password);
		if (!isPasswordValid) {
			return res.status(401).json({
				error: {
					code: 'INVALID_CREDENTIALS',
					message: 'Invalid email or password.',
				},
			});
		}
	} catch (error) {
		return res.status(500).json({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Unable to log in right now.',
			},
		});
	}

	req.session.regenerate((error) => {
		if (error) {
			console.error('Failed to regenerate session:', error);
			return res.status(503).json({
				error: {
					code: 'DATABASE_UNAVAILABLE',
					message: 'Database is temporarily unavailable.',
				},
			});
		}

		req.session.userId = user.id;
		req.session.cookie.maxAge = remember_me === true ? REMEMBERED_SESSION_MAX_AGE_MS : null;

		return req.session.save((error) => {
			if (error) {
				console.error('Failed to save login session:', error);
				return res.status(503).json({
					error: {
						code: 'DATABASE_UNAVAILABLE',
						message: 'Database is temporarily unavailable.',
					},
				});
			}

			return res.status(200).json({
				user: {
					id: Number(user.id),
					name: user.name,
					email: user.email,
					role: user.role,
					room_number: user.room_number,
					phone_number: user.phone_number,
					created_at: user.created_at,
				},
			});
		});
	});
});

authRouter.post('/logout', (req, res) => {
	if (!req.session?.userId) {
		return res.status(401).json({
			error: {
				code: 'UNAUTHENTICATED',
				message: 'Please log in first.',
			},
		});
	}

	req.session.destroy((error) => {
		if (error) {
			console.error('Failed to destroy session:', error);
			return res.status(503).json({
				error: {
					code: 'DATABASE_UNAVAILABLE',
					message: 'Database is temporarily unavailable.',
				},
			});
		}

		res.clearCookie('sid', {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: config.secureCookie,
		});
		return res.status(204).end();
	});
});

authRouter.post('/forgot-password/request', async (req, res) => {
	const email = req.body?.email;
	const details = {};

	const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
	if (!normalizedEmail || normalizedEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))
		details.email = 'Enter a valid email address of at most 255 characters';

	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details,
			},
		});
	}

	const rateLimit = checkPasswordResetRateLimit(normalizedEmail, req.ip ?? req.socket.remoteAddress ?? 'unknown');
	if (!rateLimit.allowed) {
		res.set('Retry-After', String(rateLimit.retryAfterSeconds));
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Please wait before requesting another password reset code.',
			},
		});
	}

	let resetUserId = null;
	try {
		const { rows } = await pool.query(`
			SELECT user_id AS id
			FROM users
			WHERE user_email = $1
			LIMIT 1;`,
			[normalizedEmail]
		);
		resetUserId = rows[0]?.id ?? null;
	} catch (error) {
		console.error('Failed to look up password reset account:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}

	let resetChallenge;
	try {
		resetChallenge = createPasswordResetChallenge(resetUserId);
	} catch (error) {
		console.error('Failed to prepare password reset challenge:', error);
		return res.status(500).json({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Unable to request a password reset right now.',
			},
		});
	}

	if (resetUserId != null) {
		try {
			await sendPasswordResetOtp(normalizedEmail, resetChallenge.otp);
		} catch (error) {
			console.error('Failed to send password reset email:', error);
			deletePasswordResetChallenge(resetChallenge.challengeId);
			try {
				resetChallenge = createPasswordResetChallenge(null);
			} catch (challengeError) {
				console.error('Failed to prepare fallback password reset challenge:', challengeError);
				return res.status(500).json({
					error: {
						code: 'INTERNAL_ERROR',
						message: 'Unable to request a password reset right now.',
					},
				});
			}
		}
	}

	res.cookie('reset_challenge', resetChallenge.challengeId, {
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookie,
		maxAge: RESET_CHALLENGE_TTL_MS,
	});
	return res.status(202).json({
		message: 'If this account exists, a verification code has been sent.',
	});
});

authRouter.post('/forgot-password/verify', async (req, res) => {
	const challengeId = req.cookies?.reset_challenge;
	const otp = req.body?.otp;

	const verificationResult = verifyPasswordResetOtp(challengeId, otp);
	if (verificationResult.status === 'expired') {
		return res.status(410).json({
			error: {
				code: 'OTP_EXPIRED',
				message: 'Verification code has expired. Please request a new password reset code.',
			},
		});
	}

	if (verificationResult.status === 'invalid') {
		return res.status(400).json({
			error: {
				code: 'INVALID_OTP',
				message: 'Invalid verification code.',
			},
		});
	}

	if (verificationResult.status === 'too_many_attempts') {
		return res.status(429).json({
			error: {
				code: 'TOO_MANY_ATTEMPTS',
				message: 'Too many incorrect verification attempts.',
			},
		});
	}

	let resetToken;
	try {
		resetToken = createPasswordResetToken(verificationResult.userId);
	} catch (error) {
		console.error('Failed to create password reset token:', error);
		return res.status(500).json({
			error: {
				code: 'INTERNAL_ERROR',
				message: 'Unable to verify the code right now. Please request a new password reset code.',
			},
		});
	}

	res.clearCookie('reset_challenge', {
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookie,
	});
	res.cookie('reset_token', resetToken.tokenId, {
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookie,
		maxAge: RESET_TOKEN_TTL_MS,
	});
	return res.status(204).end();
});

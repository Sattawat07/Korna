import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { sendSignupOtp } from '../mail.js';
import { hashPassword } from '../password.js';
import {
	createSignupChallenge,
	deleteSignupChallenge,
	verifySignupOtp,
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
	} else if (verificationResult.status === 'invalid') {
		return res.status(400).json({
			error: {
				code: 'INVALID_OTP',
				message: 'Invalid verification code.',
			}
		});
	} else if (verificationResult.status === 'too_many_attempts') {
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
		return res.status(201).json({ user: rows[0] });
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

import { Router } from 'express';
import { config } from '../config.js';
import { pool } from '../db.js';
import { sendSignupOtp } from '../mail.js';
import { hashPassword } from '../password.js';
import {
	createSignupChallenge,
	deleteSignupChallenge,
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

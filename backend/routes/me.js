import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
	const userId = req.user.id;

	try {
		const { rows } = await pool.query(`
			SELECT
				u.user_id AS id,
				u.user_name AS name,
				u.user_email AS email,
				u.role,
				u.user_room_number AS room_number,
				u.user_phone_number AS phone_number,
				u.user_created_at AS created_at,
				(SELECT COUNT(*) FROM items i
					WHERE i.item_owner_id = u.user_id AND i.item_status <> 'removed') AS my_items_count,
				(SELECT COUNT(*) FROM requests r
					WHERE r.requester_user_id = u.user_id) AS requests_sent_count,
				(SELECT COUNT(*) FROM items i
				WHERE i.item_owner_id = u.user_id AND i.item_status = 'completed') AS completed_items_count
			FROM users u
			WHERE u.user_id = $1`,
			[userId]
		);

		if (rows.length === 0) {
			return res.status(401).json({
				error: {
					code: 'UNAUTHENTICATED',
					message: 'Please log in first.'
				},
			});
		}

		const row = rows[0];

		return res.status(200).json({
			user: {
				id: Number(row.id),
				name: row.name,
				email: row.email,
				role: row.role,
				room_number: row.room_number,
				phone_number: row.phone_number,
				created_at: row.created_at,
			},
			stats: {
				my_items_count: Number(row.my_items_count),
				requests_sent_count: Number(row.requests_sent_count),
				completed_items_count: Number(row.completed_items_count),
			},
		});
	} catch (error) {
		console.error('Failed to load profile:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

meRouter.patch('/', requireAuth, async (req, res) => {
	const body = req.body;
	const details = Object.create(null);

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		details.body = 'Enter the profile fields to update';
	} else {
		if (Object.keys(body).length === 0)
			details.body = 'Enter at least one profile field to update';

		for (const field of Object.keys(body)) {
			if (!['name', 'room_number', 'phone_number'].includes(field))
				details[field] = 'This field cannot be updated';
		}

		const { name, room_number, phone_number } = body;
		const normalizedName = typeof name === 'string' ? name.trim() : '';
		if (Object.hasOwn(body, 'name')) {
			if (!normalizedName || normalizedName.length > 100)
				details.name = 'Name is required and must be at most 100 characters';
		}

		const normalizedRoomNumber = typeof room_number === 'string' ? room_number.trim() : '';
		if (Object.hasOwn(body, 'room_number')) {
			if (!normalizedRoomNumber || normalizedRoomNumber.length > 20)
				details.room_number = 'Room number is required and must be at most 20 characters';
		}

		const normalizedPhoneNumber = typeof phone_number === 'string' ? phone_number.trim() : null;
		if (Object.hasOwn(body, 'phone_number')) {
			if (phone_number !== null && typeof phone_number !== 'string')
				details.phone_number = 'Phone number must be a string or null';
			else if (normalizedPhoneNumber && normalizedPhoneNumber.length > 20)
				details.phone_number = 'Phone number must be at most 20 characters';
		}
	}

	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details,
			},
		});
	}

	const { name, room_number, phone_number } = body;
	const updates = [];
	const values = [];
	if (Object.hasOwn(body, 'name')) {
		values.push(name.trim());
		updates.push(`user_name = $${values.length}`);
	}
	if (Object.hasOwn(body, 'room_number')) {
		values.push(room_number.trim());
		updates.push(`user_room_number = $${values.length}`);
	}
	if (Object.hasOwn(body, 'phone_number')) {
		values.push(typeof phone_number === 'string' ? phone_number.trim() || null : null);
		updates.push(`user_phone_number = $${values.length}`);
	}
	values.push(req.user.id);

	try {
		const { rows } = await pool.query(`
			UPDATE users SET ${updates.join(', ')}
			WHERE user_id = $${values.length}
			RETURNING
				user_id AS id,
				user_name AS name,
				user_email AS email,
				role,
				user_room_number AS room_number,
				user_phone_number AS phone_number,
				user_created_at AS created_at`,
			values
		);

		if (rows.length === 0) {
			return res.status(401).json({
				error: {
					code: 'UNAUTHENTICATED',
					message: 'Please log in first.',
				},
			});
		}

		return res.status(200).json({
			user: {
				...rows[0],
				id: Number(rows[0].id)
			}
		});
	} catch (error) {
		console.error('Failed to update profile:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

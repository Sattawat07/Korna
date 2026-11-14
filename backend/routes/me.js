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
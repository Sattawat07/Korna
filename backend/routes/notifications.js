import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', requireAuth, async (req, res) => {
	const { page: pageQuery, limit: limitQuery } = req.query;
	const details = {};

	const page = pageQuery === undefined ? 1 : Number(pageQuery);
	if (pageQuery !== undefined && (typeof pageQuery !== 'string' || !/^[1-9]\d*$/.test(pageQuery) || !Number.isSafeInteger(page)))
		details.page = 'Page must be a positive integer';

	const limit = limitQuery === undefined ? 20 : Number(limitQuery);
	if (limitQuery !== undefined && (typeof limitQuery !== 'string' || !/^[1-9]\d*$/.test(limitQuery) || !Number.isSafeInteger(limit) || limit > 50))
		details.limit = 'Limit must be an integer from 1 to 50';

	const offset = (page - 1) * limit;
	if (Object.keys(details).length === 0 && !Number.isSafeInteger(offset))
		details.page = 'Page is too large';

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
		const { rows: countRows } = await pool.query(`
			SELECT
				COUNT(*) AS total,
				COUNT(*) FILTER (WHERE read_at IS NULL) AS unread_count
			FROM notifications
			WHERE recipient_user_id = $1`,
			[req.user.id]
		);
		const total = Number(countRows[0].total);
		const unreadCount = Number(countRows[0].unread_count);

		const { rows } = await pool.query(`
			SELECT
				n.notification_id,
				n.notification_type,
				n.notification_item_id,
				n.notification_request_id,
				n.notification_decision,
				n.read_at,
				n.created_at,
				u.user_id AS actor_id,
				u.user_name AS actor_name,
				u.user_avatar_url AS actor_avatar_url
			FROM notifications n
			JOIN users u ON u.user_id = n.actor_user_id
			WHERE n.recipient_user_id = $1
			ORDER BY n.created_at DESC, n.notification_id DESC
			LIMIT $2 OFFSET $3`,
			[req.user.id, limit, offset]
		);

		const notifications = rows.map((row) => {
			const notification = {
				id: Number(row.notification_id),
				type: row.notification_type,
				item_id: Number(row.notification_item_id),
				request_id: Number(row.notification_request_id),
				actor: {
					id: Number(row.actor_id),
					name: row.actor_name,
					avatar_url: row.actor_avatar_url,
				},
				read_at: row.read_at,
				created_at: row.created_at,
			};
			if (row.notification_type === 'request_decided')
				notification.decision = row.notification_decision;
			return notification;
		});

		return res.status(200).json({
			notifications,
			unread_count: unreadCount,
			pagination: {
				page,
				limit,
				total,
				total_pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		console.error('Failed to load notifications:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

notificationsRouter.patch('/:id/read', requireAuth, async (req, res) => {
	const idParam = req.params.id;
	const notificationId = Number(idParam);

	if (!/^[1-9]\d*$/.test(idParam) || !Number.isSafeInteger(notificationId)) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details: { id: 'Enter a valid notification ID' },
			},
		});
	}

	try {
		const { rows } = await pool.query(`
			UPDATE notifications
			SET read_at = COALESCE(read_at, NOW())
			WHERE notification_id = $1 AND recipient_user_id = $2
			RETURNING
				notification_id,
				notification_type,
				notification_item_id,
				notification_request_id,
				notification_decision,
				read_at,
				created_at`,
			[notificationId, req.user.id]
		);

		if (rows.length === 0) {
			return res.status(404).json({
				error: {
					code: 'NOT_FOUND',
					message: 'Notification not found.',
				},
			});
		}

		const row = rows[0];
		const notification = {
			id: Number(row.notification_id),
			type: row.notification_type,
			item_id: Number(row.notification_item_id),
			request_id: Number(row.notification_request_id),
			read_at: row.read_at,
			created_at: row.created_at,
		};
		if (row.notification_type === 'request_decided')
			notification.decision = row.notification_decision;

		return res.status(200).json({ notification });
	} catch (error) {
		console.error('Failed to mark notification as read:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

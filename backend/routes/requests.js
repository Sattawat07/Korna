import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { positiveId, validationError, databaseError, forbidden, invalidState } from '../item-data.js';
import { requestSelect, mapRequest } from '../request-data.js';

export const requestsRouter = Router();

requestsRouter.get('/', requireAuth, async (req, res) => {
	const { role, item_id } = req.query;
	const details = {};

	if (role !== 'sent' && role !== 'received')
		details.role = 'Role must be sent or received';

	let itemId = null;
	if (item_id !== undefined) {
		if (typeof item_id !== 'string' || !/^[1-9]\d*$/.test(item_id) || !Number.isSafeInteger(Number(item_id)))
			details.item_id = 'Enter a valid item ID';
		else
			itemId = Number(item_id);
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

	try {
		if (role === 'received' && itemId !== null) {
			const { rows } = await pool.query(
				'SELECT item_owner_id FROM items WHERE item_id = $1',
				[itemId]
			);
			if (rows.length === 0) {
				return res.status(404).json({
					error: { code: 'NOT_FOUND', message: 'Item not found.' },
				});
			}
			if (Number(rows[0].item_owner_id) !== req.user.id) {
				return res.status(403).json({
					error: { code: 'FORBIDDEN', message: 'You do not have permission to access this item.' },
				});
			}
		}

		const filter = role === 'sent' ? 'r.requester_user_id = $1' : 'i.item_owner_id = $1';
		const values = itemId === null ? [req.user.id] : [req.user.id, itemId];
		const { rows } = await pool.query(`
			SELECT
				r.request_id,
				r.request_message,
				r.request_status,
				r.request_created_at,
				i.item_id,
				i.item_title,
				i.item_type,
				i.item_status,
				u.user_id AS requester_id,
				u.user_name AS requester_name,
				o.offer_id,
				o.offer_description,
				(
					SELECT im.image_url
					FROM item_images im
					WHERE im.image_item_id = i.item_id
					ORDER BY im.position, im.image_id
					LIMIT 1
				) AS item_image_url,
				(
					SELECT oi.image_url
					FROM request_swap_offer_images oi
					WHERE oi.image_offer_id = o.offer_id
					ORDER BY oi.position, oi.image_id
					LIMIT 1
				) AS offer_image_url,
				COALESCE((
					SELECT json_agg(json_build_object(
						'id', oi.image_id, 'url', oi.image_url, 'position', oi.position
					) ORDER BY oi.position, oi.image_id)
					FROM request_swap_offer_images oi
					WHERE oi.image_offer_id = o.offer_id
				), '[]'::json) AS offer_images
			FROM requests r
			JOIN items i ON i.item_id = r.request_item_id
			JOIN users u ON u.user_id = r.requester_user_id
			LEFT JOIN request_swap_offers o ON o.offer_request_id = r.request_id
			WHERE ${filter}${itemId === null ? '' : ' AND i.item_id = $2'}
			ORDER BY r.request_created_at DESC, r.request_id DESC`, values);

		const requests = rows.map((row) => ({
			id: Number(row.request_id),
			item: {
				id: Number(row.item_id),
				title: row.item_title,
				type: row.item_type,
				status: row.item_status,
				image_url: row.item_image_url,
			},
			requester: {
				id: Number(row.requester_id),
				name: row.requester_name,
			},
			message: row.request_message,
			status: row.request_status,
			swap_offer: row.offer_id === null ? null : {
				description: row.offer_description,
				image_url: row.offer_image_url,
				images: row.offer_images.map((image) => ({
					id: Number(image.id),
					url: image.url,
					position: image.position,
				})),
			},
			created_at: row.request_created_at,
		}));

		return res.status(200).json({ requests });
	} catch (error) {
		console.error('Failed to load requests:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

requestsRouter.patch('/:id/decision', requireAuth, async (req, res) => {
	const id = positiveId(req.params.id);
	const decision = req.body?.decision;
	const details = {};

	if (id === null) {
		details.id = 'Enter a valid request ID';
	}
	if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
		!['accepted', 'rejected'].includes(decision) || Object.keys(req.body).some((key) => key !== 'decision')) {
		details.decision = 'Decision must be accepted or rejected';
	}
	if (Object.keys(details).length) {
		return validationError(res, details);
	}

	let client;
	try {
		client = await pool.connect();
		await client.query('BEGIN');

		const located = await client.query('SELECT request_item_id FROM requests WHERE request_id = $1', [id]);
		if (!located.rows.length) {
			await client.query('ROLLBACK');
			return res.status(404).json({
				error: {
					code: 'NOT_FOUND',
					message: 'Request not found.',
				},
			});
		}

		const itemId = Number(located.rows[0].request_item_id);
		const itemResult = await client.query(`SELECT item_owner_id, item_status FROM items
      WHERE item_id = $1 FOR UPDATE`, [itemId]);
		if (!itemResult.rows.length) {
			await client.query('ROLLBACK');
			return res.status(404).json({
				error: {
					code: 'NOT_FOUND',
					message: 'Request not found.',
				},
			});
		}

		const item = itemResult.rows[0];
		if (Number(item.item_owner_id) !== req.user.id) {
			await client.query('ROLLBACK');
			return forbidden(res);
		}

		const requestResult = await client.query(`SELECT request_status, requester_user_id
      FROM requests WHERE request_id = $1 FOR UPDATE`, [id]);
		if (requestResult.rows[0].request_status !== 'pending' || item.item_status !== 'pending') {
			await client.query('ROLLBACK');
			return invalidState(res);
		}

		await client.query('UPDATE requests SET request_status = $2 WHERE request_id = $1', [id, decision]);

		if (decision === 'accepted') {
			await client.query(`WITH rejected AS (
        UPDATE requests SET request_status = 'rejected'
        WHERE request_item_id = $1 AND request_id <> $2 AND request_status = 'pending'
        RETURNING request_id, requester_user_id
      ) INSERT INTO notifications
        (recipient_user_id, actor_user_id, notification_item_id,
          notification_request_id, notification_type, notification_decision)
        SELECT requester_user_id, $3, $1, request_id, 'request_decided', 'rejected'
        FROM rejected`, [itemId, id, req.user.id]);
			await client.query("UPDATE items SET item_status = 'completed' WHERE item_id = $1", [itemId]);
		} else {
			const { rows } = await client.query(`SELECT COUNT(*) AS pending_count FROM requests
        WHERE request_item_id = $1 AND request_status = 'pending'`, [itemId]);
			if (Number(rows[0].pending_count) === 0) {
				await client.query("UPDATE items SET item_status = 'available' WHERE item_id = $1", [itemId]);
			}
		}

		await client.query(`INSERT INTO notifications
      (recipient_user_id, actor_user_id, notification_item_id,
        notification_request_id, notification_type, notification_decision)
      VALUES ($1, $2, $3, $4, 'request_decided', $5)`,
			[Number(requestResult.rows[0].requester_user_id), req.user.id, itemId, id, decision]);
		const { rows } = await client.query(`${requestSelect} WHERE r.request_id = $1`, [id]);
		const request = mapRequest(rows[0]);

		await client.query('COMMIT');
		return res.json({ request });
	} catch (error) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackError) {
				console.error('Failed to roll back request decision:', rollbackError);
			}
		}

		return databaseError(res, error, 'decide request');
	} finally {
		client?.release();
	}
});

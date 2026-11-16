import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { basename, join } from 'node:path';
import { config } from '../config.js';
import { imageUpload, requireMultipart, validateImages, saveImages, discardImages } from '../uploads.js';

export const meRouter = Router();

meRouter.get('/', requireAuth, async (req, res) => {
	const userId = req.user.id;

	try {
		const { rows } = await pool.query(`
			SELECT
				u.user_id AS id,
				u.user_name AS name,
				u.user_avatar_url AS avatar_url,
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
				avatar_url: row.avatar_url,
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
				user_avatar_url AS avatar_url,
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

meRouter.put('/avatar', requireAuth, requireMultipart, imageUpload('avatar', 1), async (req, res) => {
	if (req.files?.length !== 1 || !validateImages(req.files)) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details: { avatar: 'Upload one JPEG, PNG, or WebP image' },
			},
		});
	}

	let client;
	const savedPaths = [];
	let committed = false;
	try {
		client = await pool.connect();
		await client.query('BEGIN');
		const { rows } = await client.query(
			'SELECT user_avatar_url FROM users WHERE user_id = $1 FOR UPDATE',
			[req.user.id]
		);
		if (rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(401).json({
				error: { code: 'UNAUTHENTICATED', message: 'Please log in first.' },
			});
		}

		const oldUrl = rows[0].user_avatar_url;
		const [avatarUrl] = await saveImages(req.files, 'avatars', savedPaths);
		await client.query('UPDATE users SET user_avatar_url = $1 WHERE user_id = $2', [avatarUrl, req.user.id]);
		await client.query('COMMIT');
		committed = true;

		if (oldUrl && /^\/uploads\/avatars\/[0-9a-f-]+\.(jpg|png|webp)$/.test(oldUrl)) {
			await discardImages([join(config.uploadDir, 'avatars', basename(oldUrl))]);
		}
		return res.status(200).json({ avatar_url: avatarUrl });
	} catch (error) {
		if (!committed) {
			if (client) {
				try { await client.query('ROLLBACK'); }
				catch (rollbackError) { console.error('Failed to roll back avatar update:', rollbackError); }
			}
			await discardImages(savedPaths);
		}
		console.error('Failed to update avatar:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	} finally {
		client?.release();
	}
});

meRouter.get('/items', requireAuth, async (req, res) => {
	const userId = req.user.id;

	try {
		const { rows } = await pool.query(`
			SELECT
				i.*,
				c.category_id,
				c.category_name,
				u.user_name AS owner_name,
				u.user_avatar_url AS owner_avatar_url,
				sd.desired_description,
				dc.category_id AS desired_category_id,
				dc.category_name AS desired_category_name,
				COALESCE((
					SELECT json_agg(json_build_object(
						'id', im.image_id, 'url', im.image_url, 'position', im.position
					) ORDER BY im.position, im.image_id)
					FROM item_images im
					WHERE im.image_item_id = i.item_id
				), '[]'::json) AS images,
				(
					SELECT im.image_url
					FROM item_images im
					WHERE im.image_item_id = i.item_id
					ORDER BY im.position, im.image_id
					LIMIT 1
				) AS image_url,
				(
					SELECT COUNT(*)
					FROM requests r
					WHERE r.request_item_id = i.item_id
				) AS requests_count
			FROM items i
			JOIN categories c ON c.category_id = i.item_category_id
			JOIN users u ON u.user_id = i.item_owner_id
			LEFT JOIN item_swap_details sd ON sd.swap_item_id = i.item_id
			LEFT JOIN categories dc ON dc.category_id = sd.desired_category_id
			WHERE i.item_owner_id = $1
			ORDER BY i.item_created_at DESC, i.item_id DESC`,
			[userId]
		);

		const items = rows.map((row) => ({
			id: Number(row.item_id),
			title: row.item_title,
			description: row.item_description,
			type: row.item_type,
			status: row.item_status,
			defects: row.item_defects,
			category: {
				id: Number(row.category_id),
				name: row.category_name,
			},
			image_url: row.image_url,
			images: row.images.map((image) => ({
				id: Number(image.id),
				url: image.url,
				position: image.position,
			})),
			owner: {
				id: Number(row.item_owner_id),
				name: row.owner_name,
				avatar_url: row.owner_avatar_url,
			},
			swap_details: row.item_type === 'swap' ? {
				desired_category: row.desired_category_id == null ? null : {
					id: Number(row.desired_category_id),
					name: row.desired_category_name,
				},
				desired_description: row.desired_description,
			} : null,
			created_at: row.item_created_at,
			requests_count: Number(row.requests_count),
		}));

		return res.status(200).json({ items });
	} catch (error) {
		console.error('Failed to load profile items:', error);
		return res.status(503).json({
			error: {
				code: 'DATABASE_UNAVAILABLE',
				message: 'Database is temporarily unavailable.',
			},
		});
	}
});

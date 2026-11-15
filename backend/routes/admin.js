import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('admin'));

function mapItem(row) {
	return {
		id: Number(row.item_id),
		title: row.item_title,
		description: row.item_description,
		defects: row.item_defects,
		type: row.item_type,
		status: row.item_status,
		category: { id: Number(row.category_id), name: row.category_name },
		image_url: row.image_url,
		images: row.images.map((image) => ({
			id: Number(image.id), url: image.url, position: image.position,
		})),
		owner: { id: Number(row.item_owner_id), name: row.owner_name },
		swap_details: row.item_type === 'swap' ? {
			desired_category: row.desired_category_id == null ? null : {
				id: Number(row.desired_category_id), name: row.desired_category_name,
			},
			desired_description: row.desired_description,
		} : null,
		created_at: row.item_created_at,
	};
}

adminRouter.get('/stats', async (req, res) => {
	const rawLimit = req.query.recent_requests_limit;
	if (rawLimit !== undefined &&
		(typeof rawLimit !== 'string' || !/^[1-9]\d*$/.test(rawLimit) || Number(rawLimit) > 50)) {
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Please check the submitted fields.',
				details: { recent_requests_limit: 'Must be an integer from 1 to 50' },
			},
		});
	}
	const recentRequestsLimit = rawLimit === undefined ? 5 : Number(rawLimit);

	try {
		const [itemsResult, usersResult, requestsResult, categoriesResult, daysResult, recentResult] =
			await Promise.all([
				pool.query(`
					SELECT
						COUNT(*) AS total,
						COUNT(*) FILTER (WHERE item_status <> 'removed') AS active,
						COUNT(*) FILTER (WHERE item_status = 'removed') AS removed,
						COUNT(*) FILTER (WHERE item_status = 'available') AS available_count,
						COUNT(*) FILTER (WHERE item_status = 'pending') AS pending_count,
						COUNT(*) FILTER (WHERE item_status = 'completed') AS completed_count,
						COUNT(*) FILTER (WHERE item_type = 'free') AS free_count,
						COUNT(*) FILTER (WHERE item_type = 'swap') AS swap_count
					FROM items`),
				pool.query('SELECT COUNT(*) AS total FROM users'),
				pool.query(`
					SELECT
						COUNT(*) AS total,
						COUNT(*) FILTER (WHERE request_status = 'pending') AS pending_count,
						COUNT(*) FILTER (WHERE request_status = 'accepted') AS accepted_count,
						COUNT(*) FILTER (WHERE request_status = 'rejected') AS rejected_count
					FROM requests`),
				pool.query(`
					SELECT c.category_id AS id, c.category_name AS name, COUNT(*) AS total
					FROM items i
					JOIN categories c ON c.category_id = i.item_category_id
					GROUP BY c.category_id, c.category_name
					ORDER BY c.category_id`),
				pool.query(`
					WITH days AS (
						SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date - day_offset AS day
						FROM generate_series(6, 0, -1) AS day_offset
					)
					SELECT
						to_char(d.day, 'YYYY-MM-DD') AS date,
						COUNT(r.request_id) FILTER (WHERE r.request_status = 'pending') AS pending,
						COUNT(r.request_id) FILTER (WHERE r.request_status = 'accepted') AS accepted,
						COUNT(r.request_id) FILTER (WHERE r.request_status = 'rejected') AS rejected
					FROM days d
					LEFT JOIN requests r ON r.request_created_at >= d.day AT TIME ZONE 'Asia/Bangkok'
						AND r.request_created_at < (d.day + 1) AT TIME ZONE 'Asia/Bangkok'
					GROUP BY d.day
					ORDER BY d.day`),
				pool.query(`
					SELECT request_id AS id, request_item_id AS item_id,
						request_status AS status, request_created_at AS created_at
					FROM requests
					ORDER BY request_created_at DESC, request_id DESC
					LIMIT $1`, [recentRequestsLimit]),
			]);

		const items = itemsResult.rows[0];
		const requests = requestsResult.rows[0];
		return res.status(200).json({
			total: Number(items.total),
			active: Number(items.active),
			removed: Number(items.removed),
			total_users: Number(usersResult.rows[0].total),
			total_requests: Number(requests.total),
			by_status: {
				available: Number(items.available_count),
				pending: Number(items.pending_count),
				completed: Number(items.completed_count),
				removed: Number(items.removed),
			},
			requests_by_status: {
				pending: Number(requests.pending_count),
				accepted: Number(requests.accepted_count),
				rejected: Number(requests.rejected_count),
			},
			by_type: { free: Number(items.free_count), swap: Number(items.swap_count) },
			by_category: categoriesResult.rows.map((row) => ({
				id: Number(row.id), name: row.name, total: Number(row.total),
			})),
			requests_last_7_days: daysResult.rows.map((row) => ({
				date: row.date,
				pending: Number(row.pending),
				accepted: Number(row.accepted),
				rejected: Number(row.rejected),
			})),
			recent_requests: recentResult.rows.map((row) => ({
				id: Number(row.id), item_id: Number(row.item_id),
				status: row.status, created_at: row.created_at,
			})),
		});
	} catch (error) {
		console.error('Failed to load admin stats:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	}
});

adminRouter.get('/items', async (req, res) => {
	const { q, owner_id: ownerIdQuery, status, type, category_id: categoryIdQuery,
		page: pageQuery, limit: limitQuery } = req.query;
	const details = {};
	if (q !== undefined && typeof q !== 'string') details.q = 'Search must be text';
	if (status !== undefined && !['available', 'pending', 'completed', 'removed'].includes(status))
		details.status = 'Invalid item status';
	if (type !== undefined && !['free', 'swap'].includes(type))
		details.type = 'Invalid item type';

	function positiveId(value, field) {
		if (value === undefined) return null;
		const id = Number(value);
		if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
			details[field] = 'Must be a positive integer';
			return null;
		}
		return id;
	}
	const ownerId = positiveId(ownerIdQuery, 'owner_id');
	const categoryId = positiveId(categoryIdQuery, 'category_id');
	const page = pageQuery === undefined ? 1 : positiveId(pageQuery, 'page');
	const limit = limitQuery === undefined ? 12 : positiveId(limitQuery, 'limit');
	if (limit !== null && limit > 50) details.limit = 'Must be an integer from 1 to 50';
	const offset = page === null || limit === null ? null : (page - 1) * limit;
	if (offset !== null && !Number.isSafeInteger(offset))
		details.page = 'Page is too large';
	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.', details },
		});
	}

	const where = [];
	const values = [];
	function addFilter(condition, value) {
		values.push(value);
		where.push(condition.replaceAll('?', `$${values.length}`));
	}
	if (q?.trim()) addFilter('(strpos(lower(i.item_title), lower(?)) > 0 OR strpos(lower(u.user_name), lower(?)) > 0)', q.trim());
	if (ownerId !== null) addFilter('i.item_owner_id = ?', ownerId);
	if (status !== undefined) addFilter('i.item_status = ?', status);
	if (type !== undefined) addFilter('i.item_type = ?', type);
	if (categoryId !== null) addFilter('i.item_category_id = ?', categoryId);
	const filters = where.length ? `WHERE ${where.join(' AND ')}` : '';
	const from = `FROM items i JOIN users u ON u.user_id = i.item_owner_id`;

	try {
		const { rows: countRows } = await pool.query(`
			SELECT COUNT(*) AS total
			${from}
			${filters}`, values);
		const total = Number(countRows[0].total);
		const { rows } = await pool.query(`
			SELECT
				i.item_id, i.item_owner_id, i.item_title, i.item_description,
				i.item_defects, i.item_type, i.item_status, i.item_created_at,
				c.category_id, c.category_name, u.user_name AS owner_name,
				sd.desired_description,
				dc.category_id AS desired_category_id,
				dc.category_name AS desired_category_name,
				COALESCE((
					SELECT json_agg(json_build_object(
						'id', im.image_id, 'url', im.image_url, 'position', im.position
					) ORDER BY im.position, im.image_id)
					FROM item_images im WHERE im.image_item_id = i.item_id
				), '[]'::json) AS images,
				(
					SELECT im.image_url FROM item_images im
					WHERE im.image_item_id = i.item_id
					ORDER BY im.position, im.image_id LIMIT 1
				) AS image_url
			${from}
			JOIN categories c ON c.category_id = i.item_category_id
			LEFT JOIN item_swap_details sd ON sd.swap_item_id = i.item_id
			LEFT JOIN categories dc ON dc.category_id = sd.desired_category_id
			${filters}
			ORDER BY i.item_created_at DESC, i.item_id DESC
			LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
			[...values, limit, offset]);
		return res.status(200).json({
			items: rows.map(mapItem),
			pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
		});
	} catch (error) {
		console.error('Failed to load admin items:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	}
});

adminRouter.get('/users', async (req, res) => {
	const { q, page: pageQuery, limit: limitQuery } = req.query;
	const details = {};
	if (q !== undefined && typeof q !== 'string') details.q = 'Search must be text';
	function positiveInteger(value, field, fallback) {
		if (value === undefined) return fallback;
		const number = Number(value);
		if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(number)) {
			details[field] = 'Must be a positive integer';
			return null;
		}
		return number;
	}
	const page = positiveInteger(pageQuery, 'page', 1);
	const limit = positiveInteger(limitQuery, 'limit', 20);
	if (limit !== null && limit > 50) details.limit = 'Must be an integer from 1 to 50';
	const offset = page === null || limit === null ? null : (page - 1) * limit;
	if (offset !== null && !Number.isSafeInteger(offset)) details.page = 'Page is too large';
	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.', details },
		});
	}

	const search = q?.trim();
	const filter = search
		? 'WHERE strpos(lower(u.user_name), lower($1)) > 0 OR strpos(lower(u.user_email), lower($1)) > 0'
		: '';
	const values = search ? [search] : [];
	try {
		const { rows: countRows } = await pool.query(`
			SELECT COUNT(*) AS total FROM users u ${filter}`, values);
		const total = Number(countRows[0].total);
		const { rows } = await pool.query(`
			SELECT u.user_id, u.user_name, u.user_email, u.role,
				u.user_room_number, u.user_phone_number, u.user_created_at,
				(SELECT COUNT(*) FROM items i
					WHERE i.item_owner_id = u.user_id AND i.item_status <> 'removed') AS items_count
			FROM users u
			${filter}
			ORDER BY u.user_created_at DESC, u.user_id DESC
			LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
			[...values, limit, offset]);
		return res.status(200).json({
			users: rows.map((row) => ({
				id: Number(row.user_id),
				name: row.user_name,
				email: row.user_email,
				role: row.role,
				room_number: row.user_room_number,
				phone_number: row.user_phone_number,
				created_at: row.user_created_at,
				items_count: Number(row.items_count),
			})),
			pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
		});
	} catch (error) {
		console.error('Failed to load admin users:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	}
});

adminRouter.delete('/items/:id', async (req, res) => {
	const itemId = Number(req.params.id);
	if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(itemId)) {
		return res.status(400).json({
			error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.',
				details: { id: 'Enter a valid item ID' } },
		});
	}

	let client;
	try {
		client = await pool.connect();
		await client.query('BEGIN');
		const { rows } = await client.query(`
			SELECT
				i.item_id, i.item_owner_id, i.item_title, i.item_description,
				i.item_defects, i.item_type, i.item_status, i.item_created_at,
				c.category_id, c.category_name, u.user_name AS owner_name,
				sd.desired_description,
				dc.category_id AS desired_category_id,
				dc.category_name AS desired_category_name,
				COALESCE((
					SELECT json_agg(json_build_object(
						'id', im.image_id, 'url', im.image_url, 'position', im.position
					) ORDER BY im.position, im.image_id)
					FROM item_images im WHERE im.image_item_id = i.item_id
				), '[]'::json) AS images,
				(
					SELECT im.image_url FROM item_images im
					WHERE im.image_item_id = i.item_id
					ORDER BY im.position, im.image_id LIMIT 1
				) AS image_url
			FROM items i
			JOIN users u ON u.user_id = i.item_owner_id
			JOIN categories c ON c.category_id = i.item_category_id
			LEFT JOIN item_swap_details sd ON sd.swap_item_id = i.item_id
			LEFT JOIN categories dc ON dc.category_id = sd.desired_category_id
			WHERE i.item_id = $1
			FOR UPDATE OF i`, [itemId]);
		if (rows.length === 0) {
			await client.query('ROLLBACK');
			return res.status(404).json({
				error: { code: 'NOT_FOUND', message: 'Item not found.' },
			});
		}
		if (rows[0].item_status === 'removed') {
			await client.query('ROLLBACK');
			return res.status(409).json({
				error: { code: 'INVALID_STATE', message: 'Item is already removed.' },
			});
		}

		const item = mapItem({ ...rows[0], item_status: 'removed' });
		await client.query(`UPDATE items SET item_status = 'removed' WHERE item_id = $1`, [itemId]);
		await client.query(`
			WITH rejected AS (
				UPDATE requests SET request_status = 'rejected'
				WHERE request_item_id = $1 AND request_status = 'pending'
				RETURNING request_id, requester_user_id
			)
			INSERT INTO notifications (
				recipient_user_id, actor_user_id, notification_item_id,
				notification_request_id, notification_type, notification_decision
			)
			SELECT requester_user_id, $2, $1, request_id, 'request_decided', 'rejected'
			FROM rejected`, [itemId, req.user.id]);
		await client.query('COMMIT');
		return res.status(200).json({ item });
	} catch (error) {
		if (client) {
			try { await client.query('ROLLBACK'); }
			catch (rollbackError) { console.error('Failed to roll back admin item removal:', rollbackError); }
		}
		console.error('Failed to remove admin item:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	} finally {
		client?.release();
	}
});

adminRouter.patch('/users/:id/role', async (req, res) => {
	const userId = Number(req.params.id);
	const details = {};
	if (!/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(userId))
		details.id = 'Enter a valid user ID';
	if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || req.body.role !== 'admin')
		details.role = 'Role must be admin';
	if (Object.keys(details).length > 0) {
		return res.status(400).json({
			error: { code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.', details },
		});
	}

	try {
		const { rows } = await pool.query(`
			WITH updated AS (
				UPDATE users SET role = 'admin' WHERE user_id = $1
				RETURNING user_id, user_name, user_email, role,
					user_room_number, user_phone_number, user_created_at
			)
			SELECT u.user_id, u.user_name, u.user_email, u.role,
				u.user_room_number, u.user_phone_number, u.user_created_at,
				(SELECT COUNT(*) FROM items i
					WHERE i.item_owner_id = u.user_id AND i.item_status <> 'removed') AS items_count
			FROM updated u`, [userId]);
		if (rows.length === 0) {
			return res.status(404).json({
				error: { code: 'NOT_FOUND', message: 'User not found.' },
			});
		}
		const row = rows[0];
		return res.status(200).json({
			user: {
				id: Number(row.user_id),
				name: row.user_name,
				email: row.user_email,
				role: row.role,
				room_number: row.user_room_number,
				phone_number: row.user_phone_number,
				created_at: row.user_created_at,
				items_count: Number(row.items_count),
			},
		});
	} catch (error) {
		console.error('Failed to assign admin role:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	}
});

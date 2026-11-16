import { Router } from 'express';
import { pool } from '../db.js';
import {
	itemSelect,
	mapItem,
	positiveId,
	validationError,
	databaseError,
	notFound,
	forbidden,
	invalidState,
} from '../item-data.js';
import { requireAuth } from '../middleware/auth.js';
import {
	imageUpload,
	requireMultipart,
	validateImages,
	saveImages,
	discardImages,
} from '../uploads.js';
import { requestSelect, mapRequest } from '../request-data.js';

export const itemsRouter = Router();

function dateValue(value) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
		return false;
	}
	if (value.startsWith('0000')) {
		return false;
	}

	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

itemsRouter.get('/', async (req, res) => {
	const {
		q,
		category_id: categoryQuery,
		type,
		sort = 'newest',
		from,
		to,
		page: pageQuery,
		limit: limitQuery,
	} = req.query;
	const details = {};

	if (q !== undefined && typeof q !== 'string') {
		details.q = 'Search must be text';
	}

	const categoryId = categoryQuery === undefined ? null : positiveId(categoryQuery);
	if (categoryQuery !== undefined && categoryId === null) {
		details.category_id = 'Enter a valid category ID';
	}
	if (type !== undefined && !['free', 'swap'].includes(type)) {
		details.type = 'Type must be free or swap';
	}
	if (!['newest', 'oldest'].includes(sort)) {
		details.sort = 'Sort must be newest or oldest';
	}
	if (from !== undefined && !dateValue(from)) {
		details.from = 'Enter a valid date';
	}
	if (to !== undefined && !dateValue(to)) {
		details.to = 'Enter a valid date';
	}
	if (dateValue(from) && dateValue(to) && from > to) {
		details.from = 'Start date must not exceed end date';
	}

	const page = pageQuery === undefined ? 1 : positiveId(pageQuery);
	const limit = limitQuery === undefined ? 12 : positiveId(limitQuery);
	if (page === null) {
		details.page = 'Page must be a positive integer';
	}
	if (limit === null || limit > 50) {
		details.limit = 'Limit must be an integer from 1 to 50';
	}

	const offset = (page - 1) * limit;
	if (page !== null && limit !== null && !Number.isSafeInteger(offset)) {
		details.page = 'Page is too large';
	}
	if (Object.keys(details).length) {
		return validationError(res, details);
	}

	const conditions = ["i.item_status IN ('available', 'pending')"];
	const values = [];

	function filter(sql, value) {
		values.push(value);
		conditions.push(sql.replaceAll('?', `$${values.length}`));
	}

	if (q?.trim()) {
		filter('(strpos(lower(i.item_title), lower(?)) > 0 OR strpos(lower(i.item_description), lower(?)) > 0)', q.trim());
	}
	if (categoryId !== null) {
		filter('i.item_category_id = ?', categoryId);
	}
	if (type !== undefined) {
		filter('i.item_type = ?', type);
	}
	if (from !== undefined) {
		filter("(i.item_created_at AT TIME ZONE 'Asia/Bangkok')::date >= ?::date", from);
	}
	if (to !== undefined) {
		filter("(i.item_created_at AT TIME ZONE 'Asia/Bangkok')::date <= ?::date", to);
	}

	const viewerId = positiveId(String(req.session?.userId ?? ''));
	if (viewerId !== null) {
		filter('i.item_owner_id <> ?', viewerId);
	}

	const where = `WHERE ${conditions.join(' AND ')}`;
	const direction = sort === 'newest' ? 'DESC' : 'ASC';

	try {
		const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS total FROM items i ${where}`, values);
		const total = Number(countRows[0].total);
		const { rows } = await pool.query(`${itemSelect} ${where}
      ORDER BY i.item_created_at ${direction}, i.item_id ${direction}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
			[...values, limit, offset]);
		return res.json({
			items: rows.map(mapItem),
			pagination: {
				page,
				limit,
				total,
				total_pages: Math.ceil(total / limit),
			},
		});
	} catch (error) {
		return databaseError(res, error, 'load feed');
	}
});

itemsRouter.get('/:id', async (req, res) => {
	const id = positiveId(req.params.id);
	if (id === null) {
		return validationError(res, { id: 'Enter a valid item ID' });
	}

	try {
		const { rows } = await pool.query(`${itemSelect}
      WHERE i.item_id = $1 AND i.item_status <> 'removed'`, [id]);
		if (!rows.length) {
			return notFound(res);
		}

		return res.json({ item: mapItem(rows[0]) });
	} catch (error) {
		return databaseError(res, error, 'load item');
	}
});

itemsRouter.post('/', requireAuth, requireMultipart, imageUpload('images'), async (req, res) => {
	const body = req.body ?? {};
	const details = {};
	const allowed = [
		'title',
		'category_id',
		'type',
		'description',
		'defects',
		'desired_category_id',
		'desired_description',
	];

	for (const field of Object.keys(body)) {
		if (!allowed.includes(field)) {
			details[field] = 'Unknown field';
		}
	}
	if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) {
		details.title = 'Title must contain 1 to 200 characters';
	}

	const categoryId = positiveId(body.category_id);
	if (categoryId === null) {
		details.category_id = 'Enter a valid category ID';
	}
	if (!['free', 'swap'].includes(body.type)) {
		details.type = 'Type must be free or swap';
	}

	for (const field of ['description', 'defects']) {
		if (body[field] !== undefined && typeof body[field] !== 'string') {
			details[field] = 'Must be text';
		}
	}

	const desiredCategoryId = body.desired_category_id === undefined ? null : positiveId(body.desired_category_id);
	if (body.type === 'swap') {
		if (typeof body.desired_description !== 'string' || !body.desired_description.trim()) {
			details.desired_description = 'Describe the item wanted in exchange';
		}
		if (body.desired_category_id !== undefined && desiredCategoryId === null) {
			details.desired_category_id = 'Enter a valid category ID';
		}
	} else {
		if (body.desired_category_id !== undefined) {
			details.desired_category_id = 'Only swap posts have swap details';
		}
		if (body.desired_description !== undefined) {
			details.desired_description = 'Only swap posts have swap details';
		}
	}

	if (Object.keys(details).length) {
		return validationError(res, details);
	}
	if (!validateImages(req.files)) {
		return res.status(415).json({
			error: {
				code: 'UNSUPPORTED_MEDIA_TYPE',
				message: 'Upload JPG, PNG or WebP images only.',
			},
		});
	}

	const savedPaths = [];
	let client;
	let committed = false;

	try {
		client = await pool.connect();
		await client.query('BEGIN');

		const categories = [
			['category_id', categoryId],
			['desired_category_id', desiredCategoryId],
		];

		for (const [field, id] of categories) {
			if (id === null) {
				continue;
			}

			const { rows } = await client.query('SELECT category_id FROM categories WHERE category_id = $1', [id]);
			if (!rows.length) {
				await client.query('ROLLBACK');
				return validationError(res, { [field]: 'Category not found' });
			}
		}
		const { rows: inserted } = await client.query(`INSERT INTO items (
      item_owner_id, item_category_id, item_title, item_description, item_defects, item_type
    ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING item_id`,
			[
				req.user.id,
				categoryId,
				body.title.trim(),
				body.description ?? null,
				body.defects ?? null,
				body.type,
			]);
		const id = Number(inserted[0].item_id);

		if (body.type === 'swap') {
			await client.query(`INSERT INTO item_swap_details
        (swap_item_id, desired_category_id, desired_description) VALUES ($1, $2, $3)`,
				[id, desiredCategoryId, body.desired_description.trim()]);
		}
		const urls = await saveImages(req.files, 'items', savedPaths);
		for (const [position, url] of urls.entries()) {
			await client.query(`INSERT INTO item_images (image_item_id, image_url, position)
        VALUES ($1, $2, $3)`, [id, url, position]);
		}
		const { rows } = await client.query(`${itemSelect} WHERE i.item_id = $1`, [id]);
		const item = mapItem(rows[0]);

		await client.query('COMMIT');
		committed = true;
		return res.status(201).json({ item });
	} catch (error) {
		if (client && !committed) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackError) {
				console.error('Failed to roll back item creation:', rollbackError);
			}
		}
		if (!committed) {
			await discardImages(savedPaths);
		}

		return databaseError(res, error, 'create item');
	} finally {
		client?.release();
	}
});

function checkPatch(body, type) {
	const details = {};
	const allowed = [
		'title',
		'category_id',
		'description',
		'defects',
		'desired_category_id',
		'desired_description',
	];

	if (!body || typeof body !== 'object' || Array.isArray(body) ||
		!Object.keys(body).length) {
		return { body: 'Provide at least one editable field' };
	}

	for (const key of Object.keys(body)) {
		if (!allowed.includes(key)) {
			details[key] = 'Field cannot be edited';
		}
	}
	if ('title' in body && (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200)) {
		details.title = 'Title must contain 1 to 200 characters';
	}
	if ('category_id' in body && positiveBodyId(body.category_id) === null) {
		details.category_id = 'Enter a valid category ID';
	}

	for (const key of ['description', 'defects']) {
		if (key in body && body[key] !== null && typeof body[key] !== 'string') {
			details[key] = 'Must be text or null';
		}
	}
	if ('desired_category_id' in body && body.desired_category_id !== null &&
		positiveBodyId(body.desired_category_id) === null) {
		details.desired_category_id = 'Enter a valid category ID or null';
	}
	if ('desired_description' in body &&
		(typeof body.desired_description !== 'string' || !body.desired_description.trim())) {
		details.desired_description = 'Describe the item wanted in exchange';
	}

	if (type === 'free') {
		if ('desired_category_id' in body) {
			details.desired_category_id = 'Only swap posts have swap details';
		}
		if ('desired_description' in body) {
			details.desired_description = 'Only swap posts have swap details';
		}
	}

	return details;
}

function positiveBodyId(value) {
	if (typeof value === 'string') {
		return positiveId(value);
	}

	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

itemsRouter.patch('/:id', requireAuth, async (req, res) => {
	const id = positiveId(req.params.id);
	if (id === null) {
		return validationError(res, { id: 'Enter a valid item ID' });
	}

	const basicErrors = checkPatch(req.body);
	if (Object.keys(basicErrors).length) {
		return validationError(res, basicErrors);
	}

	let client;
	try {
		client = await pool.connect();
		await client.query('BEGIN');

		const { rows } = await client.query(`${itemSelect} WHERE i.item_id = $1 FOR UPDATE OF i`, [id]);
		if (!rows.length) {
			await client.query('ROLLBACK');
			return notFound(res);
		}

		const row = rows[0];
		if (Number(row.item_owner_id) !== req.user.id) {
			await client.query('ROLLBACK');
			return forbidden(res);
		}
		if (row.item_status !== 'available') {
			await client.query('ROLLBACK');
			return invalidState(res);
		}

		const details = checkPatch(req.body, row.item_type);
		if (Object.keys(details).length) {
			await client.query('ROLLBACK');
			return validationError(res, details);
		}

		for (const field of ['category_id', 'desired_category_id']) {
			const categoryId = req.body[field];
			if (categoryId === undefined || categoryId === null) {
				continue;
			}

			const result = await client.query('SELECT category_id FROM categories WHERE category_id = $1', [categoryId]);
			if (!result.rows.length) {
				details[field] = 'Category not found';
			}
		}
		if (Object.keys(details).length) {
			await client.query('ROLLBACK');
			return validationError(res, details);
		}

		const columns = {
			title: 'item_title',
			category_id: 'item_category_id',
			description: 'item_description',
			defects: 'item_defects',
		};
		const entries = Object.entries(columns).filter(([field]) => field in req.body);

		if (entries.length) {
			const assignments = entries.map(([, column], index) => `${column} = $${index + 2}`);
			const values = entries.map(([field]) => {
				return field === 'title' ? req.body[field].trim() : req.body[field];
			});
			await client.query(`UPDATE items SET ${assignments.join(', ')} WHERE item_id = $1`, [id, ...values]);
		}

		if (row.item_type === 'swap' &&
			('desired_category_id' in req.body || 'desired_description' in req.body)) {
			const desiredCategoryId = 'desired_category_id' in req.body
				? req.body.desired_category_id
				: row.desired_category_id;
			const desiredDescription = 'desired_description' in req.body
				? req.body.desired_description.trim()
				: row.desired_description;
			await client.query(`UPDATE item_swap_details
        SET desired_category_id = $2, desired_description = $3 WHERE swap_item_id = $1`,
				[id, desiredCategoryId, desiredDescription]);
		}
		const updated = await client.query(`${itemSelect} WHERE i.item_id = $1`, [id]);
		const item = mapItem(updated.rows[0]);

		await client.query('COMMIT');
		return res.json({ item });
	} catch (error) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackError) {
				console.error('Failed to roll back item edit:', rollbackError);
			}
		}

		return databaseError(res, error, 'edit item');
	} finally {
		client?.release();
	}
});

itemsRouter.delete('/:id', requireAuth, async (req, res) => {
	const id = positiveId(req.params.id);
	if (id === null) {
		return validationError(res, { id: 'Enter a valid item ID' });
	}

	let client;
	try {
		client = await pool.connect();
		await client.query('BEGIN');

		const { rows } = await client.query(`${itemSelect} WHERE i.item_id = $1 FOR UPDATE OF i`, [id]);
		if (!rows.length) {
			await client.query('ROLLBACK');
			return notFound(res);
		}
		if (Number(rows[0].item_owner_id) !== req.user.id) {
			await client.query('ROLLBACK');
			return forbidden(res);
		}
		if (rows[0].item_status !== 'available') {
			await client.query('ROLLBACK');
			return invalidState(res);
		}

		await client.query("UPDATE items SET item_status = 'removed' WHERE item_id = $1", [id]);
		const item = mapItem({ ...rows[0], item_status: 'removed' });

		await client.query('COMMIT');
		return res.json({ item });
	} catch (error) {
		if (client) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackError) {
				console.error('Failed to roll back item removal:', rollbackError);
			}
		}

		return databaseError(res, error, 'remove item');
	} finally {
		client?.release();
	}
});

itemsRouter.post('/:id/requests', requireAuth, requireMultipart, imageUpload('offer_images'), async (req, res) => {
	const itemId = positiveId(req.params.id);
	if (itemId === null) {
		return validationError(res, { id: 'Enter a valid item ID' });
	}

	const body = req.body ?? {};
	const details = {};
	for (const field of Object.keys(body)) {
		if (!['message', 'offer_description'].includes(field)) {
			details[field] = 'Unknown field';
		}
	}
	if (body.message !== undefined && typeof body.message !== 'string') {
		details.message = 'Must be text';
	}
	if (Object.keys(details).length) {
		return validationError(res, details);
	}
	if (!validateImages(req.files)) {
		return res.status(415).json({
			error: {
				code: 'UNSUPPORTED_MEDIA_TYPE',
				message: 'Upload JPG, PNG or WebP images only.',
			}
		});
	}

	const savedPaths = [];
	let client;
	let committed = false;

	try {
		client = await pool.connect();
		await client.query('BEGIN');

		const { rows: items } = await client.query(`SELECT item_owner_id, item_type, item_status
      FROM items WHERE item_id = $1 FOR UPDATE`, [itemId]);
		if (!items.length) {
			await client.query('ROLLBACK');
			return notFound(res);
		}

		const item = items[0];
		if (Number(item.item_owner_id) === req.user.id) {
			await client.query('ROLLBACK');
			return forbidden(res);
		}
		if (!['available', 'pending'].includes(item.item_status)) {
			await client.query('ROLLBACK');
			return invalidState(res);
		}

		if (item.item_type === 'swap') {
			if (typeof body.offer_description !== 'string' || !body.offer_description.trim()) {
				details.offer_description = 'Describe the item offered in exchange';
			}
		} else {
			if (body.offer_description !== undefined) {
				details.offer_description = 'Free posts do not accept swap offers';
			}
			if (req.files.length) {
				details.offer_images = 'Free posts do not accept swap offers';
			}
		}
		if (Object.keys(details).length) {
			await client.query('ROLLBACK');
			return validationError(res, details);
		}

		const prior = await client.query(`SELECT request_id FROM requests
      WHERE request_item_id = $1 AND requester_user_id = $2`, [itemId, req.user.id]);
		if (prior.rows.length) {
			await client.query('ROLLBACK');
			return res.status(409).json({
				error: {
					code: 'CONFLICT',
					message: 'You already requested this item.',
				},
			});
		}
		const { rows: inserted } = await client.query(`INSERT INTO requests
      (request_item_id, requester_user_id, request_message)
      VALUES ($1, $2, $3) RETURNING request_id`,
			[itemId, req.user.id, body.message ?? null]);
		const requestId = Number(inserted[0].request_id);

		if (item.item_type === 'swap') {
			const { rows: offers } = await client.query(`INSERT INTO request_swap_offers
        (offer_request_id, offer_description) VALUES ($1, $2) RETURNING offer_id`,
				[requestId, body.offer_description.trim()]);
			const urls = await saveImages(req.files, 'offers', savedPaths);
			for (const [position, url] of urls.entries()) {
				await client.query(`INSERT INTO request_swap_offer_images
          (image_offer_id, image_url, position) VALUES ($1, $2, $3)`,
					[Number(offers[0].offer_id), url, position]);
			}
		}
		await client.query("UPDATE items SET item_status = 'pending' WHERE item_id = $1", [itemId]);
		await client.query(`INSERT INTO notifications
      (recipient_user_id, actor_user_id, notification_item_id, notification_request_id, notification_type)
      VALUES ($1, $2, $3, $4, 'request_received')`,
			[Number(item.item_owner_id), req.user.id, itemId, requestId]);
		const { rows } = await client.query(`${requestSelect} WHERE r.request_id = $1`, [requestId]);
		const request = mapRequest(rows[0]);

		await client.query('COMMIT');
		committed = true;
		return res.status(201).json({ request });
	} catch (error) {
		if (client && !committed) {
			try {
				await client.query('ROLLBACK');
			} catch (rollbackError) {
				console.error('Failed to roll back request creation:', rollbackError);
			}
		}
		if (!committed) {
			await discardImages(savedPaths);
		}
		if (error.code === '23505') {
			return res.status(409).json({
				error: {
					code: 'CONFLICT',
					message: 'You already requested this item.',
				}
			});
		}

		return databaseError(res, error, 'create request');
	} finally {
		client?.release();
	}
});

export const itemSelect = `
  SELECT i.item_id, i.item_owner_id, i.item_title, i.item_description,
    i.item_defects, i.item_type, i.item_status, i.item_created_at,
    c.category_id, c.category_name, u.user_name AS owner_name,
    sd.desired_description, dc.category_id AS desired_category_id,
    dc.category_name AS desired_category_name,
    COALESCE((
      SELECT json_agg(json_build_object('id', im.image_id, 'url', im.image_url,
        'position', im.position) ORDER BY im.position, im.image_id)
      FROM item_images im WHERE im.image_item_id = i.item_id
    ), '[]'::json) AS images,
    (SELECT im.image_url FROM item_images im WHERE im.image_item_id = i.item_id
      ORDER BY im.position, im.image_id LIMIT 1) AS image_url
  FROM items i
  JOIN categories c ON c.category_id = i.item_category_id
  JOIN users u ON u.user_id = i.item_owner_id
  LEFT JOIN item_swap_details sd ON sd.swap_item_id = i.item_id
  LEFT JOIN categories dc ON dc.category_id = sd.desired_category_id`;

export function mapItem(row) {
	return {
		id: Number(row.item_id),
		title: row.item_title,
		description: row.item_description,
		defects: row.item_defects,
		type: row.item_type,
		status: row.item_status,
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
		},
		swap_details: row.item_type === 'swap' ? {
			desired_category: row.desired_category_id == null ? null : {
				id: Number(row.desired_category_id),
				name: row.desired_category_name,
			},
			desired_description: row.desired_description,
		} : null,
		created_at: row.item_created_at,
	};
}

export function positiveId(value) {
	if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
		return null;
	}

	const id = Number(value);
	return Number.isSafeInteger(id) ? id : null;
}

export function validationError(res, details) {
	return res.status(400).json({
		error: {
			code: 'VALIDATION_ERROR',
			message: 'Please check the submitted fields.',
			details,
		},
	});
}

export function databaseError(res, error, action) {
	console.error(`Failed to ${action}:`, error);
	return res.status(503).json({
		error: {
			code: 'DATABASE_UNAVAILABLE',
			message: 'Database is temporarily unavailable.',
		},
	});
}

export function notFound(res) {
	return res.status(404).json({
		error: {
			code: 'NOT_FOUND',
			message: 'Item not found.',
		},
	});
}

export function forbidden(res) {
	return res.status(403).json({
		error: {
			code: 'FORBIDDEN',
			message: 'You do not have permission to access this item.',
		},
	});
}

export function invalidState(res) {
	return res.status(409).json({
		error: {
			code: 'INVALID_STATE',
			message: 'Item is not in a state that allows this action.',
		},
	});
}

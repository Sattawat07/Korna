export const requestSelect = `
  SELECT r.request_id, r.request_message, r.request_status, r.request_created_at,
    i.item_id, i.item_title, i.item_type, i.item_status,
    u.user_id AS requester_id, u.user_name AS requester_name,
    o.offer_id, o.offer_description,
    (SELECT im.image_url FROM item_images im WHERE im.image_item_id = i.item_id
      ORDER BY im.position, im.image_id LIMIT 1) AS item_image_url,
    (SELECT oi.image_url FROM request_swap_offer_images oi WHERE oi.image_offer_id = o.offer_id
      ORDER BY oi.position, oi.image_id LIMIT 1) AS offer_image_url,
    COALESCE((SELECT json_agg(json_build_object('id', oi.image_id, 'url', oi.image_url,
      'position', oi.position) ORDER BY oi.position, oi.image_id)
      FROM request_swap_offer_images oi WHERE oi.image_offer_id = o.offer_id), '[]'::json) AS offer_images
  FROM requests r
  JOIN items i ON i.item_id = r.request_item_id
  JOIN users u ON u.user_id = r.requester_user_id
  LEFT JOIN request_swap_offers o ON o.offer_request_id = r.request_id`;

export function mapRequest(row) {
	return {
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
	};
}

import { pool } from '../db.js';

export async function requireAuth(req, res, next) {
	const userId = req.session?.userId;
	if (!userId) {
		return res.status(401).json({
			error: { code: 'UNAUTHENTICATED', message: 'Please log in first.' },
		});
	}

	try {
		const { rows } = await pool.query(
			'SELECT user_id AS id, role FROM users WHERE user_id = $1 LIMIT 1',
			[userId]
		);
		if (rows.length === 0) {
			return res.status(401).json({
				error: { code: 'UNAUTHENTICATED', message: 'Please log in first.' },
			});
		}
		req.user = { id: Number(rows[0].id), role: rows[0].role };
		return next();
	} catch (error) {
		console.error('Failed to check authenticated user:', error);
		return res.status(503).json({
			error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is temporarily unavailable.' },
		});
	}
}

// Apply requireAuth before requireRole on protected routes.
export function requireRole(role) {
	return (req, res, next) => {
		if (!req.user) {
			return res.status(401).json({
				error: { code: 'UNAUTHENTICATED', message: 'Please log in first.' },
			});
		}
		if (req.user.role !== role) {
			return res.status(403).json({
				error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' },
			});
		}
		return next();
	};
}

import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const REMEMBERED_SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const PgSessionStore = connectPgSimple(session);

export function createSessionStore(pool) {
	return new PgSessionStore({
		pool,
		tableName: 'sessions',
		ttl: SESSION_TTL_SECONDS,
		disableTouch: true,
	});
}

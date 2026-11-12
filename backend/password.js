import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export async function hashPassword(password) {
	const salt = randomBytes(16);
	const passwordHash = await argon2.hash(password, {
		type: argon2.argon2id,
		salt,
		memoryCost: 19456,
		timeCost: 2,
		parallelism: 1,
	});
	return { passwordHash, passwordSalt: salt.toString('base64') };
}

export async function verifyPassword(passwordHash, password) {
	return argon2.verify(passwordHash, password);
}

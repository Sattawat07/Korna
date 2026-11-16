import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import multer from 'multer';
import { config } from './config.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function imageUpload(field) {
	const upload = multer({
		storage: multer.memoryStorage(),
		limits: { fileSize: MAX_IMAGE_BYTES, files: 5, fields: 12 }
	}).array(field, 5);
	return (req, res, next) => upload(req, res, (error) => {
		if (!error) return next();
		if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({
			error: {
				code: 'FILE_TOO_LARGE', message: 'Each image must be at most 5 MB.',
			}
		});
		return res.status(400).json({
			error: {
				code: 'VALIDATION_ERROR', message: 'Please check the submitted fields.',
				details: { [field]: 'Upload at most 5 images in the expected field' },
			}
		});
	});
}

export function requireMultipart(req, res, next) {
	if (req.is('multipart/form-data')) return next();
	return res.status(415).json({
		error: {
			code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Send multipart/form-data.',
		}
	});
}

function imageExtension(buffer) {
	if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
	if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
	if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
		buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
	return null;
}

export function validateImages(files) {
	return files.every((file) => {
		const ext = imageExtension(file.buffer);
		return ext && file.mimetype === ({ jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })[ext];
	});
}

export async function saveImages(files, folder, savedPaths) {
	const directory = join(config.uploadDir, folder);
	await mkdir(directory, { recursive: true });
	const urls = [];
	for (const file of files) {
		const filename = `${randomUUID()}.${imageExtension(file.buffer)}`;
		const path = join(directory, filename);
		await writeFile(path, file.buffer, { flag: 'wx' });
		savedPaths.push(path);
		urls.push(`/uploads/${folder}/${filename}`);
	}
	return urls;
}

export async function discardImages(paths) {
	await Promise.all(paths.map((path) => unlink(path).catch((error) => {
		if (error.code !== 'ENOENT') console.error('Failed to clean up uploaded image:', error);
	})));
}

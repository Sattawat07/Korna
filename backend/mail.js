import { config } from './config.js';
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
	host: config.smtp.host,
	port: config.smtp.port,
	secure: config.smtp.secure,
	auth: {
		user: config.smtp.user,
		pass: config.smtp.pass,
	},
});

export async function sendSignupOtp(email, otp) {
	await transporter.sendMail({
		from: config.smtp.from,
		to: email,
		subject: 'รหัสยืนยันการสมัคร Korna',
		text: `รหัสยืนยันของคุณคือ ${otp}\nรหัสนี้มีอายุ 5 นาที`,
	});
}

export async function sendPasswordResetOtp(email, otp) {
	await transporter.sendMail({
		from: config.smtp.from,
		to: email,
		subject: 'รหัสยืนยันการตั้งรหัสผ่านใหม่ Korna',
		text: `รหัสยืนยันการตั้งรหัสผ่านใหม่ของคุณคือ ${otp}\nรหัสนี้มีอายุ 5 นาที\nหากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน สามารถละเว้นอีเมลนี้ได้`,
	});
}

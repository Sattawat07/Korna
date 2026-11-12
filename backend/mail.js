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
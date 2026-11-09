# การรัน Korna

ใช้ Node.js 22 ขึ้นไปและ PostgreSQL บนเครื่องเดียวกัน คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `PGPASSWORD` และ `SESSION_SECRET` ที่สุ่มยาวอย่างน้อย 32 ไบต์ เก็บ `.env` ไว้เฉพาะเครื่อง ไม่ส่งขึ้น Git

ฐานข้อมูลใหม่: สร้างฐานข้อมูลด้วย `db/create_database.sql` แล้วรัน `db/schema.sql` และ `db/seed_categories.sql` ในฐานข้อมูล `korna`

ฐานข้อมูลเดิมที่ใช้ `user_password`: สำรองฐานข้อมูลก่อน แล้วรัน `db/migrate_session_auth.sql` เพียงครั้งเดียว Migration จะหยุดถ้ามีผู้ใช้เดิม เพราะต้องแปลงรหัสผ่านเหล่านั้นเป็น Argon2id ก่อน ห้ามลบข้อมูลผู้ใช้เพื่อให้ migration ผ่าน

รัน `npm ci` และ `npm start` จากรากโปรเจกต์ ตรวจ `GET /api/health`, `GET /api/health/db` และ `GET /api/categories` หน้าเว็บให้เพื่อนวางในโฟลเดอร์ `frontend/` ที่รากโปรเจกต์ Node จะเสิร์ฟไฟล์เหล่านี้ร่วม origin กับ API

บนเครื่อง Linux Mint ที่เปิดผ่าน Tailscale Serve ให้ Node ฟัง `127.0.0.1:3000` และใช้ Serve ส่ง HTTPS เข้า port นี้ ตั้ง `COOKIE_SECURE=true` และ `TRUST_PROXY=true` ใน `.env` ก่อนใช้ session cookie ผ่าน HTTPS เครื่องเพื่อนเปิด URL ของ Serve และเรียก API ด้วย path `/api/...`

การตั้งค่า session และตาราง `sessions` เตรียมพร้อมแล้ว แต่ endpoint สมัครสมาชิก ล็อกอิน ออกจากระบบ และตรวจสิทธิ์ยังไม่ได้ทำ

ฟังก์ชัน `backend/password.js` คืน `passwordHash` (สตริง Argon2id ที่มีค่า salt และพารามิเตอร์อยู่ภายใน) กับ `passwordSalt` (salt เดียวกันในรูป base64 สำหรับคอลัมน์แยกตามข้อกำหนดงาน) ใช้ `verifyPassword` ตรวจรหัสผ่านกับ hash; ไม่ต้องสร้าง salt ใหม่ตอนตรวจ

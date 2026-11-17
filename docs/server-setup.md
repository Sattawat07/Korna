# การรัน Korna

ใช้ Node.js 22 ขึ้นไปและ PostgreSQL บนเครื่องเดียวกัน คัดลอก `.env.example` เป็น `.env` แล้วกำหนด `PGPASSWORD` และ `SESSION_SECRET` ที่สุ่มยาวอย่างน้อย 32 ไบต์ เก็บ `.env` ไว้เฉพาะเครื่อง ไม่ส่งขึ้น Git

ฐานข้อมูลใหม่: สร้างฐานข้อมูลด้วย `db/create_database.sql` แล้วรัน `db/schema.sql` และ `db/seed_categories.sql` ในฐานข้อมูล `korna` ตามลำดับ ไฟล์ `schema.sql` ใช้สร้างฐานใหม่เท่านั้น ถ้ามีฐานเดิมต้องลบและสร้างใหม่ก่อน ข้อมูลเดิมจะหายไป

รัน `npm ci` และ `npm start` จากรากโปรเจกต์ ตรวจ `GET /api/health`, `GET /api/health/db` และ `GET /api/categories` หน้าเว็บให้เพื่อนวางในโฟลเดอร์ `frontend/` ที่รากโปรเจกต์ Node จะเสิร์ฟไฟล์เหล่านี้ร่วม origin กับ API

บนเครื่อง Linux Mint ที่เปิดผ่าน Tailscale Serve ให้ Node ฟัง `127.0.0.1:3000` และใช้ Serve ส่ง HTTPS เข้า port นี้ ตั้ง `COOKIE_SECURE=true` และ `TRUST_PROXY=true` ใน `.env` ก่อนใช้ session cookie ผ่าน HTTPS เครื่องเพื่อนเปิด URL ของ Serve และเรียก API ด้วย path `/api/...`

session เก็บในตาราง `sessions` และ API สมัครสมาชิก ล็อกอิน ออกจากระบบ ตรวจสิทธิ์ ฟีด โพสต์ คำขอ การแจ้งเตือน และ admin พร้อมใช้งานตาม `docs/api.md`

การสร้างโพสต์และส่งข้อเสนอแลกใช้ `multipart/form-data` ไฟล์รูปเก็บใน `uploads/items/` และ `uploads/offers/` ตามลำดับ

ฟังก์ชัน `backend/password.js` คืน `passwordHash` (สตริง Argon2id ที่มีค่า salt และพารามิเตอร์อยู่ภายใน) กับ `passwordSalt` (salt เดียวกันในรูป base64 สำหรับคอลัมน์แยกตามข้อกำหนดงาน) ใช้ `verifyPassword` ตรวจรหัสผ่านกับ hash; ไม่ต้องสร้าง salt ใหม่ตอนตรวจ

ตั้ง `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` และ `SMTP_FROM` ใน `.env` สำหรับ Nodemailer ถ้าใช้ Gmail ให้เปิดการยืนยันตัวตนสองขั้นตอนและสร้าง App Password สำหรับ `SMTP_PASS` ใช้บัญชีส่งเมลของโปรเจกต์แทนบัญชีส่วนตัวหากเป็นไปได้

การสมัครที่วางแผนไว้ใช้ OTP ทางอีเมลอายุ 5 นาที ข้อมูลสมัครและ OTP ที่รอยืนยันอยู่ใน `Map` ของ Node.js ไม่เพิ่มตาราง OTP และไม่สร้างบัญชีใน `users` จนกว่ายืนยันสำเร็จ หากรีสตาร์ต Node ระหว่างรอ ผู้ใช้ต้องเริ่มสมัครใหม่ หลังยืนยันสำเร็จให้ล็อกอินตามปกติเพื่อรับ session cookie; session หลังล็อกอินยังเก็บใน PostgreSQL

super admin คนแรก: ให้บัญชี `korna.project2026@gmail.com` สมัครและยืนยันอีเมลให้เรียบร้อยก่อน แล้วรัน `db/add_super_admin.sql` กับฐานข้อมูลเดิม สคริปต์จะขยายคอลัมน์ `role`, ปรับ constraint และยกระดับบัญชีนี้ใน transaction เดียวกัน หากไม่พบบัญชีจะ rollback ทั้งหมด ตรวจผลด้วย `SELECT user_id, user_email, role FROM users WHERE user_email = 'korna.project2026@gmail.com';` ฐานข้อมูลใหม่ใช้ `db/schema.sql` ที่รองรับ role นี้อยู่แล้ว และต้องยกระดับบัญชีหลักหลังสมัคร เฉพาะ `super_admin` มอบหรือถอดสิทธิ์ `admin` ผ่าน API ได้; `admin` ยังคงดูสถิติและจัดการโพสต์ได้

# Korna

เว็บให้ฟรีและแลกของมือสองสำหรับผู้ใช้ในหอพัก ตัวเว็บใช้ HTML, CSS และ JavaScript ส่วน API ใช้ Node.js กับ PostgreSQL หน้าเว็บและ API เปิดจาก Node server ตัวเดียวกัน จึงเรียก API ผ่าน `/api/...` ได้เลย

## เตรียมเครื่อง

- Node.js 22 ขึ้นไป
- PostgreSQL และบัญชีที่สร้างฐานข้อมูลได้
- บัญชี SMTP สำหรับส่งรหัส OTP ทางอีเมลตอนสมัครสมาชิกและขอเปลี่ยนรหัสผ่าน

## เริ่มรันในเครื่อง

1. ติดตั้งแพ็กเกจจาก `package-lock.json`

   ```bash
   npm ci
   ```

2. สร้างฐานข้อมูลใหม่ แล้วสร้างตารางและหมวดหมู่เริ่มต้นตามลำดับ คำสั่งตัวอย่างนี้ใช้บัญชี PostgreSQL ชื่อ `postgres` และรันจากโฟลเดอร์หลักของโปรเจกต์

   ```bash
   psql -U postgres -d postgres -f db/create_database.sql
   psql -U postgres -d korna -f db/schema.sql
   psql -U postgres -d korna -f db/seed_categories.sql
   ```

   `db/schema.sql` ใช้กับฐานข้อมูลใหม่เท่านั้น อย่ารันซ้ำบนฐานที่มีข้อมูลอยู่ ถ้าใช้บัญชี PostgreSQL ชื่ออื่น ให้เปลี่ยนค่า `-U` ให้ตรงกับเครื่อง

3. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าของเครื่องตัวเอง โดยเฉพาะ `PGPASSWORD`, `SESSION_SECRET` และค่า `SMTP_*` บน Windows PowerShell ใช้ `Copy-Item .env.example .env` ส่วน Linux/macOS ใช้ `cp .env.example .env`

   `SESSION_SECRET` ต้องยาวอย่างน้อย 32 ไบต์ ถ้าใช้ Gmail ส่ง OTP ให้ใช้ App Password ใน `SMTP_PASS` ไฟล์ `.env` มีข้อมูลลับและถูกกันออกจาก Git แล้ว

4. เปิด server

   ```bash
   npm start
   ```

   เปิด [http://127.0.0.1:3000](http://127.0.0.1:3000) เพื่อเข้าหน้าฟีด ถ้าแก้โค้ด backend ระหว่างพัฒนา ใช้ `npm run dev` เพื่อให้ Node เริ่มใหม่เมื่อไฟล์เปลี่ยน

## เช็กว่ารันได้

- [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health) ต้องได้ `{"status":"ok"}`
- [http://127.0.0.1:3000/api/health/db](http://127.0.0.1:3000/api/health/db) ต้องได้ `{"database":"connected"}`
- [http://127.0.0.1:3000/api/categories](http://127.0.0.1:3000/api/categories) ต้องเห็นหมวดหมู่ที่เพิ่มจากไฟล์ seed

รันเทส API ด้วย `npm test` เทสบางชุดเปิด server ชั่วคราวบน `127.0.0.1` จึงต้องให้เครื่องอนุญาตการเชื่อมต่อ localhost

## โครงสร้างโปรเจกต์

| ที่อยู่ | ใช้ทำอะไร |
| --- | --- |
| `frontend/pages/` และ `frontend/assets/` | หน้าเว็บ สไตล์ และ JavaScript ฝั่งผู้ใช้ |
| `backend/server.js` | เปิดเว็บ ติดตั้ง session และเชื่อม API routes |
| `backend/routes/` | API ของบัญชี โพสต์ คำขอ การแจ้งเตือน และแอดมิน |
| `db/` | SQL สำหรับสร้างฐานข้อมูล ตาราง หมวดหมู่ และปรับฐานเดิม |
| `test/` | เทส API |
| `uploads/` | รูปที่ผู้ใช้อัปโหลด สร้างตอนรันและไม่ส่งขึ้น Git |

รูปแบบ request/response และสิทธิ์ของแต่ละ endpoint อยู่ใน [docs/api.md](docs/api.md) ส่วนการรันผ่าน Tailscale Serve และรายละเอียดการตั้งค่าเครื่อง server อยู่ใน [docs/server-setup.md](docs/server-setup.md)

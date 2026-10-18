# Korna backend

โครงเริ่มต้นของ Node.js API สำหรับเว็บแลกของมือสอง ในแต่ละเครื่องที่รันระบบ ให้ Node.js ติดต่อ PostgreSQL ของเครื่องนั้นผ่าน `127.0.0.1` รูปที่ผู้ใช้อัปโหลดจะอยู่ใน `uploads/` และฐานข้อมูลจะเก็บเพียง URL path ของรูป

## เริ่มบนเครื่องตัวเอง

1. ติดตั้ง Node.js 20 ขึ้นไปและ PostgreSQL
2. คัดลอก `.env.example` เป็น `.env` แล้วแก้ `PGPASSWORD` ให้ตรงกับ PostgreSQL ของเครื่องคุณ ใน PowerShell ใช้ `Copy-Item .env.example .env`
3. เชื่อมต่อฐานข้อมูล `postgres` แล้วรัน `db/create_database.sql` หนึ่งครั้ง จากนั้นเปลี่ยนไปเชื่อมต่อฐานข้อมูล `korna` แล้วรัน `db/schema.sql`
4. รัน `npm ci` แล้วรัน `npm run dev`
5. เปิด `http://127.0.0.1:3000/api/health` เพื่อตรวจ Node.js และ `http://127.0.0.1:3000/api/health/db` เพื่อตรวจการเชื่อม PostgreSQL

`npm run dev` จะเริ่ม API ใหม่เมื่อไฟล์โค้ดเปลี่ยน แอปจะสร้างโฟลเดอร์ `uploads/` ให้อัตโนมัติ `.env` และ `uploads/` ถูกกันออกจาก Git แล้ว ส่วน `.env.example` และ `package-lock.json` ควรเก็บใน Git เพื่อให้เพื่อนตั้งค่าตามได้

## ย้ายไป Linux Mint เพื่อให้เพื่อนทดสอบ

1. ดึง repo เดียวกันลง server แล้วติดตั้ง Node.js และแพ็กเกจด้วย `npm ci`
2. คัดลอก `.env.example` เป็น `.env` บน server และแก้รหัสผ่าน DB ของ server โดยคง `PGHOST=127.0.0.1`
3. ตั้ง `HOST` เป็น Tailscale IP ของ server เพื่อให้ API รับคำขอจากเพื่อนผ่าน Tailscale และอนุญาตพอร์ต API ในไฟร์วอลล์เฉพาะที่จำเป็น
4. รัน SQL สองไฟล์กับ PostgreSQL บน server แล้วเริ่ม API ด้วย `npm start`

เพื่อนเปิด frontend บนเครื่องตัวเองและเรียก API ที่ `http://<server-tailscale-ip>:3000/api/...` ถ้า frontend ใช้พอร์ตอื่น ให้เพิ่ม origin ของหน้าเว็บใน `CORS_ORIGINS` เมื่อ API ส่ง URL path ของรูป เช่น `/uploads/items/example.webp` ให้ frontend เติม API base URL ข้างหน้า path นั้น

อย่าเก็บรหัสผ่านจริงหรือรูปที่ผู้ใช้อัปโหลดใน Git หากภายหลังใช้ Docker ให้ mount `uploads/` เป็นที่เก็บข้อมูลถาวร

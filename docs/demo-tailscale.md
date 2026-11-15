# ทดสอบ Korna ผ่าน Tailscale Serve

ให้เครื่องที่รัน Node.js และ PostgreSQL เป็นเครื่องเจ้าของเว็บ ส่วนเครื่องเพื่อนเปิดเว็บผ่าน browser ใน tailnet เดียวกัน ไม่ต้องรัน Node.js บนเครื่องเพื่อน

## เตรียมเครื่องเจ้าของเว็บ

1. ใช้ branch `demo/tailscale-https` และติดตั้ง dependencies ด้วย `npm ci`
2. ตรวจว่าฐานข้อมูล `korna` และตาราง `sessions` พร้อมใช้งาน
3. ตั้งค่า `.env` โดยใช้ค่าฐานข้อมูลและ SMTP ของเครื่องตนเอง พร้อมค่าด้านล่าง:

   ```env
   HOST=127.0.0.1
   PORT=3000
   COOKIE_SECURE=true
   TRUST_PROXY=true
   ```

4. เปิด PostgreSQL แล้วรัน `npm start` จากรากโปรเจกต์ ตรวจ `http://127.0.0.1:3000/api/health/db` ว่าตอบ `{"database":"connected"}`
5. ติดตั้งและล็อกอิน Tailscale จากนั้นเปิด terminal อีกหน้าต่างและรัน `tailscale serve 3000` ทำตามหน้าจอหากต้องเปิด HTTPS certificates ใน tailnet
6. เก็บ terminal ของ Node.js และ Tailscale Serve ให้ทำงานอยู่ระหว่างทดลอง

## เตรียมเครื่องเพื่อน

1. เจ้าของ tailnet เชิญเพื่อนเป็น Member ผ่านหน้า Users ของ Tailscale Admin Console
2. เพื่อนรับคำเชิญ ติดตั้ง Tailscale และล็อกอินด้วยบัญชีของตนเอง
3. เพื่อนเปิด URL `https://<ชื่อเครื่อง>.<ชื่อ-tailnet>.ts.net/pages/login.html` ที่ `tailscale serve 3000` แสดง
4. ทดลองสมัครหรือล็อกอิน แล้วตรวจว่า API ตอบผ่าน URL เดียวกัน เช่น `https://<ชื่อเครื่อง>.<ชื่อ-tailnet>.ts.net/api/health/db`

หน้าเว็บเรียก API ด้วย path `/api` จึงใช้ origin ของหน้าเว็บเอง ทั้งตอนเปิดผ่าน `localhost` และ URL HTTPS ของ Tailscale ไม่มี URL หรือ IP ของเครื่องเจ้าของเว็บฝังใน JavaScript

เมื่อ `COOKIE_SECURE=true` ให้ทดสอบ login ผ่าน URL HTTPS ของ Tailscale ถ้าต้องกลับมาทดสอบผ่าน HTTP localhost ให้ตั้ง `COOKIE_SECURE=false` และเริ่ม Node.js ใหม่

Tailscale Serve เปิดให้เฉพาะอุปกรณ์ที่มีสิทธิ์ใน tailnet เข้าถึง ไม่ใช่ URL สาธารณะบนอินเทอร์เน็ต

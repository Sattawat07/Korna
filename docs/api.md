# Korna API

สัญญา API สำหรับเว็บให้ฟรีและแลกของมือสอง เอกสารนี้กำหนด URL, สิทธิ์, request, response และสถานะข้อมูล เพื่อให้ frontend และ backend ใช้อ้างอิงร่วมกัน

## วิธีอ่านเอกสาร

1. อ่าน [ข้อตกลงร่วม](#ข้อตกลงร่วม) สำหรับ cookie, รูปแบบข้อมูล และ error
2. ดู [ภาพรวม API](#ภาพรวม-api) เพื่อหา endpoint ตามหน้าจอ
3. อ่านรายละเอียดในหัวข้อของ endpoint นั้นก่อนลงมือเชื่อมต่อ

## ข้อตกลงร่วม

- ตัวอย่าง Base URL: `http://127.0.0.1:3000` (frontend และ API ใช้ origin เดียวกัน)
- ทุก endpoint เริ่มด้วย `/api` ยกเว้น URL รูปที่เริ่มด้วย `/uploads/`
- JSON ใช้ `snake_case` และส่ง `Content-Type: application/json` ยกเว้น endpoint ที่ระบุ `multipart/form-data`
- วันที่เป็น ISO 8601 เช่น `2026-10-18T10:00:00.000Z`; ID เป็นตัวเลข
- หลังล็อกอิน browser รับ session cookie `sid` แบบ `HttpOnly`, `SameSite=Lax`; frontend เรียก API ด้วย URL ที่ขึ้นต้น `/api` โดย browser ส่ง cookie ให้เอง
- endpoint ที่ต้องล็อกอินแต่ไม่มี session ที่ใช้ได้ตอบ `401 UNAUTHENTICATED`; สิทธิ์ไม่พอตอบ `403 FORBIDDEN`
- บัญชีใหม่มี role `user` เสมอ; `admin` กำหนดโดยผู้ดูแลระบบเท่านั้น ไม่รับ role จากแบบฟอร์มสมัคร
- OTP สมัครสมาชิกส่งทางอีเมล อายุ 5 นาที ใช้ครั้งเดียว และเก็บข้อมูลที่รอยืนยันในหน่วยความจำของ Node.js; browser ถือ cookie `signup_challenge` เพื่ออ้างถึงรายการที่รอยืนยัน ไม่ใช่ cookie ล็อกอิน
- รูปอยู่ใน `images` เรียงตามลำดับที่อัปโหลด; `image_url` คือรูปแรกสำหรับการ์ด ถ้าไม่มีรูปให้ใช้ placeholder ของหน้าเว็บ
- คำใน UI `Exchanged` หมายถึง `items.status=completed`; ระบบยังใช้ role เพียง `user` และ `admin`

### รูปแบบ error

ทุก endpoint ยกเว้น health checks ใช้ error รูปแบบเดียวกัน:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted fields.",
    "details": { "email": "Invalid email address" }
  }
}
```

| HTTP | ใช้เมื่อ | ตัวอย่าง `code` |
| --- | --- | --- |
| 400 | ข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง | `VALIDATION_ERROR` |
| 401 | ไม่ได้ล็อกอิน, session หมดอายุ, หรืออีเมล/รหัสผ่านไม่ตรง | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | ไม่มีสิทธิ์หรือไม่ใช่เจ้าของรายการ | `FORBIDDEN` |
| 404 | ไม่พบข้อมูล หรือข้อมูลถูกซ่อนจากผู้เรียก | `NOT_FOUND` |
| 409 | ข้อมูลซ้ำหรือสถานะไม่อนุญาตให้ทำรายการ | `CONFLICT`, `INVALID_STATE` |
| 410 | OTP หมดอายุหรือรายการสมัครที่รอยืนยันไม่อยู่แล้ว | `OTP_EXPIRED` |
| 413 | ไฟล์ใหญ่เกินกำหนด | `FILE_TOO_LARGE` |
| 415 | ชนิดไฟล์ไม่รองรับ | `UNSUPPORTED_MEDIA_TYPE` |
| 429 | กรอก OTP ผิด เริ่มสมัครซ้ำ หรือขอส่งใหม่บ่อยเกินกำหนด | `TOO_MANY_ATTEMPTS` |
| 500 | ระบบขัดข้อง | `INTERNAL_ERROR` |
| 502 | ส่งอีเมล OTP ไม่สำเร็จ | `EMAIL_DELIVERY_FAILED` |
| 503 | ติดต่อฐานข้อมูลไม่ได้ชั่วคราว | `DATABASE_UNAVAILABLE` |

`details` ใส่เมื่อเป็นข้อผิดพลาดรายฟิลด์; กรณีอื่นละได้

## ภาพรวม API

### ตรวจระบบและบัญชี

| Method | Path | ใช้ในส่วน | สิทธิ์ |
| --- | --- | --- | --- |
| GET | `/api/health` | ตรวจ Node.js | ไม่ต้อง |
| GET | `/api/health/db` | ตรวจ PostgreSQL | ไม่ต้อง |
| POST | `/api/auth/register` | สมัครสมาชิก: ส่ง OTP | ไม่ต้อง |
| POST | `/api/auth/register/verify` | สมัครสมาชิก: ยืนยัน OTP | `signup_challenge` |
| POST | `/api/auth/register/resend` | สมัครสมาชิก: ส่ง OTP ใหม่ | `signup_challenge` |
| POST | `/api/auth/login` | เข้าสู่ระบบ | ไม่ต้อง |
| POST | `/api/auth/logout` | ออกจากระบบ | ผู้ใช้ |
| POST | `/api/auth/forgot-password/request` | ลืมรหัสผ่าน: ส่ง OTP | ไม่ต้อง |
| POST | `/api/auth/forgot-password/verify` | ลืมรหัสผ่าน: ยืนยัน OTP | `reset_challenge` |
| POST | `/api/auth/forgot-password/reset` | ลืมรหัสผ่าน: ตั้งรหัสใหม่ | `reset_token` |

### หน้าโปรไฟล์และการแจ้งเตือน

| Method | Path | ใช้ในส่วน | สิทธิ์ |
| --- | --- | --- | --- |
| GET | `/api/me` | ข้อมูลบัญชีของฉัน | ผู้ใช้ |
| PATCH | `/api/me` | แก้ข้อมูลบัญชี | ผู้ใช้ |
| GET | `/api/me/items` | โปรไฟล์: โพสต์ของฉัน | ผู้ใช้ |
| GET | `/api/requests?role=sent` | โปรไฟล์: Activity หรือโพสต์ที่ฉันส่งคำขอ | ผู้ใช้ |
| GET | `/api/requests?role=received&item_id=:id` | โพสต์ของฉัน: คนที่ส่งคำขอมา | เจ้าของโพสต์ |
| GET | `/api/notifications` | รายการแจ้งเตือน | ผู้ใช้ |
| PATCH | `/api/notifications/:id/read` | อ่านแจ้งเตือนแล้ว | เจ้าของการแจ้งเตือน |

### ฟีด โพสต์ และคำขอ

| Method | Path | ใช้ในส่วน | สิทธิ์ |
| --- | --- | --- | --- |
| GET | `/api/categories` | ตัวเลือกหมวดหมู่ | ไม่ต้อง |
| GET | `/api/items` | ฟีด: ดู ค้นหา กรอง เรียง และแบ่งหน้า | ไม่ต้อง |
| GET | `/api/items/:id` | รายละเอียดโพสต์ | ไม่ต้อง |
| POST | `/api/items` | สร้างโพสต์พร้อมรูป | ผู้ใช้ |
| PATCH | `/api/items/:id` | แก้โพสต์ | เจ้าของโพสต์ |
| DELETE | `/api/items/:id` | ซ่อนโพสต์ | เจ้าของโพสต์ |
| POST | `/api/items/:id/requests` | ขอรับฟรีหรือเสนอแลก | ผู้ใช้ |
| GET | `/api/requests?role=received` | คำขอที่ได้รับทั้งหมด | ผู้ใช้ |
| PATCH | `/api/requests/:id/decision` | อนุมัติหรือปฏิเสธคำขอ | เจ้าของโพสต์ |

`GET /api/requests` เป็น route เดียว โดยเลือก `role=sent` หรือ `role=received`; `item_id` ใช้กรองคำขอที่ได้รับให้เหลือเฉพาะโพสต์หนึ่งรายการ

### ผู้ดูแลระบบ

| Method | Path | ใช้ในส่วน | สิทธิ์ |
| --- | --- | --- | --- |
| GET | `/api/admin/stats` | Dashboard และกราฟ | admin |
| GET | `/api/admin/items` | รายการโพสต์และค้นหา | admin |
| GET | `/api/admin/users` | รายชื่อสมาชิกและค้นหา | admin |
| DELETE | `/api/admin/items/:id` | ซ่อนโพสต์ | admin |
| PATCH | `/api/admin/users/:id/role` | มอบสิทธิ์ admin | admin |

กรณี `เจ้าของ` API ตรวจ user ID จาก session ว่าตรงกับเจ้าของโพสต์; API admin ตรวจ role ปัจจุบันของผู้ใช้จากฐานข้อมูล

ทุก route ที่ต้องล็อกอินตรวจ session ก่อนทำงาน ส่วน route ผู้ดูแลระบบตรวจ role `admin` เพิ่ม โดยใช้ role ปัจจุบันจากฐานข้อมูล

## Health checks

`GET /api/health` → `200 {"status":"ok"}`

`GET /api/health/db` → `200 {"database":"connected"}` หรือ `503 {"database":"unavailable"}`

## บัญชีผู้ใช้

### POST /api/auth/register

ส่ง JSON:

```json
{
  "name": "Nina",
  "email": "nina@example.com",
  "password": "example-password",
  "room_number": "A-304",
  "phone_number": "0812345678"
}
```

`name`, `email`, `password`, `room_number` จำเป็น; `phone_number` ไม่จำเป็น ชื่อ/เลขห้องไม่ตรวจเทียบทะเบียนหอ อีเมลจะ trim และแปลงเป็นตัวเล็กก่อนบันทึก รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร

หน้า Sign up สามารถมีช่องชื่อและนามสกุลแยกกันได้ แต่ frontend รวมเป็น `name` ก่อนเรียก API ตามที่ตกลงกัน

ตอบ `202` พร้อม `Set-Cookie: signup_challenge=...; HttpOnly; SameSite=Lax; Max-Age=300`:

```json
{ "message": "Verification code sent", "expires_in_seconds": 300 }
```

ระบบส่ง OTP 6 หลักไปยังอีเมล เก็บข้อมูลสมัครที่รอยืนยัน, password hash, OTP, เวลาหมดอายุ และจำนวนครั้งที่กรอกผิดไว้ใน `Map` ฝั่ง Node.js ยังไม่สร้างบัญชีและยังไม่สร้าง login session ณ ขั้นนี้ ถ้าส่งอีเมลไม่สำเร็จ ตอบ `502 EMAIL_DELIVERY_FAILED` โดยไม่ค้างรายการสมัคร

เริ่มสมัครได้ไม่เกิน 1 ครั้งต่ออีเมลใน 60 วินาที และไม่เกิน 10 ครั้งต่อ IP ใน 5 นาที ถ้าเกินตอบ `429 TOO_MANY_ATTEMPTS` พร้อม `Retry-After` เป็นวินาที นับคำขอที่ข้อมูลถูกต้องก่อนตรวจฐานข้อมูลหรือส่งเมล รายการจำกัดคำขอและ challenge เก็บในหน่วยความจำของแต่ละ process และลบรายการหมดอายุทุก 60 วินาที; การรีสตาร์ตจะรีเซ็ตข้อมูลเหล่านี้

### POST /api/auth/register/verify

browser ส่ง cookie `signup_challenge` พร้อม JSON `{"otp":"123456"}` OTP ใช้ได้ 5 นาทีและกรอกผิดได้สูงสุด 5 ครั้ง ถ้าถูกต้องให้ตรวจอีเมลซ้ำอีกครั้ง สร้างบัญชีใน `users` ด้วย role `user` ลบรายการสมัครที่รอยืนยัน และล้าง cookie `signup_challenge` ตอบ `201`:

```json
{
  "user": {
    "id": 1,
    "name": "Nina",
    "email": "nina@example.com",
    "role": "user",
    "room_number": "A-304",
    "phone_number": "0812345678",
    "created_at": "2026-10-18T10:00:00.000Z"
  }
}
```

อีเมลซ้ำตอบ `409 CONFLICT` รหัส OTP ผิดตอบ `400 INVALID_OTP` หมดอายุหรือหา challenge ไม่พบตอบ `410 OTP_EXPIRED` กรอกผิดครบ 5 ครั้งตอบ `429 TOO_MANY_ATTEMPTS` หลังยืนยันสำเร็จให้เรียก `/api/auth/login` รหัสผ่านผ่าน Argon2id พร้อม salt สุ่มเฉพาะบัญชี เก็บ hash และ salt ในฐานข้อมูล ไม่ส่งค่าเหล่านี้กลับใน response และไม่รับ `role` จากผู้สมัคร

### POST /api/auth/register/resend

browser ส่ง cookie `signup_challenge` โดยไม่ต้องส่ง body ขอส่งใหม่ได้หลังจากส่งครั้งก่อนอย่างน้อย 60 วินาที ระบบสร้าง OTP ใหม่ อายุ 5 นาที รหัสเก่าใช้ไม่ได้ และตอบ `202 {"message":"Verification code sent","expires_in_seconds":300}` ถ้าขอเร็วเกินไปตอบ `429 TOO_MANY_ATTEMPTS` ถ้า challenge หมดอายุต้องเริ่มสมัครใหม่

### POST /api/auth/login

ส่ง `{"email":"nina@example.com","password":"example-password","remember_me":false}` โดย `remember_me` ไม่จำเป็นและค่าเริ่มต้นเป็น `false` ตอบ `200 {"user": { ... }}` พร้อม `Set-Cookie: sid=...` โดย `user` มีฟิลด์เหมือน response การสมัคร; ไม่มี token ใน JSON ถ้าอีเมลหรือรหัสผิดตอบ `401 INVALID_CREDENTIALS` โดยไม่บอกว่าส่วนใดผิด

ถ้า `remember_me=false` cookie เป็น session cookie ที่หมดอายุเมื่อปิด browser; session ฝั่ง PostgreSQL มีอายุสูงสุด 8 ชั่วโมง ถ้า `remember_me=true` cookie และ session ฝั่ง PostgreSQL มีอายุ 30 วัน Logout ลบ session ได้ทั้งสองกรณี

### POST /api/auth/logout

ทำลาย session ในฐานข้อมูลและล้าง cookie `sid`; ตอบ `204` โดยไม่มี body

### ลืมรหัสผ่าน

`POST /api/auth/forgot-password/request` รับ `{"email":"nina@example.com"}` ส่ง OTP 6 หลักทางอีเมลอายุ 5 นาทีและตั้ง cookie `reset_challenge` แบบ `HttpOnly`, `SameSite=Lax` หากรูปแบบอีเมลถูกต้องตอบ `202 {"message":"If this account exists, a verification code has been sent."}` เหมือนกันทั้งกรณีพบและไม่พบบัญชี เพื่อไม่เปิดเผยว่าอีเมลใดสมัครไว้ จำกัดการขอซ้ำตามอีเมลและ IP

`POST /api/auth/forgot-password/verify` รับ `{"otp":"123456"}` พร้อม cookie `reset_challenge` ตรวจรหัสได้ไม่เกิน 5 ครั้ง ถ้าถูกต้องให้ทำลาย challenge แล้วตั้ง cookie `reset_token` แบบใช้ครั้งเดียว อายุ 5 นาที ตอบ `204` โดยไม่มี body รหัสผิดตอบ `400 INVALID_OTP`; หมดอายุตอบ `410 OTP_EXPIRED`

`POST /api/auth/forgot-password/reset` รับ `{"new_password":"new-example-password"}` พร้อม cookie `reset_token` แฮชรหัสใหม่ด้วย Argon2id และ salt ใหม่ อัปเดต `password_hash`/`password_salt` ลบ session ของผู้ใช้นี้ทั้งหมด แล้วล้าง cookie `reset_token` ตอบ `204` โดยไม่มี body ถ้า token ไม่มี หมดอายุ หรือใช้แล้ว ตอบ `410 RESET_EXPIRED` หลังเปลี่ยนรหัสผ่านให้ล็อกอินใหม่

### GET /api/me

ใช้ session cookie แล้วตอบ `200 {"user": { ... }, "stats": {"my_items_count":6,"requests_sent_count":3,"completed_items_count":2}}` โดย `user` มีฟิลด์เหมือนตัวอย่างข้างบน ผู้ใช้เห็น email, room_number และ phone_number ของตัวเอง `my_items_count` นับโพสต์ของตนที่ยังไม่ `removed`; `requests_sent_count` นับคำขอที่ตนส่งทุกสถานะ; `completed_items_count` นับโพสต์ของตนที่ `completed`

### PATCH /api/me

ส่ง JSON เฉพาะฟิลด์ที่ต้องการแก้จาก `name`, `room_number`, `phone_number` อนุญาตให้ `phone_number:null` เพื่อลบเบอร์ ตอบ `200 {"user":{ ... }}` พร้อมข้อมูลล่าสุด ใช้ข้อจำกัดความยาวเดียวกับการสมัคร ไม่แก้อีเมล รหัสผ่าน หรือ role ผ่าน endpoint นี้

## หมวดหมู่

### GET /api/categories

ตอบ `200`:

```json
{
  "categories": [
    { "id": 1, "name": "Books & Documents" },
    { "id": 2, "name": "Study Supplies" }
  ]
}
```

ID ในตัวอย่างเป็นเพียงตัวอย่าง ให้ frontend ใช้ ID จริงที่ API ส่งมา

## โพสต์

### รูปแบบ `item`

```json
{
  "id": 12,
  "title": "Desk lamp",
  "description": "Still works well",
  "defects": "Small scratch",
  "type": "swap",
  "status": "available",
  "category": { "id": 4, "name": "Electronics" },
  "image_url": "/uploads/items/abc.webp",
  "images": [
    { "id": 101, "url": "/uploads/items/abc.webp", "position": 0 },
    { "id": 102, "url": "/uploads/items/def.webp", "position": 1 }
  ],
  "owner": { "id": 1, "name": "Nina" },
  "swap_details": {
    "desired_category": { "id": 1, "name": "Books & Documents" },
    "desired_description": "Looking for a novel"
  },
  "created_at": "2026-10-18T10:00:00.000Z"
}
```

`type` เป็น `free` หรือ `swap`; `status` เป็น `available`, `pending`, `completed`, `removed` ถ้า `type=free`, `swap_details` เป็น `null` รูปไม่มีก็ส่ง `image_url: null` และ `images: []` ข้อมูลเจ้าของที่แสดงสาธารณะมีเพียง `id` กับ `name`

### GET /api/items

Query string ทุกตัวไม่จำเป็น:

| ชื่อ | ค่า | ใช้ทำอะไร |
| --- | --- | --- |
| `q` | ข้อความ | ค้นในชื่อและรายละเอียดโพสต์ |
| `category_id` | ID หมวดหมู่ | กรองหมวดหมู่ |
| `type` | `free` หรือ `swap` | กรองประเภทโพสต์ |
| `sort` | `newest` หรือ `oldest` | เรียงตามเวลาสร้างโพสต์; ค่าเริ่มต้น `newest` |
| `from` | `YYYY-MM-DD` | เริ่มช่วงวันที่สร้างโพสต์ |
| `to` | `YYYY-MM-DD` | สิ้นสุดช่วงวันที่สร้างโพสต์ |
| `page` | เลขหน้าตั้งแต่ 1 | แบ่งหน้า; ค่าเริ่มต้น 1 |
| `limit` | จำนวนไม่เกิน 50 | จำนวนต่อหน้า; ค่าเริ่มต้น 12 |

ตัวกรองใช้ร่วมกันได้ เช่น ค้นคำว่า lamp ในโพสต์ swap ของช่วงวันที่กำหนด `sort` เรียงจาก `item_created_at` และใช้ `item_id` ตัดสินลำดับเมื่อเวลาเท่ากัน `from`/`to` อิงวันที่ตามเวลาไทยและรวมวันที่ต้นกับปลายช่วง ถ้า `from` มากกว่า `to` หรือรูปแบบวันผิด ตอบ `400 VALIDATION_ERROR` ฟีดแสดงเฉพาะ `available` และ `pending`; `removed` ไม่แสดง

ตัวเลือก “วันนี้”, “7 วันที่ผ่านมา” หรือ “เดือนนี้” ใน frontend แปลงเป็น `from`/`to` ก่อนเรียก API จึงไม่ต้องมี endpoint แยก

ตัวอย่าง `GET /api/items?q=lamp&type=swap&page=1&limit=12` ตอบ `200`:

```json
{
  "items": [ { "id": 12, "title": "Desk lamp", "type": "swap", "status": "available", "category": { "id": 4, "name": "Electronics" }, "image_url": "/uploads/items/abc.webp", "images": [{ "id": 101, "url": "/uploads/items/abc.webp", "position": 0 }], "owner": { "id": 1, "name": "Nina" }, "created_at": "2026-10-18T10:00:00.000Z" } ],
  "pagination": { "page": 1, "limit": 12, "total": 1, "total_pages": 1 }
}
```

### GET /api/items/:id

ตอบ `200 {"item": { ... }}` โดย `item` ใช้รูปแบบเต็มข้างบน ID ที่ไม่มีหรือ `removed` ตอบ `404 NOT_FOUND` โพสต์ `completed` ยังเปิดด้วย URL ตรงได้ แต่ไม่ขึ้นฟีด ถ้าเจ้าของเปิดโพสต์ของตนจาก Profile ให้เรียก `GET /api/requests?role=received&item_id=<id>` เพิ่มเพื่อแสดงคนที่ส่งคำขอให้โพสต์นี้

### GET /api/me/items

ตอบ `200 {"items": [ ... ]}` เป็นโพสต์ทุกสถานะของผู้ใช้จาก session เรียงใหม่ไปเก่า ใช้รูปแบบ `item` เดียวกัน แต่ละโพสต์เพิ่ม `requests_count` ซึ่งนับคำขอของโพสต์นั้นทุกสถานะ เพื่อแสดงจำนวนคนที่ส่งคำขอจากหน้า Profile

### POST /api/items

ส่ง `multipart/form-data` (ไม่ตั้ง `Content-Type` เองเมื่อใช้ `FormData` ใน browser):

| Field | จำเป็น | รายละเอียด |
| --- | --- | --- |
| `title` | ใช่ | ชื่อโพสต์ สูงสุด 200 ตัวอักษร |
| `category_id` | ใช่ | ID จาก `/api/categories` |
| `type` | ใช่ | `free` หรือ `swap` |
| `description` | ไม่ | รายละเอียด |
| `defects` | ไม่ | ตำหนิ/สภาพ |
| `images` | ไม่ | ส่งไฟล์ซ้ำใน field `images` ได้สูงสุด 5 รูป; JPG, PNG หรือ WebP ไม่เกิน 5 MB ต่อรูป |
| `desired_category_id` | ไม่ | ใช้เฉพาะ `swap` |
| `desired_description` | เฉพาะ `swap` | สิ่งที่อยากได้เพื่อแลก |

API ตั้ง `status=available` เองและตอบ `201 {"item": { ... }}` แบบเต็ม `images` เรียงตามลำดับไฟล์ที่ส่งมา และ `image_url` เป็นรูปแรก

### PATCH /api/items/:id

เจ้าของส่ง JSON เพื่อแก้เฉพาะ `title`, `category_id`, `description`, `defects`, `desired_category_id`, `desired_description` ส่งเฉพาะฟิลด์ที่ต้องการเปลี่ยน แก้ได้เมื่อ `status=available` เท่านั้น และยังไม่รองรับการเปลี่ยนรูปหรือ `type` ตอบ `200 {"item": { ... }}`; คนอื่นแก้ตอบ `403`, สถานะไม่อนุญาตตอบ `409 INVALID_STATE`

### DELETE /api/items/:id

เจ้าของซ่อนโพสต์ได้เมื่อ `status=available` เท่านั้น โดยเปลี่ยนเป็น `removed` และตอบ `200 {"item": { ... }}`; โพสต์ `pending` หรือ `completed` ตอบ `409 INVALID_STATE`

## คำขอรับฟรีและข้อเสนอแลก

### รูปแบบ `request`

```json
{
  "id": 31,
  "item": { "id": 12, "title": "Desk lamp", "type": "swap", "status": "pending", "image_url": "/uploads/items/abc.webp" },
  "requester": { "id": 2, "name": "Ton" },
  "message": "Interested in exchanging",
  "status": "pending",
  "swap_offer": {
    "description": "A novel in good condition",
    "image_url": "/uploads/offers/xyz.webp",
    "images": [{ "id": 201, "url": "/uploads/offers/xyz.webp", "position": 0 }]
  },
  "created_at": "2026-10-18T11:00:00.000Z"
}
```

ถ้าเป็นคำขอรับของฟรี `swap_offer` เป็น `null` แสดงคำขอเฉพาะผู้ส่งคำขอและเจ้าของโพสต์เท่านั้น ในหน้า Profile แท็บ Activity ใช้คำขอที่ตัวเองส่ง ส่วนหน้าโพสต์ของตัวเองใช้คำขอที่ได้รับ

### POST /api/items/:id/requests

ส่ง session cookie และ `multipart/form-data` โดยใช้ข้อมูลตามชนิดโพสต์:

| Field | `free` | `swap` |
| --- | --- | --- |
| `message` | ไม่จำเป็น | ไม่จำเป็น |
| `offer_description` | ไม่ใช้ | จำเป็น |
| `offer_images` | ไม่ใช้ | ไม่จำเป็น; ส่งไฟล์ซ้ำใน field `offer_images` ได้สูงสุด 5 รูป JPG/PNG/WebP ไม่เกิน 5 MB ต่อรูป |

ตอบ `201 {"request": { ... }}` คำขอและโพสต์เปลี่ยนเป็น `pending` พร้อมสร้างการแจ้งเตือน `request_received` ให้เจ้าของโพสต์ โพสต์ที่ `pending` **ยังรับคำขอจากคนอื่นได้** แต่ผู้ใช้หนึ่งคนส่งได้เพียงหนึ่งคำขอต่อโพสต์ (`409 CONFLICT` หากซ้ำ) ห้ามขอโพสต์ของตัวเอง และห้ามขอโพสต์ `completed` หรือ `removed`

### GET /api/requests?role=sent|received

`role` จำเป็นและเป็น `sent` หรือ `received` ตอบ `200 {"requests": [ ... ]}` โดยใช้รูปแบบ `request` ข้างบน เรียงใหม่ไปเก่า `sent` คือคำขอที่ตัวเองส่ง `received` คือคำขอของโพสต์ที่ตัวเองเป็นเจ้าของ ถ้า `role=received` ส่ง `item_id` เพื่อดูเฉพาะคนที่ส่งคำขอให้โพสต์ของตน เช่น `GET /api/requests?role=received&item_id=12`; ถ้าไม่ใช่เจ้าของโพสต์ตอบ `403 FORBIDDEN`

### PATCH /api/requests/:id/decision

เจ้าของโพสต์ส่ง JSON `{"decision":"accepted"}` หรือ `{"decision":"rejected"}` และคำขอต้องยังเป็น `pending` ตอบ `200 {"request": { ... }}`

- `accepted`: คำขอนี้เป็น `accepted`, คำขอ `pending` อื่นของโพสต์เป็น `rejected`, และโพสต์เป็น `completed` อนุมัติได้เพียงหนึ่งคน
- `rejected`: เปลี่ยนคำขอนี้เป็น `rejected`; ถ้าไม่มีคำขอ `pending` เหลือ ให้โพสต์กลับ `available` ถ้ายังมี ให้โพสต์คง `pending`
- การตัดสินใจซ้ำหรือโพสต์ `completed` ตอบ `409 INVALID_STATE`; ผู้ที่ไม่ใช่เจ้าของโพสต์ตอบ `403 FORBIDDEN`

เมื่อตัดสินใจคำขอ ระบบสร้างการแจ้งเตือน `request_decided` ให้ผู้ส่งคำขอนั้น หากการรับคำขอหนึ่งทำให้คำขออื่นถูกปฏิเสธอัตโนมัติ ให้แจ้งผู้ส่งคำขอเหล่านั้นด้วย

## การแจ้งเตือน

การแจ้งเตือนในแอปเกิดจากสองเหตุการณ์: `request_received` เมื่อมีคนส่งคำขอให้โพสต์ของตน และ `request_decided` เมื่อคำขอที่ตนส่งถูกอนุมัติหรือปฏิเสธ ข้อมูลต้องผูกกับ `item_id` และ `request_id` เพื่อเปิดหน้าที่เกี่ยวข้อง ไม่มีการส่งอีเมลแจ้งเตือนใน flow นี้

### GET /api/notifications

รับ `page` (เริ่ม 1) และ `limit` (ค่าเริ่มต้น 20 มากสุด 50) ตอบ `200` เรียงใหม่ไปเก่า:

```json
{
  "notifications": [
    { "id": 41, "type": "request_received", "item_id": 12, "request_id": 31, "actor": { "id": 2, "name": "Ton" }, "read_at": null, "created_at": "2026-10-18T11:00:00.000Z" }
  ],
  "unread_count": 1,
  "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

สำหรับ `request_decided` เพิ่ม `decision: "accepted"|"rejected"` ในรายการ การเรียกดูไม่เปลี่ยนสถานะอ่าน

### PATCH /api/notifications/:id/read

ทำเครื่องหมายว่าอ่านแล้ว ตอบ `200 {"notification":{ ... }}` การแจ้งเตือนของผู้อื่นหรือ ID ที่ไม่มีตอบ `404 NOT_FOUND`

## ผู้ดูแลระบบ

ทุก endpoint ในส่วนนี้ต้องมี login session และ role `admin` ถ้าไม่มี session ตอบ `401 UNAUTHENTICATED`; ถ้า role ไม่ใช่ `admin` ตอบ `403 FORBIDDEN` admin คนแรกตั้ง role ในฐานข้อมูลหลังสมัครและยืนยันอีเมลเรียบร้อยแล้ว

### GET /api/admin/stats

ตอบ `200` โดยนับจากตาราง `items` ทั้งหมด รวมโพสต์ `removed` ใน `total` และแยกจำนวนที่ยังไม่ถูกลบใน `active` สถิติคำขอและกราฟ 7 วันใช้ `request_created_at` เป็นวันที่จัดกลุ่ม ไม่ใช่วันที่เจ้าของตัดสินใจ:

```json
{
  "total": 12,
  "active": 10,
  "removed": 2,
  "total_users": 8,
  "total_requests": 6,
  "by_status": { "available": 4, "pending": 3, "completed": 3, "removed": 2 },
  "requests_by_status": { "pending": 2, "accepted": 3, "rejected": 1 },
  "by_type": { "free": 7, "swap": 5 },
  "by_category": [
    { "id": 1, "name": "Books & Documents", "total": 4 },
    { "id": 4, "name": "Electronics", "total": 8 }
  ],
  "requests_last_7_days": [
    { "date": "2026-10-18", "pending": 1, "accepted": 2, "rejected": 0 }
  ],
  "recent_requests": [
    { "id": 31, "item_id": 12, "status": "pending", "created_at": "2026-10-18T11:00:00.000Z" }
  ]
}
```

ผลรวม `by_type`, `by_category` และ `by_status` รวมโพสต์ `removed` เช่นเดียวกับ `total`; `requests_last_7_days` ส่งครบ 7 วันที่ตามเวลาประเทศไทย โดยใส่ 0 ในวันที่ไม่มีคำขอ ค่า status ในแต่ละวันคือ **สถานะปัจจุบันของคำขอที่สร้างวันนั้น** ไม่ใช่จำนวนการอนุมัติที่เกิดในวันนั้น UI แสดง `accepted` เป็น “Completed” และ `rejected` เป็น “Cancelled”; ไม่มีสถานะผู้ส่งยกเลิกคำขอเอง

### GET /api/admin/items

ดูโพสต์ทุกสถานะ เรียงใหม่ไปเก่า รองรับ `q` ค้นในชื่อโพสต์หรือชื่อเจ้าของ, `owner_id`, `status=available|pending|completed|removed`, `type=free|swap`, `category_id`, `page` และ `limit` แบบเดียวกับ `/api/items`; ตอบ `200 {"items":[ ... ],"pagination":{ ... }}` โดยใช้รูปแบบ `item` เดิม คำบน UI `Exchanged` ใช้ `status=completed`

### GET /api/admin/users

รับ `q` ค้นชื่อหรืออีเมล, `page` (เริ่ม 1) และ `limit` (ค่าเริ่มต้น 20 มากสุด 50) ตอบ `200`:

```json
{
  "users": [
    { "id": 1, "name": "Nina", "email": "nina@example.com", "role": "user", "room_number": "A-304", "phone_number": "0812345678", "created_at": "2026-10-18T10:00:00.000Z", "items_count": 3 }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
}
```

`items_count` นับโพสต์ที่ยังไม่ `removed`; เมื่อเลือกสมาชิก ใช้ `GET /api/admin/items?owner_id=<id>` แสดงโพสต์ของคนนั้น ไม่มี role `super_admin` ในระบบ

### DELETE /api/admin/items/:id

เปลี่ยน `item_status` เป็น `removed` โดยไม่ลบแถว รูป หรือข้อมูลคำขอ ตอบ `200 {"item":{ ... }}` โพสต์ที่ไม่มีตอบ `404 NOT_FOUND`; โพสต์ที่ `removed` แล้วตอบ `409 INVALID_STATE` ข้อความยืนยันใน UI ควรสื่อว่าโพสต์จะถูกซ่อนจากชุมชน ไม่ใช่ลบข้อมูลถาวร

### PATCH /api/admin/users/:id/role

ส่ง JSON `{"role":"admin"}` เพื่อมอบสิทธิ์ให้บัญชีที่มีอยู่ ตอบ `200 {"user":{ ... }}` โดยไม่ส่ง password hash หรือ salt กลับ ผู้ใช้ที่ไม่มีตอบ `404 NOT_FOUND`; role อื่นหรือการลดสิทธิ์ยังไม่อยู่ในสัญญานี้

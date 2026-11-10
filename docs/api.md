# Korna API

รูปแบบ API สำหรับเว็บให้ฟรีและแลกของมือสอง ใช้เอกสารนี้เป็นข้อตกลงเรื่อง URL, request, response และสถานะของข้อมูล

## ข้อตกลงร่วม

- ตัวอย่าง Base URL: `http://127.0.0.1:3000` (frontend และ API ใช้ origin เดียวกัน)
- ทุก endpoint เริ่มด้วย `/api` ยกเว้น URL รูปที่เริ่มด้วย `/uploads/`
- JSON ใช้ `snake_case` และส่ง `Content-Type: application/json` ยกเว้น endpoint ที่ระบุ `multipart/form-data`
- วันที่เป็น ISO 8601 เช่น `2026-10-18T10:00:00.000Z`; ID เป็นตัวเลข
- หลังล็อกอิน browser รับ session cookie `sid` แบบ `HttpOnly`, `SameSite=Lax`; frontend เรียก API ด้วย URL ที่ขึ้นต้น `/api` โดย browser ส่ง cookie ให้เอง
- endpoint ที่ต้องล็อกอินแต่ไม่มี session ที่ใช้ได้ตอบ `401 UNAUTHENTICATED`; สิทธิ์ไม่พอตอบ `403 FORBIDDEN`
- บัญชีใหม่มี role `user` เสมอ; `admin` กำหนดโดยผู้ดูแลระบบเท่านั้น ไม่รับ role จากแบบฟอร์มสมัคร
- OTP สมัครสมาชิกส่งทางอีเมล อายุ 5 นาที ใช้ครั้งเดียว และเก็บข้อมูลที่รอยืนยันในหน่วยความจำของ Node.js; browser ถือ cookie `signup_challenge` เพื่ออ้างถึงรายการที่รอยืนยัน ไม่ใช่ cookie ล็อกอิน
- เมื่อได้ `image_url: "/uploads/items/abc.webp"` ให้แสดงรูปด้วย path นี้; ถ้าเป็น `null` ให้ใช้รูป placeholder ของหน้าเว็บ

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
| 429 | กรอก OTP ผิดหรือขอส่งใหม่บ่อยเกินกำหนด | `TOO_MANY_ATTEMPTS` |
| 413 | ไฟล์ใหญ่เกินกำหนด | `FILE_TOO_LARGE` |
| 415 | ชนิดไฟล์ไม่รองรับ | `UNSUPPORTED_MEDIA_TYPE` |
| 500 | ระบบขัดข้อง | `INTERNAL_ERROR` |
| 502 | ส่งอีเมล OTP ไม่สำเร็จ | `EMAIL_DELIVERY_FAILED` |
| 503 | ติดต่อฐานข้อมูลไม่ได้ชั่วคราว | `DATABASE_UNAVAILABLE` |

`details` ใส่เมื่อเป็นข้อผิดพลาดรายฟิลด์; กรณีอื่นละได้

## Endpoint ทั้งหมด

| Method | Path | สิทธิ์ | หน้าที่ |
| --- | --- | --- | --- |
| GET | `/api/health` | ไม่ต้อง | ตรวจว่า Node.js ทำงาน |
| GET | `/api/health/db` | ไม่ต้อง | ตรวจ PostgreSQL |
| POST | `/api/auth/register` | ไม่ต้อง | ส่งข้อมูลสมัครและขอ OTP ทางอีเมล |
| POST | `/api/auth/register/verify` | มี `signup_challenge` | ยืนยัน OTP และสร้างบัญชี |
| POST | `/api/auth/register/resend` | มี `signup_challenge` | ขอ OTP ใหม่ |
| POST | `/api/auth/login` | ไม่ต้อง | ล็อกอิน |
| POST | `/api/auth/logout` | ผู้ใช้ | ออกจากระบบ |
| GET | `/api/me` | ผู้ใช้ | ดูข้อมูลบัญชีตนเอง |
| GET | `/api/me/items` | ผู้ใช้ | ดูโพสต์ของตนเอง |
| GET | `/api/categories` | ไม่ต้อง | ดูหมวดหมู่ |
| GET | `/api/items` | ไม่ต้อง | ฟีด ค้นหา กรอง และแบ่งหน้า |
| GET | `/api/items/:id` | ไม่ต้อง | ดูรายละเอียดโพสต์ |
| POST | `/api/items` | ผู้ใช้ | สร้างโพสต์พร้อมรูป |
| PATCH | `/api/items/:id` | เจ้าของ | แก้ข้อความของโพสต์ |
| DELETE | `/api/items/:id` | เจ้าของ | ซ่อนโพสต์ (เปลี่ยนสถานะเป็น `removed`) |
| POST | `/api/items/:id/requests` | ผู้ใช้ | ขอรับฟรีหรือยื่นข้อเสนอแลก |
| GET | `/api/requests?role=sent` | ผู้ใช้ | ดูคำขอที่ส่ง |
| GET | `/api/requests?role=received` | ผู้ใช้ | ดูคำขอที่ได้รับ |
| PATCH | `/api/requests/:id/decision` | เจ้าของโพสต์ | อนุมัติหรือปฏิเสธคำขอ |
| GET | `/api/admin/stats` | admin | ดูจำนวนโพสต์รวม แยก free/swap และหมวดหมู่ |
| GET | `/api/admin/items` | admin | ดูโพสต์ทุกสถานะ |
| DELETE | `/api/admin/items/:id` | admin | ซ่อนโพสต์โดยเปลี่ยนเป็น removed |
| PATCH | `/api/admin/users/:id/role` | admin | มอบสิทธิ์ admin ให้ผู้ใช้ |

กรณี `เจ้าของ` API ตรวจ user ID จาก session ว่าตรงกับเจ้าของโพสต์; API admin ตรวจ role ปัจจุบันของผู้ใช้จากฐานข้อมูล

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

ตอบ `202` พร้อม `Set-Cookie: signup_challenge=...; HttpOnly; SameSite=Lax; Max-Age=300`:

```json
{ "message": "Verification code sent", "expires_in_seconds": 300 }
```

ระบบส่ง OTP 6 หลักไปยังอีเมล เก็บข้อมูลสมัครที่รอยืนยัน, password hash, OTP, เวลาหมดอายุ และจำนวนครั้งที่กรอกผิดไว้ใน `Map` ฝั่ง Node.js ยังไม่สร้างบัญชีและยังไม่สร้าง login session ณ ขั้นนี้ ถ้าส่งอีเมลไม่สำเร็จ ตอบ `502 EMAIL_DELIVERY_FAILED` โดยไม่ค้างรายการสมัคร

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

ส่ง `{"email":"nina@example.com","password":"example-password"}` ตอบ `200 {"user": { ... }}` พร้อม `Set-Cookie: sid=...` โดย `user` มีฟิลด์เหมือน response การสมัครและ `role`; ไม่มี token ใน JSON ถ้าอีเมลหรือรหัสผิดตอบ `401 INVALID_CREDENTIALS` โดยไม่บอกว่าส่วนใดผิด

### POST /api/auth/logout

ทำลาย session ในฐานข้อมูลและล้าง cookie `sid`; ตอบ `204` โดยไม่มี body

### GET /api/me

ใช้ session cookie แล้วตอบ `200 {"user": { ... }}` โดย `user` มีฟิลด์เหมือนตัวอย่างข้างบนและ `role` ผู้ใช้เห็น email, room_number และ phone_number ของตัวเอง

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
  "owner": { "id": 1, "name": "Nina" },
  "swap_details": {
    "desired_category": { "id": 1, "name": "Books & Documents" },
    "desired_description": "Looking for a novel"
  },
  "created_at": "2026-10-18T10:00:00.000Z"
}
```

`type` เป็น `free` หรือ `swap`; `status` เป็น `available`, `pending`, `completed`, `removed` ถ้า `type=free`, `swap_details` เป็น `null` รูปไม่มีก็ส่ง `image_url: null` ข้อมูลเจ้าของที่แสดงสาธารณะมีเพียง `id` กับ `name`

### GET /api/items

Query string (ทั้งหมดไม่จำเป็น): `q` ค้นในชื่อ/รายละเอียด, `category_id`, `type=free|swap`, `page` เริ่มที่ 1, `limit` ค่าเริ่มต้น 12 และมากสุด 50 ฟีดแสดงเฉพาะ `available` และ `pending` เรียงใหม่ไปเก่า; `removed` ไม่แสดง

ตัวอย่าง `GET /api/items?q=lamp&type=swap&page=1&limit=12` ตอบ `200`:

```json
{
  "items": [ { "id": 12, "title": "Desk lamp", "type": "swap", "status": "available", "category": { "id": 4, "name": "Electronics" }, "image_url": "/uploads/items/abc.webp", "owner": { "id": 1, "name": "Nina" }, "created_at": "2026-10-18T10:00:00.000Z" } ],
  "pagination": { "page": 1, "limit": 12, "total": 1, "total_pages": 1 }
}
```

### GET /api/items/:id

ตอบ `200 {"item": { ... }}` โดย `item` ใช้รูปแบบเต็มข้างบน ID ที่ไม่มีหรือ `removed` ตอบ `404 NOT_FOUND` โพสต์ `completed` ยังเปิดด้วย URL ตรงได้ แต่ไม่ขึ้นฟีด

### GET /api/me/items

ตอบ `200 {"items": [ ... ]}` เป็นโพสต์ทุกสถานะของผู้ใช้จาก session เรียงใหม่ไปเก่า ใช้รูปแบบ `item` เดียวกัน

### POST /api/items

ส่ง `multipart/form-data` (ไม่ตั้ง `Content-Type` เองเมื่อใช้ `FormData` ใน browser):

| Field | จำเป็น | รายละเอียด |
| --- | --- | --- |
| `title` | ใช่ | ชื่อโพสต์ สูงสุด 200 ตัวอักษร |
| `category_id` | ใช่ | ID จาก `/api/categories` |
| `type` | ใช่ | `free` หรือ `swap` |
| `description` | ไม่ | รายละเอียด |
| `defects` | ไม่ | ตำหนิ/สภาพ |
| `image` | ไม่ | JPG, PNG หรือ WebP ขนาดไม่เกิน 5 MB |
| `desired_category_id` | ไม่ | ใช้เฉพาะ `swap` |
| `desired_description` | เฉพาะ `swap` | สิ่งที่อยากได้เพื่อแลก |

API ตั้ง `status=available` เองและตอบ `201 {"item": { ... }}` แบบเต็ม โดย `image_url` เป็น path เช่น `/uploads/items/abc.webp`

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
  "swap_offer": { "description": "A novel in good condition", "image_url": "/uploads/offers/xyz.webp" },
  "created_at": "2026-10-18T11:00:00.000Z"
}
```

ถ้าเป็นคำขอรับของฟรี `swap_offer` เป็น `null` แสดงคำขอเฉพาะผู้ส่งคำขอและเจ้าของโพสต์เท่านั้น

### POST /api/items/:id/requests

ส่ง session cookie และ `multipart/form-data` โดยใช้ข้อมูลตามชนิดโพสต์:

| Field | `free` | `swap` |
| --- | --- | --- |
| `message` | ไม่จำเป็น | ไม่จำเป็น |
| `offer_description` | ไม่ใช้ | จำเป็น |
| `offer_image` | ไม่ใช้ | ไม่จำเป็น; JPG/PNG/WebP ไม่เกิน 5 MB |

ตอบ `201 {"request": { ... }}` คำขอและโพสต์เปลี่ยนเป็น `pending` โพสต์ที่ `pending` **ยังรับคำขอจากคนอื่นได้** แต่ผู้ใช้หนึ่งคนส่งได้เพียงหนึ่งคำขอต่อโพสต์ (`409 CONFLICT` หากซ้ำ) ห้ามขอโพสต์ของตัวเอง และห้ามขอโพสต์ `completed` หรือ `removed`

### GET /api/requests?role=sent|received

`role` จำเป็นและเป็น `sent` หรือ `received` ตอบ `200 {"requests": [ ... ]}` โดยใช้รูปแบบ `request` ข้างบน เรียงใหม่ไปเก่า `sent` คือคำขอที่ตัวเองส่ง `received` คือคำขอของโพสต์ที่ตัวเองเป็นเจ้าของ

### PATCH /api/requests/:id/decision

เจ้าของโพสต์ส่ง JSON `{"decision":"accepted"}` หรือ `{"decision":"rejected"}` และคำขอต้องยังเป็น `pending` ตอบ `200 {"request": { ... }}`

- `accepted`: คำขอนี้เป็น `accepted`, คำขอ `pending` อื่นของโพสต์เป็น `rejected`, และโพสต์เป็น `completed` อนุมัติได้เพียงหนึ่งคน
- `rejected`: เปลี่ยนคำขอนี้เป็น `rejected`; ถ้าไม่มีคำขอ `pending` เหลือ ให้โพสต์กลับ `available` ถ้ายังมี ให้โพสต์คง `pending`
- การตัดสินใจซ้ำหรือโพสต์ `completed` ตอบ `409 INVALID_STATE`; ผู้ที่ไม่ใช่เจ้าของโพสต์ตอบ `403 FORBIDDEN`

## ผู้ดูแลระบบ

ทุก endpoint ในส่วนนี้ต้องมี login session และ role `admin` ถ้าไม่มี session ตอบ `401 UNAUTHENTICATED`; ถ้า role ไม่ใช่ `admin` ตอบ `403 FORBIDDEN` admin คนแรกตั้ง role ในฐานข้อมูลหลังสมัครและยืนยันอีเมลเรียบร้อยแล้ว

### GET /api/admin/stats

ตอบ `200` โดยนับจากตาราง `items` ทั้งหมด รวมโพสต์ `removed` ใน `total` และแยกจำนวนที่ยังไม่ถูกลบใน `active`:

```json
{
  "total": 12,
  "active": 10,
  "removed": 2,
  "by_type": { "free": 7, "swap": 5 },
  "by_category": [
    { "id": 1, "name": "Books & Documents", "total": 4 },
    { "id": 4, "name": "Electronics", "total": 8 }
  ]
}
```

ผลรวม `by_type` และ `by_category` รวมโพสต์ `removed` เช่นเดียวกับ `total`

### GET /api/admin/items

ดูโพสต์ทุกสถานะ เรียงใหม่ไปเก่า รองรับ `status=available|pending|completed|removed`, `type=free|swap`, `category_id`, `page` และ `limit` แบบเดียวกับ `/api/items`; ตอบ `200 {"items":[ ... ],"pagination":{ ... }}` โดยใช้รูปแบบ `item` เดิม

### DELETE /api/admin/items/:id

เปลี่ยน `item_status` เป็น `removed` โดยไม่ลบแถวหรือข้อมูลคำขอ ตอบ `200 {"item":{ ... }}` โพสต์ที่ไม่มีตอบ `404 NOT_FOUND`; โพสต์ที่ `removed` แล้วตอบ `409 INVALID_STATE`

### PATCH /api/admin/users/:id/role

ส่ง JSON `{"role":"admin"}` เพื่อมอบสิทธิ์ให้บัญชีที่มีอยู่ ตอบ `200 {"user":{ ... }}` โดยไม่ส่ง password hash หรือ salt กลับ ผู้ใช้ที่ไม่มีตอบ `404 NOT_FOUND`; role อื่นหรือการลดสิทธิ์ยังไม่อยู่ในสัญญานี้

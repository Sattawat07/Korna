# Korna API

รูปแบบ API สำหรับเว็บให้ฟรีและแลกของมือสอง ใช้เอกสารนี้เป็นข้อตกลงเรื่อง URL, request, response และสถานะของข้อมูล

## ข้อตกลงร่วม

- ตัวอย่าง Base URL: `http://127.0.0.1:3000` (เปลี่ยน host ตามเครื่องที่รัน API)
- ทุก endpoint เริ่มด้วย `/api` ยกเว้น URL รูปที่เริ่มด้วย `/uploads/`
- JSON ใช้ `snake_case` และส่ง `Content-Type: application/json` ยกเว้น endpoint ที่ระบุ `multipart/form-data`
- วันที่เป็น ISO 8601 เช่น `2026-10-18T10:00:00.000Z`; ID เป็นตัวเลข
- endpoint ที่ต้องล็อกอินส่ง `Authorization: Bearer <token>`; token มีอายุ 7 วัน
- frontend ใช้ API base URL จุดเดียว เมื่อได้ `image_url: "/uploads/items/abc.webp"` ให้แสดงรูปด้วย `API_BASE_URL + image_url`; ถ้าเป็น `null` ให้ใช้รูป placeholder ของหน้าเว็บ

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
| 401 | ไม่ได้ล็อกอิน, token หมดอายุ, หรืออีเมล/รหัสผ่านผิด | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | ล็อกอินแล้วแต่ไม่มีสิทธิ์กับรายการนี้ | `FORBIDDEN` |
| 404 | ไม่พบข้อมูล หรือข้อมูลถูกซ่อนจากผู้เรียก | `NOT_FOUND` |
| 409 | ข้อมูลซ้ำหรือสถานะไม่อนุญาตให้ทำรายการ | `CONFLICT`, `INVALID_STATE` |
| 413 | ไฟล์ใหญ่เกินกำหนด | `FILE_TOO_LARGE` |
| 415 | ชนิดไฟล์ไม่รองรับ | `UNSUPPORTED_MEDIA_TYPE` |
| 500 | ระบบขัดข้อง | `INTERNAL_ERROR` |
| 503 | ติดต่อฐานข้อมูลไม่ได้ชั่วคราว | `DATABASE_UNAVAILABLE` |

`details` ใส่เมื่อเป็นข้อผิดพลาดรายฟิลด์; กรณีอื่นละได้

## Endpoint ทั้งหมด

| Method | Path | Login | หน้าที่ |
| --- | --- | --- | --- |
| GET | `/api/health` | ไม่ต้อง | ตรวจว่า Node.js ทำงาน |
| GET | `/api/health/db` | ไม่ต้อง | ตรวจ PostgreSQL |
| POST | `/api/auth/register` | ไม่ต้อง | สมัครสมาชิก |
| POST | `/api/auth/login` | ไม่ต้อง | ล็อกอิน |
| GET | `/api/me` | ต้อง | ดูข้อมูลตัวเอง |
| GET | `/api/me/items` | ต้อง | ดูโพสต์ของตัวเอง |
| GET | `/api/categories` | ไม่ต้อง | ดูหมวดหมู่ |
| GET | `/api/items` | ไม่ต้อง | ฟีด ค้นหา กรอง และแบ่งหน้า |
| GET | `/api/items/:id` | ไม่ต้อง | ดูรายละเอียดโพสต์ |
| POST | `/api/items` | ต้อง | สร้างโพสต์พร้อมรูป |
| PATCH | `/api/items/:id` | เจ้าของ | แก้ข้อความของโพสต์ |
| DELETE | `/api/items/:id` | เจ้าของ | ซ่อนโพสต์ (เปลี่ยนสถานะเป็น `removed`) |
| POST | `/api/items/:id/requests` | ต้อง | ขอรับฟรีหรือยื่นข้อเสนอแลก |
| GET | `/api/requests?role=sent` | ต้อง | ดูคำขอที่ส่ง |
| GET | `/api/requests?role=received` | ต้อง | ดูคำขอที่ได้รับ |
| PATCH | `/api/requests/:id/decision` | เจ้าของโพสต์ | อนุมัติหรือปฏิเสธคำขอ |

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

ตอบ `201`:

```json
{
  "user": {
    "id": 1,
    "name": "Nina",
    "email": "nina@example.com",
    "room_number": "A-304",
    "phone_number": "0812345678",
    "created_at": "2026-10-18T10:00:00.000Z"
  },
  "token": "<jwt>"
}
```

อีเมลซ้ำตอบ `409 CONFLICT` ผู้ใช้ใหม่ถือว่าล็อกอินแล้ว เพราะได้รับ token จากการสมัคร

### POST /api/auth/login

ส่ง `{"email":"nina@example.com","password":"example-password"}` ตอบ `200` ด้วย `user` และ `token` รูปแบบเดียวกับการสมัคร ถ้าอีเมลหรือรหัสผิดตอบ `401 INVALID_CREDENTIALS` โดยไม่บอกว่าส่วนใดผิด

### GET /api/me

ตอบ `200 {"user": { ... }}` โดย `user` มีฟิลด์เหมือนตัวอย่างข้างบน เฉพาะผู้ใช้ที่ล็อกอินจึงเห็น email, room_number และ phone_number ของตัวเอง

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

ตอบ `200 {"items": [ ... ]}` เป็นโพสต์ทุกสถานะของผู้ใช้ที่ล็อกอิน เรียงใหม่ไปเก่า ใช้รูปแบบ `item` เดียวกัน

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

ต้องล็อกอิน ส่ง `multipart/form-data` โดยใช้ข้อมูลตามชนิดโพสต์:

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

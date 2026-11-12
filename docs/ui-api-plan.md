# แผนปรับ backend ให้ตรงกับ UX/UI Page 3

เอกสารนี้เป็นแผนงาน; สัญญา endpoint อยู่ใน `docs/api.md` ปัจจุบัน API บัญชีบางส่วนทำแล้ว ส่วน API โพสต์ คำขอ หน้า Profile และ Admin ยังต้องทำตามลำดับด้านล่าง

## 1. ข้อมูลและฐานข้อมูล

- Profile Activity ใช้ `requests` ที่ `requester_user_id` เป็นผู้ใช้ปัจจุบัน คนที่ interact กับโพสต์ของตนคือผู้ส่งคำขอใน `requests` ของโพสต์นั้น ไม่เพิ่มตาราง activity
- เพิ่ม `item_images` (`id`, `item_id`, `image_url`, `position`) สำหรับรูปหลายรูปต่อโพสต์ และ `request_swap_offer_images` (`id`, `offer_id`, `image_url`, `position`) สำหรับรูปข้อเสนอแลก เก็บไฟล์จริงใน `uploads/` และเก็บ path ใน PostgreSQL
- เมื่อเปลี่ยนฐานข้อมูลเดิม ต้องย้าย `items.item_image_url` และ `request_swap_offers.offer_image_url` เดิมไปเป็นรูปตำแหน่ง 0 ก่อนเลิกใช้คอลัมน์เดิม API ยังส่ง `image_url` เป็นรูปแรกเพื่อให้การ์ดเก่าใช้ได้
- เพิ่ม `notifications` (`id`, `recipient_user_id`, `actor_user_id`, `item_id`, `request_id`, `type`, `decision`, `read_at`, `created_at`) พร้อม index ผู้รับและเวลา เพื่อแสดงกระดิ่งและจำนวนที่ยังไม่อ่าน สร้างเมื่อมีคำขอใหม่หรือคำขอถูกตัดสินใจ รวมคำขอที่ถูกปฏิเสธอัตโนมัติหลังรับอีกคนหนึ่ง
- สถิติ Admin ย้อนหลัง 7 วันใช้ `requests.request_created_at` แยกตามสถานะปัจจุบัน จึงไม่ต้องเพิ่มคอลัมน์วันที่ตัดสินใจ
- Remember Me และ OTP ลืมรหัสผ่านใช้ session store/Map ที่มีอยู่หรือเพิ่ม Map อีกชุด ไม่ต้องเพิ่มตารางใหม่

## 2. ลำดับทำ API

1. Profile: `GET/PATCH /api/me`, `GET /api/me/items` พร้อม `requests_count`
2. โพสต์และรูปหลายรูป: `GET/POST/PATCH/DELETE /api/items`, migration รูป และการเสิร์ฟไฟล์
   - Feed รองรับ `sort=newest|oldest` และ `from`/`to` ตามวันที่โพสต์; หน้าเว็บแปลงตัวเลือกช่วงวันที่สำเร็จรูปเป็น query เหล่านี้
3. คำขอ: `POST /api/items/:id/requests`, `GET /api/requests?role=sent|received&item_id=...`, `PATCH /api/requests/:id/decision`
4. แจ้งเตือน: `GET /api/notifications`, `PATCH /api/notifications/:id/read` สร้าง notification ใน transaction เดียวกับการส่งหรือตัดสินใจคำขอ
5. Login เพิ่ม `remember_me` และ API ลืมรหัสผ่าน 3 ขั้น
6. Admin: สถิติคำขอ/ผู้ใช้/โพสต์, ค้นหาโพสต์, `GET /api/admin/users` และจัดการโพสต์/สิทธิ์

## 3. คำบนหน้าจอ

- Role ในระบบมี `user` และ `admin` เท่านั้น ปุ่ม “Assign Super Admin” ในแบบต้องใช้คำว่า “Assign Admin”
- `items.completed` แสดงเป็น “Exchanged” ได้สำหรับโพสต์ swap; โพสต์ free ที่จบแล้วควรแสดง “Completed”
- การลบโพสต์เปลี่ยน `item_status` เป็น `removed` ข้อความยืนยันควรบอกว่าโพสต์ถูกซ่อนจากชุมชน ไม่ใช่ลบข้อมูลถาวร
- สถานะคำขอใน API คือ `pending`, `accepted`, `rejected` โดย UI แสดง `accepted` เป็น “Completed” และ `rejected` เป็น “Cancelled” ตามข้อตกลง ไม่มี flow ผู้ส่งยกเลิกคำขอเอง

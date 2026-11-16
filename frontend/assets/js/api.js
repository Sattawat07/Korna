// Shared API client — Vanilla JS, no framework
// ใช้ร่วมกันได้ทุกหน้า (login, signup, profile, feed, ฯลฯ)
// รูปการตอบกลับตาม docs/api.md:
//   Error: { "error": { "code": "...", "message": "...", "details": {...} } }

// ใช้ path เดียวกับหน้าเว็บ (same-origin) — ใช้ได้ทั้ง http://127.0.0.1:3000 และ URL ของ Tailscale Serve
const API_BASE_URL = '/api';

export async function request(path, { method = 'GET', body = null, headers = {} } = {}) {
  // FormData (อัปโหลดรูป) ต้องให้เบราว์เซอร์ตั้ง Content-Type multipart/form-data เอง
  const isFormData = body instanceof FormData;
  const config = {
    method,
    credentials: 'include', // ยืนยันตัวตนด้วย session cookie (HttpOnly) อย่างเดียว ตาม docs/api.md
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  };

  if (body) {
    config.body = isFormData ? body : JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, config);

  // ถ้าตอบกลับไม่ใช่ JSON ให้โยน error ทันที
  let data;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // ตามรูปแบบใน docs/api.md: { error: { code, message, details } }
    const apiError = data.error || {};
    const error = new Error(apiError.message || 'เกิดข้อผิดพลาด');
    error.status = response.status;
    error.code = apiError.code;
    error.details = apiError.details;
    throw error;
  }

  return data;
}

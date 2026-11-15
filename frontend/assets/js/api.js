// Shared API client — Vanilla JS, no framework
// ใช้ร่วมกันได้ทุกหน้า (login, signup, profile, feed, ฯลฯ)
// รูปการตอบกลับตาม docs/api.md:
//   Error: { "error": { "code": "...", "message": "...", "details": {...} } }

const API_BASE_URL = 'http://127.0.0.1:3000/api';

function getAuthHeader() {
  const token = localStorage.getItem('korna_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request(path, { method = 'GET', body = null, headers = {} } = {}) {
  const config = {
    method,
    credentials: 'include', // รองรับ Session Cookie (HttpOnly) ตาม api.md ล่าสุด
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...headers,
    },
  };

  if (body) {
    config.body = JSON.stringify(body);
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

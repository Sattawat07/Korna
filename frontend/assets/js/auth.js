// Auth helpers — ใช้ร่วมกันได้ทุกหน้า
// ตอนนี้เป็น mock implementation (จำลองการตอบกลับจาก API)
// เมื่อ backend พร้อม ให้เปลี่ยนให้เรียกใช้ api.request() แทน

const TOKEN_KEY = 'korna_token';
const MOCK_USERS = [
  { email: 'nina@example.com', password: 'example-password', name: 'Nina', id: 1 },
  { email: 'ton@example.com', password: 'password123', name: 'Ton', id: 2 },
];

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

// จำลองการ login — คืนค่า Promise ที่ resolve/reject เหมือน API จริง
export async function mockLogin(email, password) {
  // จำลอง latency ของเครือข่าย
  await new Promise((resolve) => setTimeout(resolve, 600));

  const user = MOCK_USERS.find((u) => u.email === email);

  // ถ้าไม่พบอีเมล หรือรหัสผ่านไม่ตรง → reject ด้วย 401 INVALID_CREDENTIALS
  // ตาม spec ใน docs/api.md: ไม่บอกว่าส่วนใดผิด (ป้องกัน user enumeration)
  if (!user || user.password !== password) {
    const error = new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    error.status = 401;
    error.code = 'INVALID_CREDENTIALS';
    throw error;
  }

  // สำเร็จ → คืน token แบบจำลอง และข้อมูลผู้ใช้
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
    },
    token: 'mock-jwt-token-' + user.id,
  };
}

// จำลองการสมัครสมาชิก — คืนค่า Promise ที่ resolve/reject เหมือน API จริง
export async function mockRegister({ name, email, password, room_number, phone_number }) {
  // จำลอง latency ของเครือข่าย
  await new Promise((resolve) => setTimeout(resolve, 600));

  // ตรวจสอบอีเมลซ้ำ (ตาม spec: อีเมลซ้ำตอบ 409 CONFLICT)
  const existing = MOCK_USERS.find((u) => u.email === email);
  if (existing) {
    const error = new Error('อีเมลนี้มีผู้ใช้งานแล้ว');
    error.status = 409;
    error.code = 'CONFLICT';
    throw error;
  }

  // สร้างผู้ใช้ใหม่จำลอง
  const id = MOCK_USERS.length + 1;
  const user = { id, name, email, room_number, phone_number };
  MOCK_USERS.push({ email, password, name, id });

  return {
    user,
    token: 'mock-jwt-token-' + id,
  };
}

// จำลองการ logout
export function mockLogout() {
  removeToken();
}

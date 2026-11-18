// ตัวช่วยเรื่อง session และข้อความ error ที่หน้า Feed / Profile ใช้ร่วมกัน
import { request } from '../api.js';

export function goToLogin() {
  window.location.replace('./login.html');
}

/** ข้อมูลผู้ใช้ที่ล็อกอินอยู่ (GET /api/me) — ถ้ายังไม่ล็อกอิน (401) จะพาไปหน้า login */
export async function loadMe() {
  try {
    return await request('/me');
  } catch (error) {
    if (error.status === 401) {
      goToLogin();
      return new Promise(() => {}); // หยุดการทำงานต่อระหว่างเปลี่ยนหน้า
    }
    throw error;
  }
}

/**
 * ข้อมูลผู้ใช้ถ้าล็อกอินอยู่ หรือ null ถ้ายังไม่ล็อกอิน (ไม่พาไปหน้า login)
 * ใช้กับหน้าที่คนทั่วไปเปิดดูได้ เช่น ฟีด (GET /api/items เปิดให้ผู้ไม่ล็อกอินเรียกได้)
 */
export async function loadMeOptional() {
  try {
    const data = await request('/me');
    return data.user ?? null;
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

/** แปลง error จาก API เป็นข้อความสำหรับแสดงบนหน้าจอ */
export function errorText(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.status === 401) {
    goToLogin();
    return 'Your session has expired. Please sign in again.';
  }
  if (error.details && typeof error.details === 'object') {
    const messages = Object.values(error.details).filter((v) => typeof v === 'string');
    if (messages.length) return messages.join(' · ');
  }
  if (error.status && error.message) return error.message;
  return fallback; // เครือข่ายล่ม หรือเปิดหน้าโดยไม่ผ่าน backend
}

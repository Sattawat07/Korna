// Signup page logic — Vanilla JS
import { request } from '../api.js';
import { setupOtpInputs, startCountdown } from '../shared/modal.js';

const form = document.querySelector('form');
const nameInput = document.querySelector('#name');
const surnameInput = document.querySelector('#surname');
const roomInput = document.querySelector('#room');
const phoneInput = document.querySelector('#phone');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const confirmPasswordInput = document.querySelector('#confirm-password');
const toggleBtns = document.querySelectorAll('.password-toggle');
const submitBtn = form.querySelector('button[type="submit"]');

const errorContainer = document.createElement('div');
errorContainer.className = 'form-error';
errorContainer.setAttribute('aria-live', 'polite');
errorContainer.setAttribute('role', 'alert');
errorContainer.style.display = 'none';
errorContainer.style.color = '#b3402e';
errorContainer.style.fontSize = '12px';
errorContainer.style.marginTop = '8px';
errorContainer.style.textAlign = 'left';

// วาง error container ใต้ฟอร์ม
form.parentNode.insertBefore(errorContainer, form.nextSibling);

// ---------- Password toggle ----------
const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#5E4636"><path d="M15.19,14.69q1.31-1.31 1.31-3.19T15.19,8.31T12,7T8.81,8.31T7.5,11.5t1.31,3.19T12,16t3.19-1.31Zm-5.1-1.28Q9.3,12.63 9.3,11.5t0.79-1.91T12,8.8t1.91,0.79q0.79,0.79 0.79,1.91t-0.79,1.91T12,14.2t-1.91-0.79ZM5.35,16.96Q2.35,14.93 1,11.5Q2.35,8.07 5.35,6.04T12,4t6.65,2.04T23,11.5q-1.35,3.42-4.35,5.46T12,19T5.35,16.96ZM12,11.5Zm5.19,4.01q2.36-1.49 3.61-4.01q-1.25-2.53-3.61-4.01T12,6Q9.18,6 6.81,7.49T3.2,11.5q1.25,2.52 3.61,4.01T12,17t5.19-1.49Z"/></svg>`;
const hideSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#5E4636"><path d="M16.1,13.3l-1.45-1.45q0.22-1.18-0.67-2.2q-0.9-1.02-2.33-0.8L10.2,7.4q0.42-0.2 0.86-0.3T12,7q1.88,0 3.19,1.31T16.5,11.5q0,0.5-0.1,0.94T16.1,13.3Zm3.2,3.15l-1.45-1.4q0.95-0.72 1.69-1.59T20.8,11.5q-1.25-2.53-3.59-4.01T12,6q-0.72,0-1.42,0.1T9.2,6.4L7.65,4.85q1.03-0.43 2.1-0.64T12,4q3.78,0 6.73,2.09T23,11.5q-0.57,1.47-1.51,2.74T19.3,16.45Zm0.5,6.15l-4.2-4.15q-0.88,0.28-1.76,0.41T12,19q-3.78,0-6.73-2.09T1,11.5q0.53-1.33 1.33-2.46T4.15,7L1.4,4.2L2.8,2.8L21.2,21.2l-1.4,1.4ZM5.55,8.4Q4.83,9.05 4.23,9.82T3.2,11.5q1.25,2.52 3.59,4.01T12,17q0.5,0 0.98-0.06t0.97-0.14l-0.9-0.95q-0.28,0.07-0.53,0.11T12,16q-1.88,0-3.19-1.31T7.5,11.5q0-0.28 0.04-0.53t0.11-0.53L5.55,8.4Zm7.98,2.33ZM9.75,12.6Z"/></svg>`;

toggleBtns.forEach(toggleBtn => {
  const formGroup = toggleBtn.closest('.form-group');
  const passwordInput = formGroup.querySelector('input[type="password"], input[type="text"]');

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    if (isPassword) {
      passwordInput.type = 'text';
      toggleBtn.innerHTML = hideSvg;
      toggleBtn.setAttribute('aria-label', 'Hide password');
      toggleBtn.setAttribute('aria-pressed', 'true');
    } else {
      passwordInput.type = 'password';
      toggleBtn.innerHTML = eyeSvg;
      toggleBtn.setAttribute('aria-label', 'Show password');
      toggleBtn.setAttribute('aria-pressed', 'false');
    }
  });
});

// ==========================================
// Sign up OTP Modal elements & logic
// ==========================================
const otpModal = document.getElementById('signup-otp-modal');
const modalCloseBtn = document.getElementById('signup-modal-close');
const otpForm = document.getElementById('signup-otp-form');
const otpContainer = document.getElementById('signup-otp-inputs');
const targetEmailSpan = document.getElementById('signup-target-email');
const timerSpan = document.getElementById('signup-timer');
const resendBtn = document.getElementById('signup-resend-btn');
const otpError = document.getElementById('signup-otp-error');

let stopTimerFn = null;
let pendingUserData = null;

const otpHandler = setupOtpInputs(otpContainer);

function openOtpModal(email) {
  otpModal.classList.add('active');
  targetEmailSpan.textContent = email;
  otpHandler.focusFirst();
  startOtpCountdown();
}

function closeOtpModal() {
  otpModal.classList.remove('active');
  if (stopTimerFn) stopTimerFn();
  otpError.textContent = '';
  otpHandler.clear();
}

function startOtpCountdown() {
  resendBtn.disabled = true;
  if (stopTimerFn) stopTimerFn();
  stopTimerFn = startCountdown(timerSpan, 300, () => {
    resendBtn.disabled = false;
  });
}

modalCloseBtn?.addEventListener('click', closeOtpModal);
otpModal?.addEventListener('click', (e) => {
  if (e.target === otpModal) closeOtpModal();
});

// Resend OTP
resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  otpError.textContent = '';
  try {
    await request('/auth/register/resend', { method: 'POST' });
    otpHandler.clear();
    startOtpCountdown();
  } catch (err) {
    otpError.textContent = 'Failed to resend code.';
    resendBtn.disabled = false;
  }
});

// Verify OTP & Create Account
otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  otpError.textContent = '';
  const otp = otpHandler.getValue();

  if (otp.length < 6) {
    otpError.textContent = 'Please enter all 6 digits.';
    return;
  }

  const btn = otpForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    await request('/auth/register/verify', {
      method: 'POST',
      body: { otp },
    });
    closeOtpModal();
    alert('Account created successfully! Welcome to KORNA. Please sign in.');
    window.location.href = 'login.html';
  } catch (err) {
    otpError.textContent = err.message || 'Invalid or expired OTP code.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify & Create account';
  }
});

// ---------- Form submission (Step 1: Request OTP) ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  // Reset UI
  errorContainer.style.display = 'none';
  errorContainer.textContent = '';

  const firstName = nameInput.value.trim();
  const surname = surnameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;
  const roomNumber = roomInput.value.trim();
  const phoneNumber = phoneInput.value.trim();

  // Client-side validation: รวมชื่อ-นามสกุล
  const fullName = `${firstName} ${surname}`.trim();
  if (!fullName) {
    errorContainer.textContent = 'Please enter your name.';
    errorContainer.style.display = 'block';
    return;
  }

  // Client-side validation: password match
  if (password !== confirmPassword) {
    errorContainer.textContent = 'Passwords do not match.';
    errorContainer.style.display = 'block';
    return;
  }

  // Client-side validation: password length >= 8
  if (password.length < 8) {
    errorContainer.textContent = 'Password must be at least 8 characters long.';
    errorContainer.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending code...';

  try {
    // เก็บข้อมูลเตรียมไว้
    pendingUserData = {
      name: fullName,
      email,
      password,
      room_number: roomNumber,
      phone_number: phoneNumber || undefined,
    };

    // ยิง POST /api/auth/register
    await request('/auth/register', {
      method: 'POST',
      body: pendingUserData,
    });

    // สำเร็จ (HTTP 202) -> เปิด Modal กรอก OTP
    openOtpModal(email);
  } catch (error) {
    if (error.status === 409 && error.code === 'CONFLICT') {
      errorContainer.textContent = 'An account with this email already exists.';
    } else {
      errorContainer.textContent = 'Unable to proceed with registration. Please try again.';
    }
    errorContainer.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign up';
  }
});

// ---------- Reset button state on pageshow ----------
window.addEventListener('pageshow', () => {
  submitBtn.disabled = false;
  submitBtn.textContent = 'Sign up';
  errorContainer.style.display = 'none';
  errorContainer.textContent = '';
});

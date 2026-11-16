// Login page logic — Vanilla JS
import { request } from '../api.js';
import { closeAccessibleModal, openAccessibleModal, setupOtpInputs, startCountdown } from '../shared/modal.js';

const form = document.querySelector('form');
const emailInput = document.querySelector('input[type="email"]');
const passwordInput = document.querySelector('input[type="password"]');
const rememberCheckbox = document.querySelector('#remember');
const toggleBtn = document.querySelector('.password-toggle');
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

// ---------- Password toggle (click to show/hide) ----------
const eyeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#5E4636"><path d="M15.19,14.69q1.31-1.31 1.31-3.19T15.19,8.31T12,7T8.81,8.31T7.5,11.5t1.31,3.19T12,16t3.19-1.31Zm-5.1-1.28Q9.3,12.63 9.3,11.5t0.79-1.91T12,8.8t1.91,0.79q0.79,0.79 0.79,1.91t-0.79,1.91T12,14.2t-1.91-0.79ZM5.35,16.96Q2.35,14.93 1,11.5Q2.35,8.07 5.35,6.04T12,4t6.65,2.04T23,11.5q-1.35,3.42-4.35,5.46T12,19T5.35,16.96ZM12,11.5Zm5.19,4.01q2.36-1.49 3.61-4.01q-1.25-2.53-3.61-4.01T12,6Q9.18,6 6.81,7.49T3.2,11.5q1.25,2.52 3.61,4.01T12,17t5.19-1.49Z"/></svg>`;
const hideSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="#5E4636"><path d="M16.1,13.3l-1.45-1.45q0.22-1.18-0.67-2.2q-0.9-1.02-2.33-0.8L10.2,7.4q0.42-0.2 0.86-0.3T12,7q1.88,0 3.19,1.31T16.5,11.5q0,0.5-0.1,0.94T16.1,13.3Zm3.2,3.15l-1.45-1.4q0.95-0.72 1.69-1.59T20.8,11.5q-1.25-2.53-3.59-4.01T12,6q-0.72,0-1.42,0.1T9.2,6.4L7.65,4.85q1.03-0.43 2.1-0.64T12,4q3.78,0 6.73,2.09T23,11.5q-0.57,1.47-1.51,2.74T19.3,16.45Zm0.5,6.15l-4.2-4.15q-0.88,0.28-1.76,0.41T12,19q-3.78,0-6.73-2.09T1,11.5q0.53-1.33 1.33-2.46T4.15,7L1.4,4.2L2.8,2.8L21.2,21.2l-1.4,1.4ZM5.55,8.4Q4.83,9.05 4.23,9.82T3.2,11.5q1.25,2.52 3.59,4.01T12,17q0.5,0 0.98-0.06t0.97-0.14l-0.9-0.95q-0.28,0.07-0.53,0.11T12,16q-1.88,0-3.19-1.31T7.5,11.5q0-0.28 0.04-0.53t0.11-0.53L5.55,8.4Zm7.98,2.33ZM9.75,12.6Z"/></svg>`;

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

// ---------- Form submission (Sign in) ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // Reset UI
  errorContainer.style.display = 'none';
  errorContainer.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const rememberMe = Boolean(rememberCheckbox?.checked);
    const result = await request('/auth/login', {
      method: 'POST',
      body: { email, password, remember_me: rememberMe },
    });
    // ล็อกอินสำเร็จ → ไปหน้า Feed (ปุ่มยังปิดอยู่ระหว่างเปลี่ยนหน้า กันกดซ้ำ)
    if (result.user) window.location.href = './feed.html';
  } catch (error) {
    if (error.status === 401 && error.code === 'INVALID_CREDENTIALS') {
      errorContainer.textContent = 'Invalid email or password.';
    } else {
      errorContainer.textContent = 'Unable to log in. Please try again.';
    }
    errorContainer.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
});

// ==========================================
// Forgot Password Flow (Modal with 3 steps)
// ==========================================
const forgotBtn = document.getElementById('forgot-btn');
const forgotModal = document.getElementById('forgot-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

const step1 = document.getElementById('forgot-step-1');
const step2 = document.getElementById('forgot-step-2');
const step3 = document.getElementById('forgot-step-3');

const emailForm = document.getElementById('forgot-email-form');
const forgotEmailInput = document.getElementById('forgot-email');
const error1 = document.getElementById('forgot-error-1');

const otpForm = document.getElementById('forgot-otp-form');
const otpContainer = document.getElementById('forgot-otp-inputs');
const targetEmailSpan = document.getElementById('otp-target-email');
const timerSpan = document.getElementById('forgot-timer');
const resendBtn = document.getElementById('forgot-resend-btn');
const changeEmailBtn = document.getElementById('forgot-change-email-btn');
const error2 = document.getElementById('forgot-error-2');

const resetForm = document.getElementById('forgot-reset-form');
const newPassInput = document.getElementById('new-password');
const confirmPassInput = document.getElementById('confirm-password');
const error3 = document.getElementById('forgot-error-3');

let stopTimerFn = null;
let currentResetEmail = '';

// Setup OTP Inputs
const otpHandler = setupOtpInputs(otpContainer);

function openModal() {
  showStep(1);
  forgotEmailInput.value = emailInput.value || '';
  openAccessibleModal(forgotModal, closeModal);
  setTimeout(() => forgotEmailInput.focus(), 100);
}

function closeModal() {
  closeAccessibleModal(forgotModal);
  if (stopTimerFn) stopTimerFn();
  error1.textContent = '';
  error2.textContent = '';
  error3.textContent = '';
  otpHandler.clear();
}

function showStep(stepNum) {
  step1.classList.toggle('is-hidden', stepNum !== 1);
  step2.classList.toggle('is-hidden', stepNum !== 2);
  step3.classList.toggle('is-hidden', stepNum !== 3);

  if (stepNum === 2) {
    targetEmailSpan.textContent = currentResetEmail;
    otpHandler.focusFirst();
    startOtpCountdown();
  } else if (stepNum === 3) {
    newPassInput.focus();
  }
}

function startOtpCountdown() {
  resendBtn.disabled = true;
  if (stopTimerFn) stopTimerFn();
  stopTimerFn = startCountdown(timerSpan, 300, () => {
    resendBtn.disabled = false;
  });
}

forgotBtn?.addEventListener('click', openModal);
modalCloseBtn?.addEventListener('click', closeModal);
changeEmailBtn?.addEventListener('click', () => {
  if (stopTimerFn) stopTimerFn();
  error2.textContent = '';
  otpHandler.clear();
  showStep(1);
  forgotEmailInput.focus();
});
forgotModal?.addEventListener('click', (e) => {
  if (e.target === forgotModal) closeModal();
});

// Step 1: Submit Email
emailForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  error1.textContent = '';
  const email = forgotEmailInput.value.trim();
  if (!email) return;

  const btn = emailForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    await request('/auth/forgot-password/request', {
      method: 'POST',
      body: { email },
    });
    currentResetEmail = email;
    showStep(2);
  } catch (err) {
    error1.textContent = err.message || 'Failed to send OTP code.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send OTP';
  }
});

// Step 2: Submit OTP
otpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  error2.textContent = '';
  const otp = otpHandler.getValue();
  if (otp.length < 6) {
    error2.textContent = 'Please enter all 6 digits.';
    return;
  }

  const btn = otpForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Verifying...';

  try {
    await request('/auth/forgot-password/verify', {
      method: 'POST',
      body: { otp },
    });
    showStep(3);
  } catch (err) {
    error2.textContent = err.message || 'Invalid or expired OTP code.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify code';
  }
});

// Resend OTP
resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  error2.textContent = '';
  try {
    await request('/auth/forgot-password/request', {
      method: 'POST',
      body: { email: currentResetEmail },
    });
    otpHandler.clear();
    startOtpCountdown();
  } catch (err) {
    error2.textContent = 'Failed to resend code.';
    resendBtn.disabled = false;
  }
});

// Step 3: Set New Password
resetForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  error3.textContent = '';
  const newPass = newPassInput.value;
  const confirmPass = confirmPassInput.value;

  if (newPass.length < 8) {
    error3.textContent = 'Password must be at least 8 characters long.';
    return;
  }

  if (newPass !== confirmPass) {
    error3.textContent = 'Passwords do not match.';
    return;
  }

  const btn = resetForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    await request('/auth/forgot-password/reset', {
      method: 'POST',
      body: { new_password: newPass },
    });
    closeModal();
    alert('Password reset successful! Please sign in with your new password.');
  } catch (err) {
    error3.textContent = err.message || 'Failed to update password.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change password';
  }
});

// ---------- Reset button state on pageshow ----------
window.addEventListener('pageshow', () => {
  submitBtn.disabled = false;
  submitBtn.textContent = 'Sign in';
  errorContainer.style.display = 'none';
  errorContainer.textContent = '';
});

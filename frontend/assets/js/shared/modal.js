// Modal helper and OTP handler — Vanilla JS

export function setupOtpInputs(container, onComplete) {
  if (!container) return;
  const inputs = Array.from(container.querySelectorAll('.otp-digit'));

  inputs.forEach((input, index) => {
    // พิมพ์แล้วกระโดดไปช่องถัดไป
    input.addEventListener('input', (e) => {
      const val = e.target.value.replace(/[^0-9]/g, '');
      e.target.value = val ? val[0] : '';

      if (e.target.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }

      const fullOtp = inputs.map(i => i.value).join('');
      if (fullOtp.length === inputs.length && onComplete) {
        onComplete(fullOtp);
      }
    });

    // ลบ (Backspace) แล้วถอยหลังกลับ
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    // รองรับการ Paste OTP ทั้งก้อน 6 ตัว
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData('text').trim();
      const digits = pasteData.replace(/[^0-9]/g, '').slice(0, inputs.length);
      
      digits.split('').forEach((char, i) => {
        if (inputs[i]) inputs[i].value = char;
      });

      const nextFocus = Math.min(digits.length, inputs.length - 1);
      inputs[nextFocus].focus();

      const fullOtp = inputs.map(i => i.value).join('');
      if (fullOtp.length === inputs.length && onComplete) {
        onComplete(fullOtp);
      }
    });
  });

  return {
    getValue: () => inputs.map(i => i.value).join(''),
    clear: () => {
      inputs.forEach(i => i.value = '');
      inputs[0]?.focus();
    },
    focusFirst: () => inputs[0]?.focus()
  };
}

export function startCountdown(timerElement, seconds, onExpire) {
  let remaining = seconds;
  clearInterval(timerElement._interval);

  function update() {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    timerElement.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    if (remaining <= 0) {
      clearInterval(timerElement._interval);
      if (onExpire) onExpire();
    }
    remaining--;
  }

  update();
  timerElement._interval = setInterval(update, 1000);

  return () => clearInterval(timerElement._interval);
}

const modalReturnFocus = new WeakMap();
const modalCloseCallbacks = new WeakMap();

export function openAccessibleModal(modal, onClose) {
  if (!modal) return;
  modalReturnFocus.set(modal, document.activeElement);
  if (typeof onClose === 'function') modalCloseCallbacks.set(modal, onClose);
  modal.classList.add('active');
  const firstFocusable = modal.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
  firstFocusable?.focus();
}

export function closeAccessibleModal(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  const prev = modalReturnFocus.get(modal);
  if (prev && typeof prev.focus === 'function') prev.focus();
}

document.addEventListener('keydown', (e) => {
  const activeModal = document.querySelector('.modal-backdrop.active');
  if (!activeModal) return;

  if (e.key === 'Escape') {
    const onClose = modalCloseCallbacks.get(activeModal);
    if (onClose) onClose();
    else closeAccessibleModal(activeModal);
    return;
  }

  if (e.key === 'Tab') {
    const focusables = [...activeModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

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

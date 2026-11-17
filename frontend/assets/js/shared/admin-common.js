import { request } from '../api.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return escapeHtml(trimmed);
  }
  return '';
}

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';

/** HTML ของรูปโปรไฟล์วงกลม: ใช้ avatar_url ถ้ามี ไม่มีก็ใช้ไอคอนคนเหมือนเดิม */
export function avatarHtml(url, className = 'avatar-circle') {
  const safe = sanitizeImageUrl(url);
  const img = safe ? `<img class="avatar-img" src="${safe}" alt="" loading="lazy">` : '';
  return `<span class="${className}${safe ? ' has-img' : ''}" aria-hidden="true">${PERSON_SVG}${img}</span>`;
}

/** ใส่/ล้างรูปโปรไฟล์ในกล่อง avatar ที่มีอยู่แล้วในหน้า (คงไอคอนไว้เป็นสำรองถ้ารูปโหลดไม่ได้) */
export function setAvatar(holder, url) {
  if (!holder) return;
  holder.querySelector('.avatar-img')?.remove();
  holder.classList.remove('has-img');
  const safe = sanitizeImageUrl(url);
  if (!safe) return;
  holder.insertAdjacentHTML('beforeend', `<img class="avatar-img" src="${safe}" alt="">`);
  holder.classList.add('has-img');
}

// รูปโปรไฟล์โหลดไม่ได้ → กลับไปแสดงไอคอนคน
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.classList.contains('avatar-img')) {
      img.parentElement?.classList.remove('has-img');
      img.remove();
    }
  },
  true,
);

export function formatShortDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getStatusDisplay(status) {
  switch (status) {
    case 'available':
      return { label: 'Available', cls: 'status-available' };
    case 'pending':
      return { label: 'Pending', cls: 'status-pending' };
    case 'completed':
      return { label: 'Exchanged', cls: 'status-completed' };
    case 'removed':
      return { label: 'Removed', cls: 'status-removed' };
    default:
      return { label: status || 'Unknown', cls: 'status-available' };
  }
}

export async function loadAdminProfile(nameEl, onLoaded) {
  const verifyAdmin = async () => {
    try {
      const me = await request('/me');
      if (!['admin', 'super_admin'].includes(me?.user?.role)) {
        window.location.replace('login.html');
        return;
      }
      if (me.user.name && nameEl) {
        nameEl.textContent = me.user.name;
      }
      setAvatar(nameEl?.closest('.admin-profile-pill')?.querySelector('.avatar-circle'), me.user.avatar_url);
      onLoaded?.(me.user);
    } catch {
      window.location.replace('login.html');
    }
  };

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) verifyAdmin();
  });

  await verifyAdmin();
}

export function setupLogoutModal({ triggerBtn, modal, stayBtn, confirmBtn, closeBtn }) {
  if (!triggerBtn || !modal) return;
  const open = () => openModalDialog(modal);
  const close = () => closeModalDialog(modal);

  triggerBtn.addEventListener('click', open);
  stayBtn?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Redirect even if session already expired
    }
    window.location.href = 'login.html';
  });
}

const modalReturnFocus = new WeakMap();

export function openModalDialog(modal) {
  if (!modal) return;
  modalReturnFocus.set(modal, document.activeElement);
  modal.classList.add('active');
  const focusable = modal.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
  focusable?.focus();
}

export function closeModalDialog(modal) {
  if (!modal) return;
  modal.classList.remove('active');
  const prev = modalReturnFocus.get(modal);
  if (prev && typeof prev.focus === 'function') prev.focus();
}

document.addEventListener('keydown', (e) => {
  const activeModal = document.querySelector('.admin-modal-backdrop.active');
  if (!activeModal) return;

  if (e.key === 'Escape') {
    closeModalDialog(activeModal);
    return;
  }

  if (e.key === 'Tab') {
    const focusables = [...activeModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
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

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

export async function loadAdminProfile(nameEl) {
  const verifyAdmin = async () => {
    try {
      const me = await request('/me');
      if (me?.user?.role !== 'admin') {
        window.location.replace('login.html');
        return;
      }
      if (me.user.name && nameEl) {
        nameEl.textContent = me.user.name;
      }
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

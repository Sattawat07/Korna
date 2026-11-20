import { request } from '../api.js';
import { escapeHtml } from './format.js';
import { bindLogoutConfirm } from './logout-modal.js';
import { goToLogin } from './session.js';
export { escapeHtml };
export { enhanceSelect } from './custom-select.js';

export function sanitizeImageUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/') || trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return escapeHtml(trimmed);
  }
  return '';
}

const PERSON_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';

export function avatarHtml(url, className = 'avatar-circle') {
  const safe = sanitizeImageUrl(url);
  const img = safe ? `<img class="avatar-img" src="${safe}" alt="" loading="lazy">` : '';
  return `<span class="${className}${safe ? ' has-img' : ''}" aria-hidden="true">${PERSON_SVG}${img}</span>`;
}

export function setAvatar(holder, url) {
  if (!holder) return;
  holder.querySelector('.avatar-img')?.remove();
  holder.classList.remove('has-img');
  const safe = sanitizeImageUrl(url);
  if (!safe) return;
  holder.insertAdjacentHTML('beforeend', `<img class="avatar-img" src="${safe}" alt="">`);
  holder.classList.add('has-img');
}

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

export function getTypeDisplay(type) {
  if (type === 'swap') return { label: 'Swap', cls: 'type-swap' };
  return { label: 'Free', cls: 'type-free' };
}

export async function loadAdminProfile(nameEl, onLoaded) {
  const verifyAdmin = async () => {
    try {
      const me = await request('/me');
      if (!['admin', 'super_admin'].includes(me?.user?.role)) {
        goToLogin();
        return;
      }
      if (me.user.name && nameEl) {
        nameEl.textContent = me.user.name;
      }
      setAvatar(nameEl?.closest('.admin-profile-pill')?.querySelector('.avatar-circle'), me.user.avatar_url);
      onLoaded?.(me.user);
    } catch {
      goToLogin();
    }
  };

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) verifyAdmin();
  });

  await verifyAdmin();
}

export function setupLogoutModal({ triggerBtn }) {
  bindLogoutConfirm(triggerBtn, {
    title: 'Log out of Admin?',
    description: 'You will need to sign in again to access Admin.',
  });
}

export function setupAdminDeleteModal({ onDeleted } = {}) {
  const modal = document.getElementById('delete-modal');
  const closeBtn = document.getElementById('delete-close-btn');
  const cancelBtn = document.getElementById('delete-cancel-btn');
  const confirmBtn = document.getElementById('delete-confirm-btn');
  const errorEl = document.getElementById('delete-error');
  const nameEl = document.getElementById('delete-item-name');
  const titleEl = document.getElementById('delete-modal-title');
  const descriptionEl = document.getElementById('delete-description');
  const consequenceEl = document.getElementById('delete-consequence');
  let targetItem = null;

  closeBtn?.addEventListener('click', () => closeModalDialog(modal));
  cancelBtn?.addEventListener('click', () => closeModalDialog(modal));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModalDialog(modal);
  });

  confirmBtn?.addEventListener('click', async () => {
    if (!targetItem) return;
    confirmBtn.disabled = true;
    errorEl.textContent = '';
    try {
      const endpoint = targetItem.status === 'removed'
        ? `/admin/items/${targetItem.id}/permanent`
        : `/admin/items/${targetItem.id}`;
      await request(endpoint, { method: 'DELETE' });
      closeModalDialog(modal);
      await onDeleted?.(targetItem);
    } catch (error) {
      errorEl.textContent = error.message || 'Unable to update item.';
    } finally {
      confirmBtn.disabled = false;
    }
  });

  return {
    open(item) {
      if (!item || !modal) return;
      targetItem = item;
      errorEl.textContent = '';
      nameEl.textContent = item.title;
      const permanent = item.status === 'removed';
      titleEl.textContent = permanent ? 'Delete permanently?' : 'Hide this item?';
      descriptionEl.textContent = permanent
        ? 'This will permanently delete the listing and its requests.'
        : 'This will hide the listing from the community.';
      consequenceEl.textContent = permanent
        ? 'Images, requests, and related notifications will also be deleted. This cannot be undone.'
        : 'Pending requests will be rejected. The item will remain in admin records.';
      confirmBtn.textContent = permanent ? 'Delete permanently' : 'Hide item';
      openModalDialog(modal);
    },
  };
}

export function setupAdminItemDetailModal({ onDelete } = {}) {
  const modal = document.getElementById('item-detail-modal');
  const closeBtn = document.getElementById('detail-close-btn');
  const deleteBtn = document.getElementById('detail-delete-btn');
  let currentItem = null;

  closeBtn?.addEventListener('click', () => closeModalDialog(modal));
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModalDialog(modal);
  });
  deleteBtn?.addEventListener('click', () => {
    closeModalDialog(modal);
    if (currentItem) onDelete?.(currentItem);
  });

  return {
    open(item, ownerFallback = 'Unknown') {
      if (!item || !modal) return;
      currentItem = item;
      const st = getStatusDisplay(item.status);
      const tp = getTypeDisplay(item.type);
      document.getElementById('detail-title').textContent = item.title;
      document.getElementById('detail-sub').textContent =
        `${item.category?.name || 'Uncategorized'} · Listed ${formatShortDate(item.created_at)}`;
      document.getElementById('detail-owner').textContent = item.owner?.name || ownerFallback;
      document.getElementById('detail-status-wrap').innerHTML = `<span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span>`;
      document.getElementById('detail-type-wrap').innerHTML = `<span class="type-pill ${tp.cls}">${escapeHtml(tp.label)}</span>`;
      document.getElementById('detail-desc').textContent = item.description || 'No description provided.';

      const swapWrap = document.getElementById('detail-swap-wrap');
      if (item.type === 'swap' && item.swap_details?.desired_description) {
        document.getElementById('detail-swap-desc').textContent = item.swap_details.desired_description;
        swapWrap.classList.remove('is-hidden');
      } else {
        swapWrap.classList.add('is-hidden');
      }

      const imgEl = document.getElementById('detail-img');
      if (item.image_url) {
        imgEl.src = item.image_url;
        imgEl.classList.remove('is-hidden');
      } else {
        imgEl.classList.add('is-hidden');
      }

      deleteBtn.disabled = false;
      deleteBtn.textContent = item.status === 'removed' ? 'Delete permanently' : 'Hide item';
      openModalDialog(modal);
    },
  };
}

const modalReturnFocus = new WeakMap();

export function openModalDialog(modal) {
  if (!modal) return;
  modalReturnFocus.set(modal, document.activeElement);
  modal.classList.add('active');
  const focusable =
    modal.querySelector('[autofocus]:not([disabled])') ||
    modal.querySelector('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
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

import { request } from '../api.js';
import { bindLogoutConfirm } from './logout-modal.js';

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
      await request(`/admin/items/${targetItem.id}`, { method: 'DELETE' });
      closeModalDialog(modal);
      await onDeleted?.(targetItem);
    } catch (error) {
      errorEl.textContent = error.message || 'Unable to delete item.';
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

      deleteBtn.disabled = item.status === 'removed';
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

export function enhanceSelect(selectEl) {
  if (!selectEl) return { sync: () => {} };

  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  if (selectEl.getAttribute('aria-label')) {
    trigger.setAttribute('aria-label', selectEl.getAttribute('aria-label'));
  }

  const labelSpan = document.createElement('span');
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '14');
  chevron.setAttribute('height', '14');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.2');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.classList.add('custom-select-chevron');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '6 9 12 15 18 9');
  chevron.appendChild(poly);
  trigger.append(labelSpan, chevron);

  const menu = document.createElement('ul');
  menu.className = 'custom-select-menu is-hidden';
  menu.setAttribute('role', 'listbox');

  const closeMenu = () => {
    wrapper.classList.remove('open');
    menu.classList.add('is-hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const openMenu = () => {
    document.querySelectorAll('.custom-select.open').forEach((other) => {
      if (other !== wrapper) {
        other.classList.remove('open');
        other.querySelector('.custom-select-menu')?.classList.add('is-hidden');
        other.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
      }
    });
    wrapper.classList.add('open');
    menu.classList.remove('is-hidden');
    trigger.setAttribute('aria-expanded', 'true');
  };

  const sync = () => {
    const selectedOpt = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    labelSpan.textContent = selectedOpt ? selectedOpt.textContent : '';
    menu.innerHTML = '';

    Array.from(selectEl.options).forEach((opt) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'custom-select-option';
      if (opt.value === selectEl.value) btn.classList.add('selected');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(opt.value === selectEl.value));
      btn.textContent = opt.textContent;
      btn.addEventListener('click', () => {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change'));
        sync();
        closeMenu();
        trigger.focus();
      });
      li.appendChild(btn);
      menu.appendChild(li);
    });
  };

  trigger.addEventListener('click', () => {
    if (wrapper.classList.contains('open')) closeMenu();
    else openMenu();
  });

  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!wrapper.classList.contains('open')) openMenu();
      const opts = [...menu.querySelectorAll('.custom-select-option')];
      const target = menu.querySelector('.custom-select-option.selected') || opts[0];
      target?.focus();
    }
  });

  menu.addEventListener('keydown', (e) => {
    const opts = [...menu.querySelectorAll('.custom-select-option')];
    const idx = opts.indexOf(document.activeElement);
    if (opts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      opts[(idx + 1) % opts.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      opts[(idx - 1 + opts.length) % opts.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      opts[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      opts[opts.length - 1].focus();
    } else if (e.key === 'Tab') {
      closeMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) closeMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && wrapper.classList.contains('open')) {
      closeMenu();
      trigger.focus();
    }
  });

  selectEl.addEventListener('change', sync);
  selectEl.classList.add('is-hidden');
  selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  wrapper.append(trigger, menu);
  sync();

  return { sync };
}

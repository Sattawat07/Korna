import { request } from '../api.js';

let modalEl = null;
let returnFocusEl = null;

function ensureLogoutModal({ title, description }) {
  if (modalEl) {
    modalEl.querySelector('#shared-logout-title').textContent = title;
    modalEl.querySelector('#shared-logout-desc').textContent = description;
    return modalEl;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'korna-logout-backdrop';
  backdrop.id = 'shared-logout-modal';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', 'shared-logout-title');

  backdrop.innerHTML = `
    <div class="korna-logout-card">
      <button type="button" class="korna-logout-close" aria-label="Close" autofocus>✕</button>
      <h2 class="korna-logout-title" id="shared-logout-title"></h2>
      <p class="korna-logout-desc" id="shared-logout-desc"></p>
      <div class="korna-logout-actions">
        <button type="button" class="korna-logout-confirm">Log out</button>
      </div>
    </div>
  `;

  backdrop.querySelector('#shared-logout-title').textContent = title;
  backdrop.querySelector('#shared-logout-desc').textContent = description;

  const closeBtn = backdrop.querySelector('.korna-logout-close');
  const confirmBtn = backdrop.querySelector('.korna-logout-confirm');

  const close = () => {
    backdrop.classList.remove('active');
    if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
      returnFocusEl.focus();
    }
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = [closeBtn, confirmBtn].filter((el) => !el.disabled);
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

  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      // Redirect to login even if session already expired
    }
    window.location.replace('./login.html');
  });

  document.body.appendChild(backdrop);
  modalEl = backdrop;
  return backdrop;
}

export function bindLogoutConfirm(
  triggerBtn,
  {
    title = 'Log out of KORNA?',
    description = 'You will need to sign in again to continue.',
  } = {},
) {
  if (!triggerBtn) return;
  triggerBtn.addEventListener('click', () => {
    const modal = ensureLogoutModal({ title, description });
    returnFocusEl = document.activeElement;
    modal.classList.add('active');
    modal.querySelector('.korna-logout-close')?.focus();
  });
}

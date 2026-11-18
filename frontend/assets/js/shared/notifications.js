// Popup การแจ้งเตือนที่ปุ่มกระดิ่ง
// API: GET /api/notifications, PATCH /api/notifications/:id/read, GET /api/items/:id (ชื่อโพสต์)
//      DELETE /api/notifications/read (Clear read), DELETE /api/notifications (Clear all)
import { request } from '../api.js';
import { icon } from './icons.js';
import { escapeHtml, formatRelative } from './format.js';
import { errorText } from './session.js';

const titleCache = new Map(); // item_id -> ชื่อโพสต์

async function loadTitles(ids) {
  const missing = [...new Set(ids)].filter((id) => !titleCache.has(id));
  await Promise.all(
    missing.map(async (id) => {
      try {
        const data = await request(`/items/${id}`);
        titleCache.set(id, data.item.title);
      } catch {
        titleCache.set(id, null); // โพสต์ถูกซ่อนแล้ว หรือโหลดไม่ได้
      }
    }),
  );
}

function message(n) {
  const who = `<strong>${escapeHtml(n.actor.name)}</strong>`;
  const title = titleCache.get(n.item_id);
  const item = title ? `<strong>${escapeHtml(title)}</strong>` : 'your post';
  if (n.type === 'request_received') return `${who} sent a request for ${item}`;
  const theirItem = title ? `<strong>${escapeHtml(title)}</strong>` : 'an item';
  return n.decision === 'accepted'
    ? `Your request for ${theirItem} was accepted`
    : `Your request for ${theirItem} was declined`;
}

/** คำขอใหม่ → รายละเอียดโพสต์ของฉัน, ผลการตัดสินใจ → คำขอที่ฉันส่งในแท็บ Activity */
function target(n) {
  return n.type === 'request_received' ? `./profile.html#item-${n.item_id}` : `./profile.html#request-${n.request_id}`;
}

export function setupNotifications() {
  const buttons = Array.from(document.querySelectorAll('[data-notifications]'));
  if (!buttons.length) return;

  const panel = document.createElement('div');
  panel.className = 'notif';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'การแจ้งเตือน');
  panel.hidden = true;
  document.body.append(panel);

  let notifications = [];
  let unread = 0;
  let total = 0;

  const renderBadges = () => {
    buttons.forEach((btn) => {
      btn.classList.add('has-badge');
      btn.dataset.badge = unread > 9 ? '9+' : String(unread);
      btn.toggleAttribute('data-badge-hidden', unread === 0);
      btn.setAttribute('aria-label', unread ? `การแจ้งเตือน (${unread} ยังไม่อ่าน)` : 'การแจ้งเตือน');
    });
  };

  let confirmTimer = 0;

  const renderPanel = (body, { actions = false } = {}) => {
    clearTimeout(confirmTimer);
    // นับจากยอดรวมของเซิร์ฟเวอร์ ไม่ใช่แค่ 20 รายการที่โหลดมา
    const hasRead = total > unread;
    panel.innerHTML = `
      <div class="notif__head">
        <p class="notif__title">Notifications</p>
        <span class="notif__count">${unread} unread</span>
      </div>
      <ul class="notif__list">${body}</ul>
      ${
        actions
          ? `<div class="notif__foot">
        <button type="button" class="notif__action" data-clear="read" ${hasRead ? '' : 'disabled'}
          title="${hasRead ? 'Remove notifications you have already read' : 'No read notifications to clear'}">Clear read</button>
        <button type="button" class="notif__action notif__action--danger" data-clear="all">Clear all</button>
      </div>`
          : ''
      }`;
  };

  const renderList = () => {
    if (!notifications.length) return renderPanel('<li class="notif__empty">No notifications yet.</li>');
    renderPanel(
      notifications
        .map((n) => {
          const kind = n.type === 'request_received' ? 'send' : n.decision === 'accepted' ? 'gift' : 'close';
          const tone = n.type === 'request_decided' ? `notif__icon--${n.decision}` : '';
          const avatar = n.actor.avatar_url
            ? `<span class="avatar notif__icon"><img src="${escapeHtml(n.actor.avatar_url)}" alt="" /></span>`
            : `<span class="avatar notif__icon ${tone}">${icon(kind)}</span>`;
          return `<li><a class="notif__item ${n.read_at ? '' : 'is-unread'}" href="${target(n)}" data-notif="${n.id}">
            ${avatar}
            <span class="notif__body"><span class="notif__text">${message(n)}</span><span class="notif__time">${formatRelative(n.created_at)}</span></span>
          </a></li>`;
        })
        .join(''),
      { actions: true },
    );
  };

  const load = async () => {
    const data = await request('/notifications?limit=20');
    notifications = data.notifications;
    unread = data.unread_count;
    total = data.pagination?.total ?? notifications.length;
    renderBadges();
  };

  let anchor = null;
  const place = () => {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    panel.style.top = `${r.bottom + 10 + window.scrollY}px`;
    panel.style.right = `${Math.max(16, document.documentElement.clientWidth - r.right)}px`;
  };

  const close = ({ restoreFocus = false } = {}) => {
    if (panel.hidden) return;
    panel.hidden = true;
    buttons.forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (restoreFocus) anchor?.focus();
  };

  const links = () => Array.from(panel.querySelectorAll('[data-notif]'));

  const open = async (btn, { focusFirst = false } = {}) => {
    anchor = btn;
    btn.after(panel); // วางต่อจากปุ่ม เพื่อให้กด Tab เข้าไปในรายการได้ทันที
    renderPanel('<li class="notif__empty">Loading...</li>');
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    place();
    try {
      await load();
      await loadTitles(notifications.map((n) => n.item_id));
      if (panel.hidden || anchor !== btn) return;
      renderList();
      if (focusFirst) links()[0]?.focus();
    } catch (error) {
      renderPanel(`<li class="notif__empty">${escapeHtml(errorText(error, 'Unable to load notifications.'))}</li>`);
    }
  };

  buttons.forEach((btn) => {
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!panel.hidden && anchor === btn) return close();
      open(btn, { focusFirst: e.detail === 0 }); // กดด้วย Enter/Space → โฟกัสรายการแรก
    });
  });

  const clearNotifications = async (btn) => {
    const all = btn.dataset.clear === 'all';
    if (all && !btn.classList.contains('is-confirming')) {
      btn.classList.add('is-confirming');
      btn.textContent = 'Click again to clear all';
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => {
        btn.classList.remove('is-confirming');
        btn.textContent = 'Clear all';
      }, 4000);
      return;
    }
    panel.querySelectorAll('[data-clear]').forEach((b) => {
      b.disabled = true;
    });
    btn.textContent = 'Clearing...';
    try {
      await request(all ? '/notifications' : '/notifications/read', { method: 'DELETE' });
      await load();
      renderList();
      (panel.querySelector('[data-clear]:not(:disabled)') ?? anchor)?.focus();
    } catch (error) {
      renderList();
      const foot = panel.querySelector('.notif__foot');
      foot?.insertAdjacentHTML('afterbegin', `<span class="notif__error">${escapeHtml(errorText(error, 'Unable to clear notifications.'))}</span>`);
    }
  };

  panel.addEventListener('click', async (e) => {
    e.stopPropagation();
    const clearBtn = e.target.closest('[data-clear]');
    if (clearBtn) return clearNotifications(clearBtn);
    const link = e.target.closest('[data-notif]');
    if (!link) return;
    e.preventDefault();
    const id = Number(link.dataset.notif);
    const n = notifications.find((x) => x.id === id);
    if (n && !n.read_at) {
      try {
        await request(`/notifications/${id}/read`, { method: 'PATCH' });
        n.read_at = new Date().toISOString();
        unread = Math.max(0, unread - 1);
        renderBadges();
      } catch {
        /* ถึงบันทึกว่าอ่านแล้วไม่สำเร็จ ก็ยังพาไปหน้าที่เกี่ยวข้องได้ */
      }
    }
    close();
    window.location.href = link.getAttribute('href');
  });

  // ลูกศรขึ้น/ลงเลื่อนระหว่างรายการ
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = links();
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
    list[next].focus();
  });
  // Tab ออกจากรายการ → ปิด
  panel.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !panel.contains(e.relatedTarget) && !buttons.includes(e.relatedTarget)) close();
  });

  document.addEventListener('click', () => close());
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || panel.hidden) return;
    close({ restoreFocus: panel.contains(document.activeElement) || buttons.includes(document.activeElement) });
  });
  window.addEventListener('resize', place);

  load().catch(() => {
    /* ถ้าโหลดจำนวนที่ยังไม่อ่านไม่ได้ ก็ซ่อน badge ไว้ */
  });
}

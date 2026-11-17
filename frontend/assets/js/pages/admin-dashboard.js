// Admin Dashboard page logic — Vanilla JS
import { request } from '../api.js';
import {
  avatarHtml,
  closeModalDialog,
  escapeHtml,
  getStatusDisplay,
  getTypeDisplay,
  loadAdminProfile,
  openModalDialog,
  sanitizeImageUrl,
  setupLogoutModal,
} from '../shared/admin-common.js';

const pctOf = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** ข้อความในกล่อง tooltip: หัวข้อ + แถว [ชื่อ, ค่า] */
function tipHtml(title, rows) {
  return `<strong>${escapeHtml(title)}</strong>${rows
    .map(([label, value, dot]) => `<span class="chart-tip-row">${dot ? `<i class="legend-dot ${dot}"></i>` : ''}${escapeHtml(label)}<b>${escapeHtml(value)}</b></span>`)
    .join('')}`;
}


function formatShortDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatRelativeTime(isoString) {
  const diffMin = Math.max(1, Math.floor((Date.now() - new Date(isoString).getTime()) / 60000));
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${Math.floor(diffHr / 24)} d ago`;
}

function renderStats(stats) {
  const pendingCount = stats.requests_by_status?.pending ?? 0;
  const acceptedCount = stats.requests_by_status?.accepted ?? 0;
  const rejectedCount = stats.requests_by_status?.rejected ?? 0;
  const availableCount = stats.by_status?.available ?? 0;

  document.getElementById('kpi-total-users').textContent = stats.total_users ?? 0;
  document.getElementById('kpi-listed-items').textContent = stats.active ?? 0;
  document.getElementById('kpi-available-sub').textContent = `${availableCount} available now`;
  document.getElementById('kpi-total-requests').textContent = stats.total_requests ?? 0;
  document.getElementById('kpi-pending').textContent = pendingCount;
  document.getElementById('kpi-completed').textContent = acceptedCount;
  document.getElementById('cta-pending-count').textContent = pendingCount;

  // Date range pill
  const days = stats.requests_last_7_days || [];
  if (days.length > 0) {
    const first = formatShortDate(days[0].date);
    const last = formatShortDate(days[days.length - 1].date);
    document.getElementById('date-range-text').textContent = `${first} – ${last}`;
  }

  // Activity bar chart
  const chartEl = document.getElementById('activity-chart');
  const maxVal = Math.max(
    1,
    ...days.map((d) => Math.max(d.accepted || 0, d.pending || 0))
  );
  chartEl.innerHTML = days
    .map((day) => {
      const acc = day.accepted || 0;
      const pen = day.pending || 0;
      const rej = day.rejected || 0;
      const dayTotal = acc + pen + rej;
      const accHeight = Math.round((acc / maxVal) * 95);
      const penHeight = Math.round((pen / maxVal) * 95);
      const longDate = new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const tip = tipHtml(`${longDate} · ${dayTotal} request${dayTotal === 1 ? '' : 's'}`, [
        ['Completed', `${acc} · ${pctOf(acc, dayTotal)}%`, 'dot-brown'],
        ['Pending', `${pen} · ${pctOf(pen, dayTotal)}%`, 'dot-yellow'],
        ['Cancelled', `${rej} · ${pctOf(rej, dayTotal)}%`, 'dot-taupe'],
      ]);
      return `
        <div class="bar-day" tabindex="0" data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(`${longDate}: ${acc} completed, ${pen} pending, ${rej} cancelled`)}">
          <div class="bar-pair">
            <div class="bar-col">
              <span class="bar-count">${acc}</span>
              <div class="bar-fill completed" style="height: ${accHeight}px"></div>
            </div>
            <div class="bar-col">
              <div class="bar-fill pending" style="height: ${penHeight}px"></div>
            </div>
          </div>
          <span class="bar-date">${formatShortDate(day.date)}</span>
        </div>
      `;
    })
    .join('');

  // Requests breakdown
  const reqTotal = acceptedCount + pendingCount + rejectedCount;
  const pct = (n) => (reqTotal > 0 ? Math.round((n / reqTotal) * 100) : 0);

  document.getElementById('requests-summary-sub').textContent = `${reqTotal} requests total`;
  document.getElementById('seg-completed').style.width = `${pct(acceptedCount)}%`;
  document.getElementById('seg-pending').style.width = `${pct(pendingCount)}%`;
  document.getElementById('seg-cancelled').style.width = `${pct(rejectedCount)}%`;

  document.getElementById('req-completed-count').textContent = acceptedCount;
  document.getElementById('req-completed-pct').textContent = `${pct(acceptedCount)}%`;
  document.getElementById('req-pending-count').textContent = pendingCount;
  document.getElementById('req-pending-pct').textContent = `${pct(pendingCount)}%`;
  document.getElementById('req-cancelled-count').textContent = rejectedCount;
  document.getElementById('req-cancelled-pct').textContent = `${pct(rejectedCount)}%`;
  setSegmentTips(reqTotal, 'request', [
    ['seg-completed', 'Completed', acceptedCount, 'dot-brown'],
    ['seg-pending', 'Pending', pendingCount, 'dot-yellow'],
    ['seg-cancelled', 'Cancelled', rejectedCount, 'dot-taupe'],
  ]);

  renderPostsByType(stats.by_type);
  renderPostsByCategory(stats.by_category);

  renderRecent(stats.recent_requests || []);
}

/**
 * ใส่ tooltip ให้แถบสัดส่วน และให้แถวคำอธิบาย (legend) ชี้แล้วเน้นแถบเดียวกัน
 * parts: [id ของแถบ, ชื่อ, จำนวน, สีจุด]
 */
function setSegmentTips(total, noun, parts) {
  parts.forEach(([segId, label, count, dot]) => {
    const tip = tipHtml(label, [[`${count} ${noun}${count === 1 ? '' : 's'}`, `${pctOf(count, total)}%`, dot]]);
    const seg = document.getElementById(segId);
    seg.dataset.tip = tip;
    const legendRow = document.querySelector(`[data-seg="${segId}"]`);
    if (legendRow) {
      legendRow.dataset.tip = tip;
      legendRow.tabIndex = 0;
    }
  });
}

// ---------- Recent activity ----------
const REQUEST_STATUS = {
  accepted: { label: 'Completed', dot: 'dot-brown', cls: 'status-completed' },
  pending: { label: 'Pending', dot: 'dot-yellow', cls: 'status-pending' },
  rejected: { label: 'Cancelled', dot: 'dot-taupe', cls: 'status-available' },
};
const itemCache = new Map(); // item_id -> item | null (ถูกลบแล้ว/หาไม่เจอ)
let recentRequests = [];

let removedItemsPromise = null; // โพสต์ที่ถูกลบ ดูได้ผ่าน API admin เท่านั้น (โหลดครั้งเดียว)

async function fetchItem(id) {
  if (itemCache.has(id)) return itemCache.get(id);
  let item = null;
  try {
    item = (await request(`/items/${id}`)).item;
  } catch {
    removedItemsPromise ??= request('/admin/items?status=removed&limit=50')
      .then((res) => res.items || [])
      .catch(() => []);
    item = (await removedItemsPromise).find((i) => Number(i.id) === Number(id)) ?? null;
  }
  itemCache.set(id, item);
  return item;
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function renderRecent(recent) {
  recentRequests = recent;
  const recentEl = document.getElementById('recent-activity-list');
  if (recent.length === 0) {
    recentEl.innerHTML = '<li class="recent-item"><span class="recent-desc">No recent requests.</span></li>';
    return;
  }
  const draw = () => {
    recentEl.innerHTML = recent
      .map((req) => {
        const st = REQUEST_STATUS[req.status] ?? REQUEST_STATUS.pending;
        const item = itemCache.get(req.item_id);
        const itemText = item
          ? `${item.title}${item.status === 'removed' ? ' (removed)' : ''}`
          : item === null ? `Item #${req.item_id} (unavailable)` : `Item #${req.item_id}`;
        return `
        <li class="recent-item">
          <button type="button" class="recent-btn" data-request-id="${req.id}" aria-label="View request #${req.id}">
            <span class="recent-left">
              <span class="legend-dot ${st.dot}"></span>
              <span>
                <span class="recent-title">Request #${req.id} · ${st.label}</span>
                <span class="recent-desc">${escapeHtml(itemText)}</span>
              </span>
            </span>
            <span class="recent-time">${formatRelativeTime(req.created_at)}<span class="recent-chevron" aria-hidden="true">&rsaquo;</span></span>
          </button>
        </li>`;
      })
      .join('');
  };
  draw();
  // โหลดชื่อโพสต์มาแทน "Item #N"
  Promise.all([...new Set(recent.map((r) => r.item_id))].map(fetchItem)).then(draw);
}

const recentModal = document.getElementById('recent-modal');

async function openRecent(requestId) {
  const req = recentRequests.find((r) => r.id === requestId);
  if (!req) return;
  const st = REQUEST_STATUS[req.status] ?? REQUEST_STATUS.pending;
  document.getElementById('recent-modal-title').textContent = `Request #${req.id}`;
  document.getElementById('recent-modal-status').innerHTML = `<span class="status-pill ${st.cls}">${st.label}</span>`;
  document.getElementById('recent-modal-time').textContent = `Sent ${formatDateTime(req.created_at)} · ${formatRelativeTime(req.created_at)}`;
  const body = document.getElementById('recent-modal-item');
  const link = document.getElementById('recent-modal-link');
  body.innerHTML = '<p class="subtitle">Loading post...</p>';
  link.hidden = true;
  recentDeleteBtn.hidden = true;
  selectedItem = null;
  openModalDialog(recentModal);

  const item = await fetchItem(req.item_id);
  if (!recentModal.classList.contains('active')) return;
  if (!item) {
    body.innerHTML = `<p class="subtitle">Post #${req.item_id} is no longer available.</p>`;
    return;
  }
  selectedItem = item;
  const img = sanitizeImageUrl(item.image_url);
  const itemStatus = getStatusDisplay(item.status);
  const itemType = getTypeDisplay(item.type);
  const wants = item.type === 'swap' ? item.swap_details?.desired_description : '';
  body.innerHTML = `
    ${img ? `<img class="modal-detail-img" src="${img}" alt="">` : ''}
    <div class="recent-modal-grid">
      <div>
        <div class="meta-label">Post</div>
        <div class="meta-value">${escapeHtml(item.title)}</div>
        <div class="recent-desc"><span class="type-pill ${itemType.cls}">${itemType.label}</span>${escapeHtml(item.category?.name || 'Uncategorized')}</div>
      </div>
      <div>
        <div class="meta-label">Owner</div>
        <div class="owner-cell">${avatarHtml(item.owner?.avatar_url)}<span class="meta-value">${escapeHtml(item.owner?.name || 'Unknown')}</span></div>
      </div>
      <div>
        <div class="meta-label">Post status</div>
        <span class="status-pill ${itemStatus.cls}">${escapeHtml(itemStatus.label)}</span>
      </div>
    </div>
    ${item.description ? `<div class="meta-label">Description</div><p class="recent-modal-text">${escapeHtml(item.description)}</p>` : ''}
    ${wants ? `<div class="meta-label">Looking to swap for</div><p class="recent-modal-text">${escapeHtml(wants)}</p>` : ''}`;
  // รูปเสีย/ไฟล์หาย → ซ่อนกรอบรูปแทนไอคอนรูปแตก
  body.querySelector('.modal-detail-img')?.addEventListener('error', (e) => e.target.remove(), { once: true });
  link.href = `admin-items.html?q=${encodeURIComponent(item.title)}`;
  link.hidden = false;
  recentDeleteBtn.hidden = item.status === 'removed';
}

document.getElementById('recent-activity-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-request-id]');
  if (btn) openRecent(Number(btn.dataset.requestId));
});
recentModal.addEventListener('click', (e) => {
  if (e.target === recentModal || e.target.closest('[data-close-recent]')) closeModalDialog(recentModal);
});

// ---------- ลบโพสต์จากป๊อปอัป ----------
let selectedItem = null;
const recentDeleteBtn = document.getElementById('recent-delete-btn');
const deleteModal = document.getElementById('delete-modal');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
const deleteError = document.getElementById('delete-error');

recentDeleteBtn.addEventListener('click', () => {
  if (!selectedItem) return;
  closeModalDialog(recentModal);
  deleteError.textContent = '';
  document.getElementById('delete-item-name').textContent = selectedItem.title;
  openModalDialog(deleteModal);
});
['delete-close-btn', 'delete-cancel-btn'].forEach((id) =>
  document.getElementById(id).addEventListener('click', () => closeModalDialog(deleteModal)),
);
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeModalDialog(deleteModal);
});
deleteConfirmBtn.addEventListener('click', async () => {
  if (!selectedItem) return;
  deleteConfirmBtn.disabled = true;
  deleteError.textContent = '';
  try {
    await request(`/admin/items/${selectedItem.id}`, { method: 'DELETE' });
    closeModalDialog(deleteModal);
    itemCache.clear();
    removedItemsPromise = null;
    await loadStats();
  } catch (error) {
    deleteError.textContent = error.message || 'Unable to delete item.';
  } finally {
    deleteConfirmBtn.disabled = false;
  }
});

// ---------- Tooltip ของกราฟ (ชี้เมาส์ หรือกด Tab มาที่แท่ง/แถว) ----------
const chartTip = document.createElement('div');
chartTip.className = 'chart-tip';
chartTip.setAttribute('role', 'tooltip');
document.body.append(chartTip);
let tipTarget = null;

function placeTip(x, y) {
  const w = chartTip.offsetWidth;
  const h = chartTip.offsetHeight;
  const left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2));
  const top = y - h - 14 < 8 ? y + 18 : y - h - 14;
  chartTip.style.left = `${left}px`;
  chartTip.style.top = `${top}px`;
}

function showTip(el, x, y) {
  tipTarget = el;
  chartTip.innerHTML = el.dataset.tip;
  chartTip.classList.add('is-visible');
  if (x === undefined) {
    const r = el.getBoundingClientRect();
    placeTip(r.left + r.width / 2, r.top);
  } else {
    placeTip(x, y);
  }
  highlight(el);
}

function hideTip() {
  tipTarget = null;
  chartTip.classList.remove('is-visible');
  highlight(null);
}

/** ชี้แถว legend หรือแถบ → แถบอื่นในกล่องเดียวกันจางลง */
function highlight(el) {
  document.querySelectorAll('.stacked-bar.is-focused').forEach((bar) => bar.classList.remove('is-focused'));
  document.querySelectorAll('.stacked-seg.is-active').forEach((seg) => seg.classList.remove('is-active'));
  if (!el) return;
  const seg = el.classList.contains('stacked-seg') ? el : document.getElementById(el.dataset.seg || '');
  if (seg) {
    seg.classList.add('is-active');
    seg.parentElement.classList.add('is-focused');
  }
}

document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el && el !== tipTarget) showTip(el, e.clientX, e.clientY);
  else if (!el && tipTarget) hideTip();
});
document.addEventListener('pointermove', (e) => {
  if (tipTarget) placeTip(e.clientX, e.clientY);
});
document.addEventListener('focusin', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el);
  else if (tipTarget) hideTip();
});
document.addEventListener('focusout', (e) => {
  if (e.target === tipTarget) hideTip();
});
window.addEventListener('scroll', hideTip, { passive: true });

// จำนวนโพสต์แยก Free / Swap (by_type — รวมโพสต์ที่ถูกลบด้วย ตามที่ API ระบุ)
function renderPostsByType(byType = {}) {
  const free = Number(byType.free ?? 0);
  const swap = Number(byType.swap ?? 0);
  const total = free + swap;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

  document.getElementById('type-summary-sub').textContent = `${total} posts total`;
  document.getElementById('seg-type-free').style.width = `${pct(free)}%`;
  document.getElementById('seg-type-swap').style.width = `${pct(swap)}%`;
  document.getElementById('type-free-count').textContent = free;
  document.getElementById('type-free-pct').textContent = `${pct(free)}%`;
  document.getElementById('type-swap-count').textContent = swap;
  document.getElementById('type-swap-pct').textContent = `${pct(swap)}%`;
  setSegmentTips(total, 'post', [
    ['seg-type-free', 'Free', free, 'dot-yellow'],
    ['seg-type-swap', 'Swap', swap, 'dot-brown'],
  ]);
}

// จำนวนโพสต์แยกหมวด (by_category) — เรียงมากไปน้อย แสดง 6 หมวดแรก
const CATEGORY_LIMIT = 6;

function renderPostsByCategory(byCategory = []) {
  const listEl = document.getElementById('category-bars');
  const sorted = [...byCategory].filter((c) => Number(c.total) > 0).sort((a, b) => b.total - a.total);
  const subEl = document.getElementById('category-summary-sub');

  if (sorted.length === 0) {
    subEl.textContent = 'No posts yet';
    listEl.innerHTML = '<li class="category-empty">No posts yet.</li>';
    return;
  }

  const shown = sorted.slice(0, CATEGORY_LIMIT);
  const rest = sorted.length - shown.length;
  subEl.textContent = rest > 0 ? `Top ${shown.length} of ${sorted.length} categories` : `${sorted.length} categories with posts`;
  const max = Math.max(...shown.map((c) => Number(c.total)));
  const allPosts = sorted.reduce((sum, c) => sum + Number(c.total), 0);

  listEl.innerHTML = shown
    .map((c) => {
      const width = Math.max(4, Math.round((Number(c.total) / max) * 100));
      const n = Number(c.total);
      const tip = tipHtml(c.name, [[`${n} post${n === 1 ? '' : 's'}`, `${pctOf(n, allPosts)}% of all posts`, 'dot-brown']]);
      return `
        <li tabindex="0" data-tip="${escapeHtml(tip)}">
          <span class="category-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
          <span class="category-track" aria-hidden="true"><span class="category-fill" style="width: ${width}%"></span></span>
          <strong>${Number(c.total)}</strong>
        </li>
      `;
    })
    .join('');
}

async function initDashboard() {
  await loadAdminProfile(document.getElementById('admin-name'));
  await loadStats();
}

async function loadStats() {
  try {
    const stats = await request('/admin/stats');
    renderStats(stats);
  } catch (error) {
    const listEl = document.getElementById('recent-activity-list');
    listEl.innerHTML = '<li class="recent-item"><span class="recent-desc"></span></li>';
    listEl.querySelector('.recent-desc').textContent = error.message || 'Unable to load dashboard stats.';
  }
}

setupLogoutModal({
  triggerBtn: document.getElementById('logout-btn'),
  modal: document.getElementById('logout-modal'),
  stayBtn: document.getElementById('logout-stay-btn'),
  confirmBtn: document.getElementById('logout-confirm-btn'),
  closeBtn: document.getElementById('logout-close-btn'),
});

initDashboard();

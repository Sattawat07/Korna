// Admin Dashboard page logic — Vanilla JS
import { request } from '../api.js';
import {
  closeModalDialog,
  escapeHtml,
  formatShortDate as formatFullShortDate,
  getStatusDisplay,
  getTypeDisplay,
  loadAdminProfile,
  openModalDialog,
  setupLogoutModal,
} from '../shared/admin-common.js';

let itemsById = new Map();
let selectedItem = null;

const detailModal = document.getElementById('item-detail-modal');
const detailCloseBtn = document.getElementById('detail-close-btn');
const detailDeleteBtn = document.getElementById('detail-delete-btn');
const deleteModal = document.getElementById('delete-modal');
const deleteCloseBtn = document.getElementById('delete-close-btn');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
const deleteError = document.getElementById('delete-error');

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
      const totalDay = acc + pen + rej;
      const accHeight = Math.round((acc / maxVal) * 95);
      const penHeight = Math.round((pen / maxVal) * 95);
      const shortDate = formatShortDate(day.date);
      return `
        <div class="bar-day" tabindex="0" aria-label="${shortDate}: ${acc} completed, ${pen} pending, ${rej} cancelled">
          <div class="chart-tooltip" role="tooltip">
            <div class="tooltip-title">${shortDate} · ${totalDay} requests</div>
            <div class="tooltip-row"><span class="legend-dot dot-brown"></span>Completed: <strong>${acc}</strong></div>
            <div class="tooltip-row"><span class="legend-dot dot-yellow"></span>Pending: <strong>${pen}</strong></div>
            <div class="tooltip-row"><span class="legend-dot dot-taupe"></span>Cancelled: <strong>${rej}</strong></div>
          </div>
          <div class="bar-pair">
            <div class="bar-col">
              <span class="bar-count">${acc}</span>
              <div class="bar-fill completed" style="height: ${accHeight}px"></div>
            </div>
            <div class="bar-col">
              <span class="bar-count">${pen > 0 ? pen : ''}</span>
              <div class="bar-fill pending" style="height: ${penHeight}px"></div>
            </div>
          </div>
          <span class="bar-date">${shortDate}</span>
        </div>
      `;
    })
    .join('');

  // Requests breakdown
  const reqTotal = acceptedCount + pendingCount + rejectedCount;
  const pct = (n) => (reqTotal > 0 ? Math.round((n / reqTotal) * 100) : 0);

  document.getElementById('requests-summary-sub').textContent = `${reqTotal} requests total`;
  const segCompleted = document.getElementById('seg-completed');
  const segPending = document.getElementById('seg-pending');
  const segCancelled = document.getElementById('seg-cancelled');

  segCompleted.style.width = `${pct(acceptedCount)}%`;
  segPending.style.width = `${pct(pendingCount)}%`;
  segCancelled.style.width = `${pct(rejectedCount)}%`;

  segCompleted.dataset.tooltip = `Completed: ${acceptedCount} requests (${pct(acceptedCount)}%)`;
  segPending.dataset.tooltip = `Pending: ${pendingCount} requests (${pct(pendingCount)}%)`;
  segCancelled.dataset.tooltip = `Cancelled: ${rejectedCount} requests (${pct(rejectedCount)}%)`;

  document.getElementById('req-completed-count').textContent = acceptedCount;
  document.getElementById('req-completed-pct').textContent = `${pct(acceptedCount)}%`;
  document.getElementById('req-pending-count').textContent = pendingCount;
  document.getElementById('req-pending-pct').textContent = `${pct(pendingCount)}%`;
  document.getElementById('req-cancelled-count').textContent = rejectedCount;
  document.getElementById('req-cancelled-pct').textContent = `${pct(rejectedCount)}%`;

  renderPostsByType(stats.by_type);
  renderPostsByCategory(stats.by_category);

  // Recent activity
  const recentEl = document.getElementById('recent-activity-list');
  const recent = stats.recent_requests || [];
  if (recent.length === 0) {
    recentEl.innerHTML = '<li class="recent-item"><span class="recent-desc">No recent requests.</span></li>';
    return;
  }

  recentEl.innerHTML = recent
    .map((reqItem) => {
      const dotClass = reqItem.status === 'accepted' ? 'dot-brown' : reqItem.status === 'pending' ? 'dot-yellow' : 'dot-taupe';
      const statusLabel = reqItem.status === 'accepted' ? 'Completed' : reqItem.status === 'rejected' ? 'Cancelled' : 'Pending';
      const fullItem = itemsById.get(Number(reqItem.item_id));
      const itemLabel = fullItem
        ? `${escapeHtml(fullItem.title)} · by ${escapeHtml(fullItem.owner?.name || 'Unknown')}`
        : `Item #${escapeHtml(reqItem.item_id)}`;
      return `
        <li class="recent-item">
          <button type="button" class="recent-item-btn" data-item-id="${escapeHtml(reqItem.item_id)}">
            <div class="recent-left">
              <span class="legend-dot ${dotClass}"></span>
              <div>
                <div class="recent-title">Request #${escapeHtml(reqItem.id)} · ${statusLabel}</div>
                <div class="recent-desc">${itemLabel}</div>
              </div>
            </div>
            <span class="recent-time">${formatRelativeTime(reqItem.created_at)}</span>
          </button>
        </li>
      `;
    })
    .join('');
}

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

  listEl.innerHTML = shown
    .map((c) => {
      const width = Math.max(4, Math.round((Number(c.total) / max) * 100));
      return `
        <li>
          <span class="category-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
          <span class="category-track" aria-hidden="true"><span class="category-fill" style="width: ${width}%"></span></span>
          <strong>${Number(c.total)}</strong>
        </li>
      `;
    })
    .join('');
}

function openDetailModal(item) {
  selectedItem = item;
  const st = getStatusDisplay(item.status);
  const tp = getTypeDisplay(item.type);
  document.getElementById('detail-title').textContent = item.title;
  document.getElementById('detail-sub').textContent =
    `${item.category?.name || 'Uncategorized'} · Listed ${formatFullShortDate(item.created_at)}`;
  document.getElementById('detail-owner').textContent = item.owner?.name || 'Unknown';
  document.getElementById('detail-status-wrap').innerHTML = `<span class="status-pill ${st.cls}">${st.label}</span>`;
  document.getElementById('detail-type-wrap').innerHTML = `<span class="type-pill ${tp.cls}">${tp.label}</span>`;
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

  detailDeleteBtn.disabled = item.status === 'removed';
  openModalDialog(detailModal);
}

document.getElementById('recent-activity-list')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-item-id]');
  if (!btn) return;
  const itemId = Number(btn.dataset.itemId);
  let item = itemsById.get(itemId);
  if (!item) {
    try {
      const res = await request(`/items/${itemId}`);
      item = res.item;
    } catch {
      try {
        const remRes = await request('/admin/items?status=removed&limit=50');
        item = (remRes.items || []).find((i) => Number(i.id) === itemId) || null;
      } catch {
        return;
      }
    }
  }
  if (item) openDetailModal(item);
});

detailCloseBtn?.addEventListener('click', () => closeModalDialog(detailModal));
detailModal?.addEventListener('click', (e) => {
  if (e.target === detailModal) closeModalDialog(detailModal);
});
detailDeleteBtn?.addEventListener('click', () => {
  closeModalDialog(detailModal);
  if (selectedItem) {
    deleteError.textContent = '';
    document.getElementById('delete-item-name').textContent = selectedItem.title;
    openModalDialog(deleteModal);
  }
});

deleteCloseBtn?.addEventListener('click', () => closeModalDialog(deleteModal));
deleteCancelBtn?.addEventListener('click', () => closeModalDialog(deleteModal));
deleteModal?.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeModalDialog(deleteModal);
});
deleteConfirmBtn?.addEventListener('click', async () => {
  if (!selectedItem) return;
  deleteConfirmBtn.disabled = true;
  deleteError.textContent = '';
  try {
    await request(`/admin/items/${selectedItem.id}`, { method: 'DELETE' });
    closeModalDialog(deleteModal);
    await initDashboard();
  } catch (error) {
    deleteError.textContent = error.message || 'Unable to delete item.';
  } finally {
    deleteConfirmBtn.disabled = false;
  }
});

async function initDashboard() {
  await loadAdminProfile(document.getElementById('admin-name'));

  try {
    const [stats, itemsRes] = await Promise.all([
      request('/admin/stats'),
      request('/admin/items?limit=50').catch(() => ({ items: [] })),
    ]);
    itemsById = new Map((itemsRes.items || []).map((i) => [Number(i.id), i]));
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

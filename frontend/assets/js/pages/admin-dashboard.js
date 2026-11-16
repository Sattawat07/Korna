// Admin Dashboard page logic — Vanilla JS
import { request } from '../api.js';
import { loadAdminProfile, setupLogoutModal } from '../shared/admin-common.js';

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
      const accHeight = Math.round((acc / maxVal) * 95);
      const penHeight = Math.round((pen / maxVal) * 95);
      return `
        <div class="bar-day">
          <div class="bar-pair">
            <div class="bar-col">
              <span class="bar-count">${acc}</span>
              <div class="bar-fill completed" style="height: ${accHeight}px" title="Completed: ${acc}"></div>
            </div>
            <div class="bar-col">
              <div class="bar-fill pending" style="height: ${penHeight}px" title="Pending: ${pen}"></div>
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

  // Recent activity
  const recentEl = document.getElementById('recent-activity-list');
  const recent = stats.recent_requests || [];
  if (recent.length === 0) {
    recentEl.innerHTML = '<li class="recent-item"><span class="recent-desc">No recent requests.</span></li>';
    return;
  }

  recentEl.innerHTML = recent
    .map((item) => {
      const dotClass = item.status === 'accepted' ? 'dot-brown' : item.status === 'pending' ? 'dot-yellow' : 'dot-taupe';
      const statusLabel = item.status === 'accepted' ? 'Completed' : item.status === 'rejected' ? 'Cancelled' : 'Pending';
      return `
        <li class="recent-item">
          <div class="recent-left">
            <span class="legend-dot ${dotClass}"></span>
            <div>
              <div class="recent-title">Request #${item.id} · ${statusLabel}</div>
              <div class="recent-desc">Item #${item.item_id}</div>
            </div>
          </div>
          <span class="recent-time">${formatRelativeTime(item.created_at)}</span>
        </li>
      `;
    })
    .join('');
}

async function initDashboard() {
  await loadAdminProfile(document.getElementById('admin-name'));

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

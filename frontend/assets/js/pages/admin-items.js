import { request } from '../api.js';
import {
  avatarHtml,
  enhanceSelect,
  escapeHtml,
  formatShortDate,
  getStatusDisplay,
  getTypeDisplay,
  loadAdminProfile,
  sanitizeImageUrl,
  setupAdminDeleteModal,
  setupAdminItemDetailModal,
  setupLogoutModal,
} from '../shared/admin-common.js';

const searchInput = document.getElementById('items-search');
const typeSelect = document.getElementById('type-select');
const categorySelect = document.getElementById('category-select');
const typeDropdown = enhanceSelect(typeSelect);
const categoryDropdown = enhanceSelect(categorySelect);
const tabBtns = document.querySelectorAll('.tab-btn');
const tbody = document.getElementById('items-tbody');
const totalLabel = document.getElementById('items-total-label');
const prevBtn = document.getElementById('prev-page-btn');
const nextBtn = document.getElementById('next-page-btn');
const resetBtn = document.getElementById('reset-filters-btn');

const deleteModalApi = setupAdminDeleteModal({
  onDeleted: async () => {
    const leavesList = currentStatus !== '' && currentStatus !== 'removed';
    if (leavesList && currentPage > 1 && currentItems.length <= 1) {
      currentPage -= 1;
    }
    await loadItems();
  },
});

const detailModalApi = setupAdminItemDetailModal({
  onDelete: (item) => deleteModalApi.open(item),
});

let currentPage = 1;
let currentStatus = '';
let currentItems = [];
let searchTimer = null;
let loadItemsSeq = 0;

async function loadCategories() {
  try {
    const data = await request('/categories');
    for (const cat of data.categories || []) {
      const opt = document.createElement('option');
      opt.value = String(cat.id);
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    }
    categoryDropdown.sync();
  } catch {
    // Ignore category load failure
  }
}

async function loadItems() {
  const seq = ++loadItemsSeq;
  const params = new URLSearchParams();
  params.set('page', String(currentPage));
  params.set('limit', '12');

  const q = searchInput.value.trim();
  if (q) params.set('q', q);
  if (currentStatus) params.set('status', currentStatus);
  if (typeSelect.value) params.set('type', typeSelect.value);
  if (categorySelect.value) params.set('category_id', categorySelect.value);

  try {
    const data = await request(`/admin/items?${params.toString()}`);
    if (seq !== loadItemsSeq) return;
    currentItems = data.items || [];
    const pag = data.pagination || { page: 1, total_pages: 1, total: currentItems.length };

    totalLabel.textContent = `${pag.total} items`;
    prevBtn.disabled = pag.page <= 1;
    nextBtn.disabled = pag.page >= pag.total_pages;

    renderItemsTable(currentItems);
  } catch (error) {
    if (seq !== loadItemsSeq) return;
    tbody.innerHTML = '<tr><td colspan="5"></td></tr>';
    tbody.querySelector('td').textContent = error.message || 'Unable to load items.';
  }
}

function renderItemsTable(items) {
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5">No items found.</td></tr>';
    return;
  }

  tbody.innerHTML = items
    .map((item) => {
      const st = getStatusDisplay(item.status);
      const tp = getTypeDisplay(item.type);
      const safeImg = sanitizeImageUrl(item.image_url);
      const thumb = safeImg
        ? `<img class="item-thumb" src="${safeImg}" alt="">`
        : '<span class="item-thumb-placeholder">No img</span>';
      const isRemoved = item.status === 'removed';

      return `
        <tr class="item-row-clickable" data-id="${escapeHtml(item.id)}" tabindex="0">
          <td>
            <div class="item-cell">
              ${thumb}
              <div>
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-cat"><span class="type-pill ${tp.cls}">${tp.label}</span>${escapeHtml(item.category?.name || 'Uncategorized')}</div>
              </div>
            </div>
          </td>
          <td>
            <div class="owner-cell">
              ${avatarHtml(item.owner?.avatar_url)}
              <span>${escapeHtml(item.owner?.name || 'Unknown')}</span>
            </div>
          </td>
          <td><span class="status-pill ${st.cls}">${escapeHtml(st.label)}</span></td>
          <td>${escapeHtml(formatShortDate(item.created_at))}</td>
          <td>
            <div class="action-group">
              <button type="button" class="btn-outline" data-action="delete" data-id="${escapeHtml(item.id)}" ${isRemoved ? 'disabled' : ''}>Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

tbody.addEventListener('click', (e) => {
  const delBtn = e.target.closest('button[data-action="delete"]');
  if (delBtn) {
    const item = currentItems.find((i) => String(i.id) === delBtn.dataset.id);
    if (item) deleteModalApi.open(item);
    return;
  }
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const item = currentItems.find((i) => String(i.id) === row.dataset.id);
  if (item) detailModalApi.open(item);
});

tbody.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('button')) return;
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  e.preventDefault();
  const item = currentItems.find((i) => String(i.id) === row.dataset.id);
  if (item) detailModalApi.open(item);
});

// Filters & Tabs
function syncTabs(status) {
  currentStatus = status;
  tabBtns.forEach((b) => b.classList.toggle('active', b.dataset.status === status));
  currentPage = 1;
  loadItems();
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => syncTabs(btn.dataset.status));
});
typeSelect.addEventListener('change', () => {
  currentPage = 1;
  loadItems();
});
categorySelect.addEventListener('change', () => {
  currentPage = 1;
  loadItems();
});
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentPage = 1;
    loadItems();
  }, 250);
});
resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  typeSelect.value = '';
  categorySelect.value = '';
  typeDropdown.sync();
  categoryDropdown.sync();
  syncTabs('');
});
prevBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadItems();
  }
});
nextBtn.addEventListener('click', () => {
  currentPage += 1;
  loadItems();
});

loadAdminProfile(document.getElementById('admin-name'));
setupLogoutModal({
  triggerBtn: document.getElementById('logout-btn'),
  modal: document.getElementById('logout-modal'),
  stayBtn: document.getElementById('logout-stay-btn'),
  confirmBtn: document.getElementById('logout-confirm-btn'),
  closeBtn: document.getElementById('logout-close-btn'),
});
loadCategories();
// เปิดจากหน้า Dashboard พร้อมคำค้น เช่น admin-items.html?q=Desk%20lamp
const initialQuery = new URLSearchParams(window.location.search).get('q');
if (initialQuery) searchInput.value = initialQuery;
loadItems();

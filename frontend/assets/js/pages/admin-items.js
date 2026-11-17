import { request } from '../api.js';
import {
  avatarHtml,
  closeModalDialog,
  escapeHtml,
  formatShortDate,
  getStatusDisplay,
  loadAdminProfile,
  openModalDialog,
  sanitizeImageUrl,
  setupLogoutModal,
} from '../shared/admin-common.js';

const searchInput = document.getElementById('items-search');
const categorySelect = document.getElementById('category-select');
const tabBtns = document.querySelectorAll('.tab-btn');
const tbody = document.getElementById('items-tbody');
const totalLabel = document.getElementById('items-total-label');
const prevBtn = document.getElementById('prev-page-btn');
const nextBtn = document.getElementById('next-page-btn');
const resetBtn = document.getElementById('reset-filters-btn');

// Detail modal
const detailModal = document.getElementById('item-detail-modal');
const detailCloseBtn = document.getElementById('detail-close-btn');
const detailDeleteBtn = document.getElementById('detail-delete-btn');

// Delete modal
const deleteModal = document.getElementById('delete-modal');
const deleteCloseBtn = document.getElementById('delete-close-btn');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
const deleteError = document.getElementById('delete-error');

let currentPage = 1;
let currentStatus = '';
let currentItems = [];
let selectedItem = null;
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
      const safeImg = sanitizeImageUrl(item.image_url);
      const thumb = safeImg
        ? `<img class="item-thumb" src="${safeImg}" alt="">`
        : '<span class="item-thumb-placeholder">No img</span>';
      const isRemoved = item.status === 'removed';

      return `
        <tr>
          <td>
            <div class="item-cell">
              ${thumb}
              <div>
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-cat">${escapeHtml(item.category?.name || 'Uncategorized')}</div>
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
              <button type="button" class="btn-outline" data-action="view" data-id="${escapeHtml(item.id)}">View details</button>
              <button type="button" class="btn-outline" data-action="delete" data-id="${escapeHtml(item.id)}" ${isRemoved ? 'disabled' : ''}>Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function openDetailModal(item) {
  selectedItem = item;
  const st = getStatusDisplay(item.status);
  document.getElementById('detail-title').textContent = item.title;
  document.getElementById('detail-sub').textContent =
    `${item.category?.name || 'Uncategorized'} · Listed ${formatShortDate(item.created_at)}`;
  document.getElementById('detail-owner').textContent = item.owner?.name || 'Unknown';
  document.getElementById('detail-status-wrap').innerHTML = `<span class="status-pill ${st.cls}">${st.label}</span>`;
  document.getElementById('detail-desc').textContent = item.description || 'No description provided.';

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

function openDeleteModal(item) {
  selectedItem = item;
  deleteError.textContent = '';
  document.getElementById('delete-item-name').textContent = item.title;
  openModalDialog(deleteModal);
}

tbody.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const item = currentItems.find((i) => String(i.id) === btn.dataset.id);
  if (!item) return;

  if (btn.dataset.action === 'view') openDetailModal(item);
  if (btn.dataset.action === 'delete') openDeleteModal(item);
});

detailCloseBtn.addEventListener('click', () => closeModalDialog(detailModal));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeModalDialog(detailModal);
});
detailDeleteBtn.addEventListener('click', () => {
  closeModalDialog(detailModal);
  if (selectedItem) openDeleteModal(selectedItem);
});

deleteCloseBtn.addEventListener('click', () => closeModalDialog(deleteModal));
deleteCancelBtn.addEventListener('click', () => closeModalDialog(deleteModal));
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
    await loadItems();
  } catch (error) {
    deleteError.textContent = error.message || 'Unable to delete item.';
  } finally {
    deleteConfirmBtn.disabled = false;
  }
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
  categorySelect.value = '';
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

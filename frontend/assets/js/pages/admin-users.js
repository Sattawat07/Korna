import { request } from '../api.js';
import {
  closeModalDialog,
  escapeHtml,
  formatShortDate,
  getStatusDisplay,
  getTypeDisplay,
  loadAdminProfile,
  openModalDialog,
  sanitizeImageUrl,
  setupLogoutModal,
} from '../shared/admin-common.js';

const usersSearchInput = document.getElementById('users-search');
const usersListEl = document.getElementById('users-list');
const usersTotalSub = document.getElementById('users-total-sub');
const usersPrevBtn = document.getElementById('users-prev-btn');
const usersNextBtn = document.getElementById('users-next-btn');
const assignAdminBtn = document.getElementById('assign-admin-btn');
const userItemsListEl = document.getElementById('user-items-list');
const userItemsPager = document.getElementById('user-items-pager');
const userItemsPageInfo = document.getElementById('user-items-page-info');
const userItemsPrevBtn = document.getElementById('user-items-prev-btn');
const userItemsNextBtn = document.getElementById('user-items-next-btn');
const USER_ITEMS_LIMIT = 20;

// Modals
const assignModal = document.getElementById('assign-modal');
const assignCloseBtn = document.getElementById('assign-close-btn');
const assignCancelBtn = document.getElementById('assign-cancel-btn');
const assignConfirmBtn = document.getElementById('assign-confirm-btn');
const assignError = document.getElementById('assign-error');

const detailModal = document.getElementById('item-detail-modal');
const detailCloseBtn = document.getElementById('detail-close-btn');
const detailDeleteBtn = document.getElementById('detail-delete-btn');

const deleteModal = document.getElementById('delete-modal');
const deleteCloseBtn = document.getElementById('delete-close-btn');
const deleteCancelBtn = document.getElementById('delete-cancel-btn');
const deleteConfirmBtn = document.getElementById('delete-confirm-btn');
const deleteError = document.getElementById('delete-error');

let users = [];
let currentUsersPage = 1;
let selectedUser = null;
let currentAdmin = null;
let pendingRoleChange = null;
let selectedUserItems = [];
let selectedItem = null;
let searchTimer = null;
let loadUsersSeq = 0;
let loadUserItemsSeq = 0;
let userItemsPage = 1;
let userItemsTotalPages = 1;

function roleLabel(role) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function roleAction(user) {
  if (!user || currentAdmin?.role !== 'super_admin' || user.id === currentAdmin.id) return null;
  if (user.role === 'user') {
    return { role: 'admin', label: 'Assign Admin', title: 'Assign Admin?',
      description: 'This member will be able to view admin pages and moderate listings.' };
  }
  return { role: 'user', label: user.role === 'super_admin' ? 'Remove Super Admin' : 'Remove Admin',
    title: 'Remove admin access?',
    description: 'This member will lose access to admin pages and listing moderation.' };
}

function refreshRoleAction() {
  const action = roleAction(selectedUser);
  assignAdminBtn.hidden = currentAdmin?.role !== 'super_admin';
  assignAdminBtn.disabled = !action;
  assignAdminBtn.textContent = action?.label ?? 'Change Role';
}

async function loadUsers() {
  const seq = ++loadUsersSeq;
  const params = new URLSearchParams();
  params.set('page', String(currentUsersPage));
  params.set('limit', '20');
  const q = usersSearchInput.value.trim();
  if (q) params.set('q', q);

  try {
    const data = await request(`/admin/users?${params.toString()}`);
    if (seq !== loadUsersSeq) return;
    users = data.users || [];
    const pag = data.pagination || { page: 1, total_pages: 1, total: users.length };
    usersTotalSub.textContent = q ? `${pag.total} matching users` : `${pag.total} registered users`;
    usersPrevBtn.disabled = pag.page <= 1;
    usersNextBtn.disabled = pag.page >= pag.total_pages;

    if (users.length === 0) {
      // ค้นหาไม่เจอใคร → ล้างคนที่เลือกไว้ก่อนหน้า ไม่ให้รายละเอียดและปุ่ม Assign Admin ค้าง
      clearSelectedUser();
      renderUsersList();
      return;
    }

    const stillListed = selectedUser && users.find((u) => u.id === selectedUser.id);
    if (stillListed) {
      selectedUser = stillListed;
      renderUsersList();
    } else {
      selectUser(users[0]);
    }
  } catch (error) {
    if (seq !== loadUsersSeq) return;
    clearSelectedUser();
    usersPrevBtn.disabled = true;
    usersNextBtn.disabled = true;
    usersListEl.innerHTML = '<p class="panel-sub"></p>';
    usersListEl.firstElementChild.textContent = error.message || 'Unable to load users.';
  }
}

/** กลับไปเป็นสถานะ "ยังไม่ได้เลือกสมาชิก" แบบตอนเปิดหน้า */
function clearSelectedUser() {
  selectedUser = null;
  selectedUserItems = [];
  selectedItem = null;
  loadUserItemsSeq += 1; // ยกเลิกการโหลดโพสต์ของคนเดิมที่อาจค้างอยู่

  document.getElementById('selected-user-name').textContent = 'Select a member';
  document.getElementById('selected-user-email').textContent = '—';
  const roleBadge = document.getElementById('selected-user-role');
  roleBadge.textContent = 'Member';
  roleBadge.className = 'status-pill status-available';
  document.getElementById('selected-user-joined').textContent = '';
  document.getElementById('selected-user-room').textContent = '—';
  document.getElementById('selected-user-phone').textContent = '—';
  document.getElementById('selected-user-items-count').textContent = '0';

  assignAdminBtn.disabled = true;
  assignAdminBtn.textContent = 'Change Role';

  document.getElementById('user-items-sub').textContent = 'Select a member to view their listings.';
  userItemsListEl.innerHTML = '';
  userItemsPager.hidden = true;
}

function renderUsersList() {
  if (users.length === 0) {
    usersListEl.innerHTML = '<p class="panel-sub">No members found.</p>';
    return;
  }

  usersListEl.innerHTML = users
    .map((u) => {
      const isActive = selectedUser?.id === u.id ? 'active' : '';
      const label = roleLabel(u.role);
      return `
        <button type="button" class="user-row-btn ${isActive}" data-user-id="${escapeHtml(u.id)}">
          <div class="user-row-left">
            <span class="avatar-circle" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </span>
            <div>
              <div class="user-row-name">${escapeHtml(u.name)}</div>
              <div class="user-row-meta">${label} · ${Number(u.items_count ?? 0)} listed items</div>
            </div>
          </div>
          <span aria-hidden="true">&rsaquo;</span>
        </button>
      `;
    })
    .join('');
}

async function selectUser(user) {
  selectedUser = user;
  renderUsersList();

  document.getElementById('selected-user-name').textContent = user.name;
  document.getElementById('selected-user-email').textContent = user.email;
  const roleBadge = document.getElementById('selected-user-role');
  roleBadge.textContent = roleLabel(user.role);
  roleBadge.className = `status-pill ${user.role === 'super_admin' ? 'status-pending' : user.role === 'admin' ? 'status-completed' : 'status-available'}`;
  document.getElementById('selected-user-joined').textContent = `Joined ${formatShortDate(user.created_at)}`;
  document.getElementById('selected-user-room').textContent = user.room_number || '—';
  document.getElementById('selected-user-phone').textContent = user.phone_number || '—';
  document.getElementById('selected-user-items-count').textContent = user.items_count ?? 0;

  refreshRoleAction();

  document.getElementById('user-items-sub').textContent = `Manage ${user.name}'s listings without leaving this profile.`;
  await loadUserItems(user.id, 1);
}

async function loadUserItems(ownerId, page = userItemsPage) {
  const seq = ++loadUserItemsSeq;
  userItemsListEl.innerHTML = '<p class="panel-sub">Loading items...</p>';
  userItemsPrevBtn.disabled = true;
  userItemsNextBtn.disabled = true;
  try {
    const params = new URLSearchParams({ owner_id: String(ownerId), page: String(page), limit: String(USER_ITEMS_LIMIT) });
    const data = await request(`/admin/items?${params.toString()}`);
    if (seq !== loadUserItemsSeq) return;
    selectedUserItems = data.items || [];
    const pag = data.pagination || { page, total_pages: 1, total: selectedUserItems.length };

    // หน้านี้ว่าง (เช่นลบโพสต์สุดท้ายของหน้า) → ถอยกลับไปหน้าก่อน
    if (selectedUserItems.length === 0 && page > 1) {
      await loadUserItems(ownerId, page - 1);
      return;
    }

    userItemsPage = pag.page;
    userItemsTotalPages = Math.max(1, pag.total_pages);
    userItemsPager.hidden = userItemsTotalPages <= 1;
    userItemsPageInfo.textContent = `Page ${userItemsPage} of ${userItemsTotalPages} · ${pag.total} items`;
    userItemsPrevBtn.disabled = userItemsPage <= 1;
    userItemsNextBtn.disabled = userItemsPage >= userItemsTotalPages;

    if (selectedUserItems.length === 0) {
      userItemsListEl.innerHTML = '<p class="panel-sub">No listed items.</p>';
      return;
    }

    userItemsListEl.innerHTML = selectedUserItems
      .map((item) => {
        const st = getStatusDisplay(item.status);
        const tp = getTypeDisplay(item.type);
        const safeImg = sanitizeImageUrl(item.image_url);
        const thumb = safeImg
          ? `<img class="item-thumb" src="${safeImg}" alt="">`
          : '<span class="item-thumb-placeholder">No img</span>';
        return `
          <div class="user-item-row item-row-clickable" data-id="${escapeHtml(item.id)}" tabindex="0">
            <div class="item-cell">
              ${thumb}
              <div>
                <div class="item-title">${escapeHtml(item.title)}</div>
                <div class="item-cat"><span class="type-pill ${tp.cls}">${tp.label}</span>${escapeHtml(st.label)} · Listed ${escapeHtml(formatShortDate(item.created_at))}</div>
              </div>
            </div>
            <div class="action-group">
              <button type="button" class="btn-outline" data-action="delete" data-id="${escapeHtml(item.id)}" ${item.status === 'removed' ? 'disabled' : ''}>Delete</button>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (error) {
    if (seq !== loadUserItemsSeq) return;
    userItemsPager.hidden = true;
    userItemsListEl.innerHTML = '<p class="panel-sub"></p>';
    userItemsListEl.firstElementChild.textContent = error.message || 'Unable to load items.';
  }
}

userItemsPrevBtn.addEventListener('click', () => {
  if (selectedUser && userItemsPage > 1) loadUserItems(selectedUser.id, userItemsPage - 1);
});

userItemsNextBtn.addEventListener('click', () => {
  if (selectedUser && userItemsPage < userItemsTotalPages) loadUserItems(selectedUser.id, userItemsPage + 1);
});

usersListEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-user-id]');
  if (!btn) return;
  const user = users.find((u) => String(u.id) === btn.dataset.userId);
  if (user) selectUser(user);
});

usersSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentUsersPage = 1;
    loadUsers();
  }, 250);
});

usersPrevBtn.addEventListener('click', () => {
  if (currentUsersPage > 1) {
    currentUsersPage -= 1;
    loadUsers();
  }
});

usersNextBtn.addEventListener('click', () => {
  currentUsersPage += 1;
  loadUsers();
});

// Role change confirmation
assignAdminBtn.addEventListener('click', () => {
  const action = roleAction(selectedUser);
  if (!action) return;
  pendingRoleChange = { userId: selectedUser.id, role: action.role };
  assignError.textContent = '';
  document.getElementById('assign-user-name').textContent = selectedUser.name;
  document.getElementById('assign-modal-title').textContent = action.title;
  document.getElementById('assign-modal-description').textContent = action.description;
  assignConfirmBtn.textContent = action.label;
  openModalDialog(assignModal);
});

assignCloseBtn.addEventListener('click', () => closeModalDialog(assignModal));
assignCancelBtn.addEventListener('click', () => closeModalDialog(assignModal));
assignModal.addEventListener('click', (e) => {
  if (e.target === assignModal) closeModalDialog(assignModal);
});

assignConfirmBtn.addEventListener('click', async () => {
  if (!pendingRoleChange || currentAdmin?.role !== 'super_admin') return;
  const { userId, role } = pendingRoleChange;
  assignConfirmBtn.disabled = true;
  assignError.textContent = '';

  try {
    const res = await request(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: { role },
    });
    const updated = res.user;
    users = users.map((u) => (u.id === userId ? { ...u, role: updated.role } : u));
    pendingRoleChange = null;
    closeModalDialog(assignModal);
    if (selectedUser?.id === userId) await selectUser({ ...selectedUser, role: updated.role });
    else renderUsersList();
  } catch (error) {
    assignError.textContent = error.message || 'Unable to change role.';
  } finally {
    assignConfirmBtn.disabled = false;
  }
});

function openUserItemDetail(item) {
  selectedItem = item;
  const st = getStatusDisplay(item.status);
  const tp = getTypeDisplay(item.type);
  document.getElementById('detail-title').textContent = item.title;
  document.getElementById('detail-sub').textContent =
    `${item.category?.name || 'Uncategorized'} · Listed ${formatShortDate(item.created_at)}`;
  document.getElementById('detail-owner').textContent = selectedUser?.name || 'Unknown';
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

// Item Details & Delete Modals
userItemsListEl.addEventListener('click', (e) => {
  const delBtn = e.target.closest('button[data-action="delete"]');
  if (delBtn) {
    const item = selectedUserItems.find((i) => String(i.id) === delBtn.dataset.id);
    if (!item) return;
    selectedItem = item;
    deleteError.textContent = '';
    document.getElementById('delete-item-name').textContent = item.title;
    openModalDialog(deleteModal);
    return;
  }
  const row = e.target.closest('.user-item-row[data-id]');
  if (!row) return;
  const item = selectedUserItems.find((i) => String(i.id) === row.dataset.id);
  if (item) openUserItemDetail(item);
});

userItemsListEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (e.target.closest('button')) return;
  const row = e.target.closest('.user-item-row[data-id]');
  if (!row) return;
  e.preventDefault();
  const item = selectedUserItems.find((i) => String(i.id) === row.dataset.id);
  if (item) openUserItemDetail(item);
});

detailCloseBtn.addEventListener('click', () => closeModalDialog(detailModal));
detailModal.addEventListener('click', (e) => {
  if (e.target === detailModal) closeModalDialog(detailModal);
});
detailDeleteBtn.addEventListener('click', () => {
  closeModalDialog(detailModal);
  if (selectedItem) {
    deleteError.textContent = '';
    document.getElementById('delete-item-name').textContent = selectedItem.title;
    openModalDialog(deleteModal);
  }
});

deleteCloseBtn.addEventListener('click', () => closeModalDialog(deleteModal));
deleteCancelBtn.addEventListener('click', () => closeModalDialog(deleteModal));
deleteModal.addEventListener('click', (e) => {
  if (e.target === deleteModal) closeModalDialog(deleteModal);
});

deleteConfirmBtn.addEventListener('click', async () => {
  if (!selectedItem || !selectedUser) return;
  deleteConfirmBtn.disabled = true;
  deleteError.textContent = '';
  try {
    await request(`/admin/items/${selectedItem.id}`, { method: 'DELETE' });
    closeModalDialog(deleteModal);
    await loadUserItems(selectedUser.id, userItemsPage);
  } catch (error) {
    deleteError.textContent = error.message || 'Unable to delete item.';
  } finally {
    deleteConfirmBtn.disabled = false;
  }
});

loadAdminProfile(document.getElementById('admin-name'), (user) => {
  currentAdmin = user;
  refreshRoleAction();
});
setupLogoutModal({
  triggerBtn: document.getElementById('logout-btn'),
  modal: document.getElementById('logout-modal'),
  stayBtn: document.getElementById('logout-stay-btn'),
  confirmBtn: document.getElementById('logout-confirm-btn'),
  closeBtn: document.getElementById('logout-close-btn'),
});
loadUsers();

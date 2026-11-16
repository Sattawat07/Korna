import { request } from '../api.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { escapeHtml, formatDate, itemStatusLabel, requestStatusLabel } from '../shared/format.js';
import { setupNotifications } from '../shared/notifications.js';
import { errorText, goToLogin, loadMe } from '../shared/session.js';
import { avatarHtml, gallery, itemFacts, itemText } from '../shared/item-view.js';
import { checkSourceFile, openCropper } from '../shared/cropper.js';
import {
  clearErrorOnInput,
  clearFieldErrors,
  imageViewer,
  openModal,
  setupModals,
  showFieldErrors,
  toast,
} from '../shared/ui.js';

const $ = (id) => document.getElementById(id);

let me = null;
let stats = null;
let myItems = []; // GET /api/me/items
let sentRequests = []; // GET /api/requests?role=sent
let tab = 'items';
let pendingDeleteId = null;
let openItemId = null; // โพสต์ของฉันที่เปิดดูรายละเอียดอยู่
let openRequestId = null; // คำขอที่ฉันส่งที่เปิดดูรายละเอียดอยู่

hydrateIcons();
setupModals();
bindTabs();
bindEditProfile();
bindAvatar();
bindDelete();
bindEditItem();
bindDetails();
bindLogout();
init();

async function init() {
  try {
    const data = await loadMe();
    me = data.user;
    stats = data.stats;
    renderMe();
    if ($('admin-link')) $('admin-link').hidden = me?.role !== 'admin';
    renderStats();
    setupNotifications();
  } catch (error) {
    $('me-name').textContent = '-';
    showListStatus(errorText(error, 'Unable to load your profile. Please try again.'), true);
    return;
  }
  await loadLists();
  openFromHash();
  window.addEventListener('hashchange', openFromHash);
}

async function loadLists() {
  showListStatus('Loading...');
  try {
    const [itemsData, sentData] = await Promise.all([request('/me/items'), request('/requests?role=sent')]);
    myItems = itemsData.items;
    sentRequests = sentData.requests;
    renderList();
  } catch (error) {
    $('list').innerHTML = '';
    showListStatus(errorText(error, 'Unable to load your items. Please try again.'), true);
  }
}

/** โหลดสถิติใหม่หลังมีการเปลี่ยนแปลง (ลบโพสต์ / อนุมัติคำขอ) */
async function refreshStats() {
  try {
    const data = await request('/me');
    stats = data.stats;
    renderStats();
  } catch {
    /* สถิติไม่อัปเดตก็ไม่กระทบการใช้งานหลัก */
  }
}

function bindLogout() {
  $('logout-btn').addEventListener('click', async () => {
    const btn = $('logout-btn');
    btn.disabled = true;
    try {
      await request('/auth/logout', { method: 'POST' });
    } catch {
      /* ถึง session หมดอายุไปแล้วก็พาไปหน้า login ได้ */
    }
    goToLogin();
  });
}

function formatPhone(phone) {
  if (!phone) return '-';
  return phone.length === 10 ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

function renderMe() {
  renderAvatar();
  $('me-name').textContent = me.name;
  $('me-room').textContent = me.room_number;
  $('me-phone').textContent = formatPhone(me.phone_number);
  $('me-email').textContent = me.email;
}

function renderStats() {
  $('stat-items').textContent = String(stats.my_items_count);
  $('stat-sent').textContent = String(stats.requests_sent_count);
  $('stat-done').textContent = String(stats.completed_items_count);
}

// ---------- แท็บ My Item / Activity ----------
function bindTabs() {
  $('tab-items').addEventListener('click', () => selectTab('items'));
  $('tab-activity').addEventListener('click', () => selectTab('activity'));
  // ลูกศรซ้าย/ขวา (หรือ Home/End) สลับแท็บได้ ตามรูปแบบ tablist มาตรฐาน
  document.querySelector('.tabs').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let next = tab === 'items' ? 'activity' : 'items';
    if (event.key === 'Home') next = 'items';
    if (event.key === 'End') next = 'activity';
    selectTab(next);
    $(next === 'items' ? 'tab-items' : 'tab-activity').focus();
  });
}

function selectTab(next) {
  tab = next;
  [
    ['tab-items', 'items'],
    ['tab-activity', 'activity'],
  ].forEach(([id, name]) => {
    $(id).setAttribute('aria-selected', String(next === name));
    $(id).tabIndex = next === name ? 0 : -1;
  });
  $('list').setAttribute('aria-labelledby', next === 'items' ? 'tab-items' : 'tab-activity');
  renderList();
}

function showListStatus(message, isError = false) {
  const el = $('list-status');
  el.hidden = !message;
  el.textContent = message;
  el.classList.toggle('rows__empty--error', isError);
}

function thumb(url, alt) {
  return `<span class="row__thumb">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />` : icon('image')}</span>`;
}

function itemRow(item) {
  const count = item.requests_count ?? 0;
  const canDelete = item.status === 'available';
  return `
    <li class="row">
      ${thumb(item.image_url, item.title)}
      <div class="row__info">
        <p class="row__title">${escapeHtml(item.title)}</p>
        <p class="row__sub">${escapeHtml(item.category.name)}</p>
      </div>
      <div class="row__person"><span class="avatar">${icon('users')}</span>${count} request${count === 1 ? '' : 's'}</div>
      <div class="row__status"><span class="status status--${item.status}">${itemStatusLabel(item)}</span></div>
      <span class="row__date">${formatDate(item.created_at)}</span>
      <div class="row__actions">
        <button class="btn btn--outline" type="button" data-view-item="${item.id}" aria-label="View details: ${escapeHtml(item.title)}">View details</button>
        <button class="btn btn--outline" type="button" data-edit-item="${item.id}" aria-label="Edit: ${escapeHtml(item.title)}" ${canDelete ? '' : 'disabled title="Only available posts can be edited"'}>Edit</button>
        <button class="btn btn--outline btn--danger" type="button" data-delete="${item.id}" aria-label="Delete: ${escapeHtml(item.title)}" ${canDelete ? '' : 'disabled title="Only available posts can be deleted"'}>Delete</button>
      </div>
    </li>`;
}

function requestRow(req) {
  const sub =
    req.item.type === 'swap'
      ? `Swap offer: ${escapeHtml(req.swap_offer?.description ?? '')}`
      : escapeHtml(req.message ?? 'Free item request');
  return `
    <li class="row">
      ${thumb(req.item.image_url, req.item.title)}
      <div class="row__info">
        <p class="row__title">${escapeHtml(req.item.title)}</p>
        <p class="row__sub">${sub}</p>
      </div>
      <div class="row__person"><span class="avatar">${icon(req.item.type === 'swap' ? 'swap' : 'gift')}</span>${req.item.type === 'swap' ? 'Swap' : 'Free'}</div>
      <div class="row__status"><span class="status status--${req.status}">${requestStatusLabel(req.status)}</span></div>
      <span class="row__date">${formatDate(req.created_at)}</span>
      <div class="row__actions">
        <button class="btn btn--outline" type="button" data-view-request="${req.id}" aria-label="View details: ${escapeHtml(req.item.title)}">View details</button>
      </div>
    </li>`;
}

function renderList() {
  const list = $('list');
  // โพสต์ที่ซ่อนแล้ว (removed) ไม่แสดงในรายการของฉัน
  const visibleItems = myItems.filter((i) => i.status !== 'removed');
  const rows = tab === 'items' ? visibleItems.map(itemRow) : sentRequests.map(requestRow);
  list.innerHTML = rows.join('');
  if (rows.length) showListStatus('');
  else showListStatus(tab === 'items' ? 'You haven’t posted any items yet.' : 'You haven’t sent any requests yet.');
  const noun = tab === 'items' ? 'item' : 'request';
  $('tab-count').textContent = `${rows.length} ${noun}${rows.length === 1 ? '' : 's'}`;
}

// ---------- แก้ไขโปรไฟล์: PATCH /api/me ----------
function bindEditProfile() {
  const form = $('edit-form');
  const dialog = $('edit-profile-modal');
  const message = $('edit-message');
  // เติมข้อมูลปัจจุบันลงฟอร์มทันทีที่กดปุ่ม Edit Profile
  document.querySelectorAll('[data-open-modal="edit-profile-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!me) return;
      form.elements.namedItem('name').value = me.name;
      form.elements.namedItem('room_number').value = me.room_number;
      form.elements.namedItem('phone_number').value = me.phone_number ?? '';
      message.textContent = '';
      clearFieldErrors(form);
    });
  });
  clearErrorOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.elements.namedItem('name').value.trim();
    const room = form.elements.namedItem('room_number').value.trim();
    const phone = form.elements.namedItem('phone_number').value.trim();
    const errors = {};
    if (!name) errors.name = 'Please enter your name.';
    if (!room) errors.room_number = 'Please enter your room number.';
    message.textContent = '';
    if (showFieldErrors(form, errors)) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const data = await request('/me', {
        method: 'PATCH',
        body: { name, room_number: room, phone_number: phone || null },
      });
      me = data.user;
      renderMe();
      dialog.close();
      toast('Profile saved.');
    } catch (error) {
      if (error.details && typeof error.details === 'object') showFieldErrors(form, error.details);
      message.textContent = errorText(error, 'Unable to save your profile. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}

// ---------- ซ่อนโพสต์: DELETE /api/items/:id ----------
function bindDelete() {
  $('list').addEventListener('click', (event) => {
    const del = event.target.closest('[data-delete]');
    if (!del || del.disabled) return;
    pendingDeleteId = Number(del.dataset.delete);
    $('delete-item-name').textContent = myItems.find((i) => i.id === pendingDeleteId)?.title ?? '';
    $('delete-message').textContent = '';
    openModal('delete-modal');
  });

  $('delete-confirm').addEventListener('click', async () => {
    if (pendingDeleteId == null) return;
    const btn = $('delete-confirm');
    btn.disabled = true;
    btn.textContent = 'Deleting...';
    try {
      const data = await request(`/items/${pendingDeleteId}`, { method: 'DELETE' });
      myItems = myItems.map((i) => (i.id === data.item.id ? { ...i, status: data.item.status } : i));
      pendingDeleteId = null;
      $('delete-modal').close();
      renderList();
      refreshStats();
      toast('Post deleted.');
    } catch (error) {
      $('delete-message').textContent = errorText(error, 'Unable to delete this post. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Delete';
    }
  });
}

// ---------- รูปโปรไฟล์: PUT /api/me/avatar (multipart ฟิลด์ avatar) ----------
function renderAvatar() {
  const box = $('avatar');
  if (me?.avatar_url) {
    const img = document.createElement('img');
    img.src = me.avatar_url;
    img.alt = 'Profile picture';
    box.replaceChildren(img);
  } else {
    box.innerHTML = icon('user');
  }
}

function bindAvatar() {
  const input = $('avatar-input');
  const error = $('avatar-error');
  const editBtn = $('avatar-edit');
  editBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !me) return;
    const problem = checkSourceFile(file);
    if (problem) {
      error.textContent = problem;
      return;
    }
    error.textContent = '';
    // เลือกส่วนของรูปที่จะแสดงในวงกลมก่อนอัปโหลด
    let cropped;
    try {
      cropped = await openCropper(file, { aspect: 1, circle: true, maxSide: 800, title: 'Adjust profile picture' });
    } catch (err) {
      error.textContent = err.message;
      return;
    } finally {
      editBtn.focus();
    }
    if (!cropped) return;
    const body = new FormData();
    body.append('avatar', cropped);
    editBtn.disabled = true;
    $('avatar').classList.add('is-uploading');
    try {
      const data = await request('/me/avatar', { method: 'PUT', body });
      me = { ...me, avatar_url: data.avatar_url };
      renderAvatar();
      toast('Profile picture updated.');
    } catch (err) {
      error.textContent = errorText(err, 'Unable to upload the picture. Please try again.');
    } finally {
      editBtn.disabled = false;
      $('avatar').classList.remove('is-uploading');
    }
  });
}

// ---------- View details ----------
function bindDetails() {
  $('list').addEventListener('click', (event) => {
    const viewItem = event.target.closest('[data-view-item]');
    const viewReq = event.target.closest('[data-view-request]');
    if (viewItem) showMyItem(Number(viewItem.dataset.viewItem));
    else if (viewReq) showSentRequest(Number(viewReq.dataset.viewRequest));
  });

  $('details-body').addEventListener('click', (event) => {
    const btn = event.target.closest('[data-decision]');
    if (!btn || btn.disabled) return;
    decide(Number(btn.dataset.requestId), btn.dataset.decision, btn);
  });

  $('details-modal').addEventListener('close', () => {
    openItemId = null;
    openRequestId = null;
  });
}

/** ลิงก์จากการแจ้งเตือน: profile.html#item-<id> หรือ #request-<id> */
function openFromHash() {
  const m = location.hash.match(/^#(item|request)-(\d+)$/);
  if (!m) return;
  const id = Number(m[2]);
  history.replaceState(null, '', location.pathname);
  if (m[1] === 'item') {
    selectTab('items');
    showMyItem(id);
  } else {
    selectTab('activity');
    showSentRequest(id);
  }
}

function requestCard(req, canDecide) {
  const offer = req.swap_offer;
  const offerImgs = offer?.images.map((i) => i.url) ?? [];
  return `<li class="req">
    <div class="req__head">
      ${avatarHtml(req.requester)}
      <div class="req__who"><p class="req__name">${escapeHtml(req.requester.name)}</p><p class="req__time">${formatDate(req.created_at)}</p></div>
      <span class="status status--${req.status}">${requestStatusLabel(req.status)}</span>
    </div>
    ${req.message ? `<p class="req__msg">“${escapeHtml(req.message)}”</p>` : ''}
    ${offer ? `<div class="req__offer"><p class="details-label">Swap offer</p><p class="details-text">${escapeHtml(offer.description)}</p>${offerImgs.length ? imageViewer(offerImgs.map(escapeHtml), 'Offer') : ''}</div>` : ''}
    ${
      canDecide && req.status === 'pending'
        ? `<div class="req__actions">
        <button class="btn btn--outline" type="button" data-decision="rejected" data-request-id="${req.id}">Reject</button>
        <button class="btn btn--primary" type="button" data-decision="accepted" data-request-id="${req.id}">Accept</button>
      </div>`
        : ''
    }
  </li>`;
}

function showDetails(eyebrow, title, html) {
  $('details-eyebrow').textContent = eyebrow;
  $('details-title-m').textContent = title;
  $('details-body').innerHTML = html;
  const dialog = $('details-modal');
  if (!dialog.open) dialog.showModal();
}

/** รายละเอียดโพสต์ของฉัน + คนที่ส่งคำขอ: GET /api/requests?role=received&item_id=<id> */
async function showMyItem(id) {
  const item = myItems.find((i) => i.id === id);
  if (!item) {
    showDetails('MY ITEM', 'Not found', '<p class="details-text">This post is no longer available.</p>');
    return;
  }
  openItemId = id;
  openRequestId = null;
  const base = `${gallery(item.images.map((i) => i.url), item.title)}${itemFacts(item)}${itemText(item)}`;
  showDetails('MY ITEM', item.title, `${base}<p class="details-label details-label--section">Requests</p><p class="details-text">Loading...</p>`);
  let reqs;
  try {
    const data = await request(`/requests?role=received&item_id=${id}`);
    reqs = data.requests;
  } catch (error) {
    if (openItemId !== id) return;
    $('details-body').innerHTML = `${base}<p class="details-label details-label--section">Requests</p><p class="details-text details-text--error">${escapeHtml(errorText(error, 'Unable to load requests.'))}</p>`;
    return;
  }
  if (openItemId !== id) return;
  const canDecide = item.status === 'available' || item.status === 'pending';
  $('details-body').innerHTML = `${base}
    <p class="details-label details-label--section">Requests (${reqs.length})</p>
    <p class="modal__message" id="decision-message" role="alert"></p>
    ${reqs.length ? `<ul class="reqs">${reqs.map((r) => requestCard(r, canDecide)).join('')}</ul>` : '<p class="details-text">No requests yet.</p>'}`;
}

/** รายละเอียดคำขอที่ฉันส่ง พร้อมข้อมูลโพสต์: GET /api/items/:id */
async function showSentRequest(id) {
  const req = sentRequests.find((r) => r.id === id);
  if (!req) {
    showDetails('MY REQUEST', 'Not found', '<p class="details-text">This request could not be found.</p>');
    return;
  }
  openRequestId = id;
  openItemId = null;
  const mine = `<p class="details-label details-label--section">My request</p><ul class="reqs">${requestCard(req, false)}</ul>`;
  showDetails('MY REQUEST', req.item.title, `<p class="details-text">Loading...</p>${mine}`);
  try {
    const data = await request(`/items/${req.item.id}`);
    if (openRequestId !== id) return; // ผู้ใช้เปิดรายการอื่นไปแล้ว ไม่แสดงผลเก่าทับ
    const item = data.item;
    $('details-body').innerHTML = `${gallery(item.images.map((i) => i.url), item.title)}
      ${itemFacts(item)}
      <p class="details-label">Owner</p><p class="details-text">${escapeHtml(item.owner.name)}</p>
      ${itemText(item)}${mine}`;
  } catch {
    if (openRequestId !== id) return;
    // โพสต์อาจถูกซ่อนแล้ว — ยังแสดงข้อมูลคำขอของฉันได้
    $('details-body').innerHTML = `<p class="details-text">This post is no longer available.</p>${mine}`;
  }
}

/**
 * อนุมัติ/ปฏิเสธคำขอ: PATCH /api/requests/:id/decision { decision }
 * backend จัดการสถานะโพสต์และคำขออื่นให้เอง แล้วเราโหลดข้อมูลใหม่มาแสดง
 */
async function decide(requestId, decision, btn) {
  const itemId = openItemId;
  const buttons = $('details-body').querySelectorAll('[data-decision]');
  buttons.forEach((b) => (b.disabled = true));
  btn.textContent = decision === 'accepted' ? 'Accepting...' : 'Rejecting...';
  try {
    await request(`/requests/${requestId}/decision`, { method: 'PATCH', body: { decision } });
    const data = await request('/me/items');
    myItems = data.items;
    renderList();
    refreshStats();
    toast(decision === 'accepted' ? 'Request accepted.' : 'Request declined.');
    if (itemId != null) await showMyItem(itemId);
  } catch (error) {
    buttons.forEach((b) => (b.disabled = false));
    btn.textContent = decision === 'accepted' ? 'Accept' : 'Reject';
    const message = $('decision-message');
    if (message) message.textContent = errorText(error, 'Unable to save your decision. Please try again.');
  }
}

// ---------- แก้ไขโพสต์: PATCH /api/items/:id (เฉพาะโพสต์ที่ยัง Available) ----------
let categories = null;
let editingId = null;

async function loadCategories() {
  if (!categories) categories = (await request('/categories')).categories;
  return categories;
}

function bindEditItem() {
  const form = $('edit-item-form');
  const message = $('edit-item-message');
  clearErrorOnInput(form);

  $('list').addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-edit-item]');
    if (!btn || btn.disabled) return;
    const item = myItems.find((i) => i.id === Number(btn.dataset.editItem));
    if (!item) return;
    editingId = item.id;
    message.textContent = '';
    clearFieldErrors(form);
    btn.disabled = true;
    try {
      const list = await loadCategories();
      const select = form.elements.namedItem('category_id');
      select.innerHTML = list.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
      select.value = String(item.category.id);
      form.elements.namedItem('title').value = item.title;
      form.elements.namedItem('description').value = item.description ?? '';
      form.elements.namedItem('desired_description').value = item.swap_details?.desired_description ?? '';
      $('edit-desired-field').hidden = item.type !== 'swap';
      openModal('edit-item-modal');
    } catch (error) {
      showListStatus(errorText(error, 'Unable to open the editor. Please try again.'), true);
    } finally {
      btn.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const item = myItems.find((i) => i.id === editingId);
    if (!item) return;
    const title = form.elements.namedItem('title').value.trim();
    const description = form.elements.namedItem('description').value.trim();
    const categoryId = Number(form.elements.namedItem('category_id').value);
    const desired = form.elements.namedItem('desired_description').value.trim();
    const errors = {};
    if (!title) errors.title = 'Please enter the item name.';
    if (item.type === 'swap' && !desired) errors.desired_description = 'Please describe what you want in exchange.';
    message.textContent = '';
    if (showFieldErrors(form, errors)) return;
    // ส่งเฉพาะฟิลด์ที่เปลี่ยน — โพสต์ free ห้ามส่งฟิลด์ swap
    const body = {};
    if (title !== item.title) body.title = title;
    if (description !== (item.description ?? '')) body.description = description || null;
    if (categoryId !== item.category.id) body.category_id = categoryId;
    if (item.type === 'swap' && desired !== (item.swap_details?.desired_description ?? '')) body.desired_description = desired;
    if (!Object.keys(body).length) {
      $('edit-item-modal').close();
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      const data = await request(`/items/${item.id}`, { method: 'PATCH', body });
      myItems = myItems.map((i) => (i.id === item.id ? { ...data.item, requests_count: i.requests_count } : i));
      renderList();
      $('edit-item-modal').close();
      toast('Post updated.');
    } catch (error) {
      if (error.details && typeof error.details === 'object') showFieldErrors(form, error.details);
      message.textContent = errorText(error, 'Unable to save the post. Please try again.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save changes';
    }
  });
}

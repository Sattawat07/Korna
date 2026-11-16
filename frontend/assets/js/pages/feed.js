import { request } from '../api.js';
import { hydrateIcons, icon } from '../shared/icons.js';
import { escapeHtml, itemStatusLabel } from '../shared/format.js';
import { avatarHtml, gallery, itemFacts, itemText } from '../shared/item-view.js';
import { setupNotifications } from '../shared/notifications.js';
import { errorText, loadMe } from '../shared/session.js';
import { openModal, setupModals, setupUploader } from '../shared/ui.js';

// ---------- สถานะของหน้า ----------
const PAGE_SIZE = 12;
const state = { q: '', category_id: '', type: '', range: '', sort: 'newest', view: 'grid', page: 1, totalPages: 1 };
let me = null;
let items = [];
let loadToken = 0; // กันผลลัพธ์เก่ามาทับเมื่อเปลี่ยนตัวกรองเร็วๆ
const requestedIds = new Set(); // โพสต์ที่เพิ่งส่งคำขอในหน้านี้

const $ = (id) => document.getElementById(id);
const cardsEl = $('cards');
const statusEl = $('feed-status');
const moreEl = $('feed-more');
const loadMoreBtn = $('load-more');

hydrateIcons();
setupModals();
const postUploader = setupUploader(document.querySelector('.uploader[data-input="post-images"]'));
const offerUploader = setupUploader(document.querySelector('.uploader[data-input="offer-images"]'));
restoreView();
bindFilters();
bindCreatePost();
bindRequestForms();
init();

async function init() {
  try {
    const [meData, categoryData] = await Promise.all([loadMe(), request('/categories')]);
    me = meData.user;
    fillCategorySelects(categoryData.categories);
    setupNotifications();
  } catch (error) {
    showStatus(errorText(error, 'Unable to load the page. Please try again.'), true);
    return;
  }
  await loadItems({ reset: true });
}

function fillCategorySelects(categories) {
  const options = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  document.querySelectorAll('#filter-category, select[name="category_id"]').forEach((select) => {
    select.insertAdjacentHTML('beforeend', options);
  });
}

function restoreView() {
  try {
    const saved = localStorage.getItem('korna:view');
    if (saved === 'grid' || saved === 'list') state.view = saved;
  } catch {
    /* localStorage ใช้ไม่ได้ก็ใช้ค่าเริ่มต้น */
  }
  applyView();
}

// ---------- ตัวกรอง ----------
function bindFilters() {
  let timer;
  $('search-input').addEventListener('input', (event) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.q = event.target.value.trim();
      loadItems({ reset: true });
    }, 300);
  });
  $('filter-category').addEventListener('change', (event) => {
    state.category_id = event.target.value;
    loadItems({ reset: true });
  });
  $('filter-type').addEventListener('change', (event) => {
    state.type = event.target.value;
    loadItems({ reset: true });
  });
  $('filter-range').addEventListener('change', (event) => {
    state.range = event.target.value;
    loadItems({ reset: true });
  });
  $('filter-sort').addEventListener('change', (event) => {
    state.sort = event.target.value;
    loadItems({ reset: true });
  });
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      try {
        localStorage.setItem('korna:view', state.view);
      } catch {
        /* ignore */
      }
      applyView();
    });
  });
  loadMoreBtn.addEventListener('click', () => loadItems({ reset: false }));
}

function applyView() {
  cardsEl.className = `cards cards--${state.view}`;
  document.querySelectorAll('[data-view]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.view === state.view));
  });
}

// ---------- โหลดฟีด: GET /api/items ----------
async function loadItems({ reset }) {
  const token = ++loadToken;
  const page = reset ? 1 : state.page + 1;
  const params = new URLSearchParams({ sort: state.sort, page: String(page), limit: String(PAGE_SIZE) });
  if (state.q) params.set('q', state.q);
  if (state.category_id) params.set('category_id', state.category_id);
  if (state.type) params.set('type', state.type);
  const from = rangeToFrom(state.range);
  if (from) params.set('from', from);

  if (reset) {
    items = [];
    cardsEl.innerHTML = '';
    showStatus('Loading...');
    moreEl.hidden = true;
  } else {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = 'Loading...';
  }
  cardsEl.setAttribute('aria-busy', 'true');

  try {
    const data = await request(`/items?${params}`);
    if (token !== loadToken) return;
    items = reset ? data.items : [...items, ...data.items];
    state.page = data.pagination.page;
    state.totalPages = data.pagination.total_pages;
    render();
  } catch (error) {
    if (token !== loadToken) return;
    showStatus(errorText(error, 'Unable to load posts. Please try again.'), true);
  } finally {
    if (token === loadToken) {
      cardsEl.setAttribute('aria-busy', 'false');
      loadMoreBtn.disabled = false;
      loadMoreBtn.textContent = 'Load more';
    }
  }
}

/** วันที่เริ่มต้นตามเวลาไทย (YYYY-MM-DD) สำหรับ query from ของ API */
function rangeToFrom(range) {
  if (!range) return null;
  const bangkokDay = (date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const today = bangkokDay(new Date());
  if (range === 'today') return today;
  if (range === 'month') return `${today.slice(0, 8)}01`;
  return bangkokDay(new Date(Date.now() - 6 * 86_400_000)); // 7d: วันนี้และ 6 วันก่อนหน้า
}

function showStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message;
  statusEl.classList.toggle('feed__status--error', isError);
}

function render() {
  cardsEl.innerHTML = items.map(cardHtml).join('');
  const filtered = Boolean(state.q || state.category_id || state.type || state.range);
  if (!items.length) showStatus(filtered ? 'No posts match your search.' : 'No posts yet. Be the first to share something!');
  else showStatus('');
  moreEl.hidden = state.page >= state.totalPages;
}

function cardHtml(item) {
  const isMine = me && item.owner.id === me.id;
  const requested = requestedIds.has(item.id);
  const media = item.image_url
    ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" />`
    : icon('image');
  let disabledAttr = '';
  if (isMine) disabledAttr = 'disabled title="This is your post"';
  else if (requested) disabledAttr = 'disabled title="Request sent"';
  return `
    <article class="card" data-id="${item.id}">
      <header class="card__header">
        ${avatarHtml(item.owner)}
        <div class="card__meta">
          <p class="card__name">${escapeHtml(item.owner.name)} - <span>(${itemStatusLabel(item)})</span></p>
          <p class="card__caption">${escapeHtml(item.title)}</p>
        </div>
      </header>
      <button class="card__media" type="button" data-open-item="${item.id}" aria-label="View details of ${escapeHtml(item.title)}">${media}</button>
      <footer class="card__footer">
        <button class="chip card__request" type="button" data-request="${item.id}" ${disabledAttr}>${requested ? 'Requested' : 'Request'}</button>
      </footer>
    </article>`;
}

// ---------- ปุ่ม Request / กดรูปเพื่อดูรายละเอียด ----------
let requestItem = null;

cardsEl.addEventListener('click', (event) => {
  const open = event.target.closest('[data-open-item]');
  if (open) return openItem(Number(open.dataset.openItem));
  const btn = event.target.closest('[data-request]');
  if (!btn || btn.disabled) return;
  const item = items.find((i) => i.id === Number(btn.dataset.request));
  if (item) openRequest(item);
});

function openRequest(item) {
  requestItem = item;
  const modalId = item.type === 'swap' ? 'request-swap-modal' : 'request-give-modal';
  const dialog = openModal(modalId);
  const label = dialog?.querySelector('[data-request-item]');
  if (label) label.textContent = `${item.title} · ${item.owner.name}`;
  dialog?.querySelector('.modal__message')?.replaceChildren();
}

// ---------- รายละเอียดโพสต์: GET /api/items/:id ----------
let openItemId = null;

async function openItem(id) {
  openItemId = id;
  const summary = items.find((i) => i.id === id);
  $('item-modal-title').textContent = summary?.title ?? '';
  $('item-modal-owner').textContent = summary ? `POSTED BY ${summary.owner.name.toUpperCase()}` : '';
  $('item-modal-body').innerHTML = '<p class="details-text">Loading...</p>';
  const dialog = $('item-modal');
  if (!dialog.open) dialog.showModal();
  try {
    const { item } = await request(`/items/${id}`);
    if (openItemId !== id) return;
    $('item-modal-title').textContent = item.title;
    $('item-modal-owner').textContent = `POSTED BY ${item.owner.name.toUpperCase()}`;
    const isMine = me && item.owner.id === me.id;
    const canRequest = !isMine && !requestedIds.has(item.id) && ['available', 'pending'].includes(item.status);
    let label = 'Request';
    if (isMine) label = 'This is your post';
    else if (requestedIds.has(item.id)) label = 'Requested';
    $('item-modal-body').innerHTML = `
      ${gallery(item.images.map((i) => i.url), item.title)}
      ${itemFacts(item)}
      ${itemText(item)}
      <div class="details-actions">
        <button class="btn btn--primary" type="button" id="item-modal-request" ${canRequest ? '' : 'disabled'}>${label}</button>
      </div>`;
    $('item-modal-request').addEventListener('click', () => {
      dialog.close();
      openRequest(items.find((i) => i.id === item.id) ?? item);
    });
  } catch (error) {
    if (openItemId !== id) return;
    $('item-modal-body').innerHTML = `<p class="details-text" style="color: var(--color-danger)">${escapeHtml(
      errorText(error, 'Unable to load this post. Please try again.'),
    )}</p>`;
  }
}

/** ปิดปุ่มระหว่างส่ง เพื่อกันกดซ้ำ */
async function withSubmitting(form, label, task) {
  const btn = form.querySelector('button[type="submit"]');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await task();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------- สร้างโพสต์: POST /api/items (multipart/form-data) ----------
function bindCreatePost() {
  const form = $('create-post-form');
  const typeSelect = $('post-type');
  const desired = $('desired-field');
  const message = $('create-post-message');

  typeSelect.addEventListener('change', () => {
    desired.hidden = typeSelect.value !== 'swap';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = (name) => String(form.elements.namedItem(name).value ?? '').trim();
    const title = value('title');
    const categoryId = value('category_id');
    const type = value('type');
    const description = value('description');
    const desiredDescription = value('desired_description');

    const errors = [];
    if (!title) errors.push('Please enter the item name.');
    if (!categoryId) errors.push('Please choose a category.');
    if (!type) errors.push('Please choose a type.');
    if (type === 'swap' && !desiredDescription) errors.push('Please describe what you want in exchange.');
    message.textContent = errors.join(' ');
    if (errors.length) return;

    // ส่งเฉพาะฟิลด์ที่ API รับ — API ปฏิเสธฟิลด์ที่ไม่รู้จัก และฟิลด์ swap ในโพสต์ free
    const body = new FormData();
    body.append('title', title);
    body.append('category_id', categoryId);
    body.append('type', type);
    if (description) body.append('description', description);
    if (type === 'swap') body.append('desired_description', desiredDescription);
    postUploader.files().forEach((file) => body.append('images', file));

    await withSubmitting(form, 'Posting...', async () => {
      try {
        await request('/items', { method: 'POST', body });
        form.reset();
        desired.hidden = true;
        postUploader.reset();
        message.textContent = '';
        form.closest('dialog').close();
        await loadItems({ reset: true });
      } catch (error) {
        message.textContent = errorText(error, 'Unable to create the post. Please try again.');
      }
    });
  });
}

// ---------- ส่งคำขอ: POST /api/items/:id/requests (multipart/form-data) ----------
function bindRequestForms() {
  const give = $('request-give-form');
  give.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requestItem) return;
    const message = give.elements.namedItem('message').value.trim();
    const body = new FormData();
    if (message) body.append('message', message);
    await sendRequest(give, $('request-give-message'), body, () => give.reset());
  });

  const swap = $('request-swap-form');
  swap.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requestItem) return;
    const messageEl = $('request-swap-message');
    const message = swap.elements.namedItem('message').value.trim();
    const offer = swap.elements.namedItem('offer_description').value.trim();
    if (!offer) {
      messageEl.textContent = 'Please describe the item you offer.';
      return;
    }
    const body = new FormData();
    if (message) body.append('message', message);
    body.append('offer_description', offer);
    offerUploader.files().forEach((file) => body.append('offer_images', file));
    await sendRequest(swap, messageEl, body, () => {
      swap.reset();
      offerUploader.reset();
    });
  });
}

async function sendRequest(form, messageEl, body, onSuccess) {
  const item = requestItem;
  await withSubmitting(form, 'Sending...', async () => {
    try {
      await request(`/items/${item.id}/requests`, { method: 'POST', body });
      messageEl.textContent = '';
      onSuccess();
      requestedIds.add(item.id);
      // API เปลี่ยนโพสต์เป็น pending หลังมีคำขอแรก
      items = items.map((i) => (i.id === item.id ? { ...i, status: 'pending' } : i));
      render();
      form.closest('dialog').close();
    } catch (error) {
      if (error.status === 409 && error.code === 'CONFLICT') {
        requestedIds.add(item.id);
        render();
      }
      messageEl.textContent = errorText(error, 'Unable to send the request. Please try again.');
    }
  });
}

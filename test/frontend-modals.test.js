import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:3000/pages/profile.html',
});

const replacedUrls = [];
const mockLocation = {
  href: 'http://127.0.0.1:3000/pages/profile.html',
  pathname: '/pages/profile.html',
  search: '',
  replace(url) {
    replacedUrls.push(url);
  },
};

const fetchCalls = [];
let nextFetchImpl = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ok: true }),
});

globalThis.document = dom.window.document;
globalThis.HTMLImageElement = dom.window.HTMLImageElement;
globalThis.window = new Proxy(dom.window, {
  get(target, prop) {
    if (prop === 'location') return mockLocation;
    const val = Reflect.get(target, prop, target);
    return typeof val === 'function' ? val.bind(target) : val;
  },
});
globalThis.fetch = async (url, config) => {
  fetchCalls.push({ url, config });
  return nextFetchImpl(url, config);
};

const { bindLogoutConfirm } = await import('../frontend/assets/js/shared/logout-modal.js');
const { goToLogin } = await import('../frontend/assets/js/shared/session.js');
const {
  escapeHtml,
  setupAdminDeleteModal,
  setupAdminItemDetailModal,
} = await import('../frontend/assets/js/shared/admin-common.js');

function resetState() {
  fetchCalls.length = 0;
  replacedUrls.length = 0;
  nextFetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true }),
  });
}

test('escapeHtml safely coerces numbers and nullish values', () => {
  assert.equal(escapeHtml(42), '42');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml('<script>"x"</script>'), '&lt;script&gt;&quot;x&quot;&lt;/script&gt;');
});

test('goToLogin replaces history with ./login.html', () => {
  resetState();
  goToLogin();
  assert.deepEqual(replacedUrls, ['./login.html']);
});

test('bindLogoutConfirm requires confirmation and supports cancel/Escape without logging out', () => {
  resetState();
  const triggerBtn = document.createElement('button');
  triggerBtn.id = 'logout-btn';
  document.body.appendChild(triggerBtn);

  bindLogoutConfirm(triggerBtn, {
    title: 'Log out of KORNA?',
    description: 'You will need to sign in again.',
  });

  triggerBtn.focus();
  triggerBtn.click();

  const modal = document.getElementById('shared-logout-modal');
  assert.ok(modal, 'shared logout modal should be mounted');
  assert.equal(modal.classList.contains('active'), true);
  assert.equal(fetchCalls.length, 0, 'clicking logout button must not call API immediately');
  assert.equal(document.activeElement, modal.querySelector('.korna-logout-close'));

  // Escape closes without calling logout API and restores focus
  modal.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(fetchCalls.length, 0);
  assert.equal(document.activeElement, triggerBtn);

  // Reopen and cancel via Close (X) button
  triggerBtn.click();
  assert.equal(modal.classList.contains('active'), true);
  modal.querySelector('.korna-logout-close').click();
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(fetchCalls.length, 0);
});

test('bindLogoutConfirm posts to /api/auth/logout and replaces location on confirm (even on API error)', async () => {
  resetState();
  const triggerBtn = document.createElement('button');
  document.body.appendChild(triggerBtn);
  bindLogoutConfirm(triggerBtn);

  triggerBtn.click();
  const modal = document.getElementById('shared-logout-modal');
  const confirmBtn = modal.querySelector('.korna-logout-confirm');

  confirmBtn.click();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/auth/logout');
  assert.equal(fetchCalls[0].config.method, 'POST');
  assert.equal(fetchCalls[0].config.credentials, 'include');
  assert.deepEqual(replacedUrls, ['./login.html']);

  // Failure case still redirects safely
  resetState();
  confirmBtn.disabled = false;
  nextFetchImpl = async () => {
    throw new Error('network down');
  };
  confirmBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(replacedUrls, ['./login.html']);
});

test('setupAdminDeleteModal handles open, cancel/Escape, delete success, and delete error', async () => {
  resetState();
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="admin-modal-backdrop" id="delete-modal">
      <h3 id="delete-modal-title"></h3>
      <p id="delete-description"></p>
      <p id="delete-consequence"></p>
      <button id="delete-close-btn">x</button>
      <button id="delete-cancel-btn">Cancel</button>
      <button id="delete-confirm-btn">Delete</button>
      <p id="delete-error"></p>
      <strong id="delete-item-name"></strong>
    </div>
  `;
  document.body.appendChild(host);
  const modal = document.getElementById('delete-modal');
  const confirmBtn = document.getElementById('delete-confirm-btn');
  const errorEl = document.getElementById('delete-error');
  const nameEl = document.getElementById('delete-item-name');

  let deletedItem = null;
  const api = setupAdminDeleteModal({
    async onDeleted(item) {
      deletedItem = item;
    },
  });

  api.open({ id: 42, title: 'Desk Lamp' });
  assert.equal(modal.classList.contains('active'), true);
  assert.equal(nameEl.textContent, 'Desk Lamp');

  // Escape closes without DELETE request
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(fetchCalls.length, 0);

  // Error response displays error and keeps modal open
  api.open({ id: 42, title: 'Desk Lamp' });
  nextFetchImpl = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => ({ error: { message: 'Delete failed' } }),
  });
  confirmBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(modal.classList.contains('active'), true);
  assert.equal(errorEl.textContent, 'Delete failed');
  assert.equal(confirmBtn.disabled, false);

  // Success deletes item, closes modal, and calls onDeleted
  nextFetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true }),
  });
  confirmBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchCalls.at(-1).url, '/api/admin/items/42');
  assert.equal(fetchCalls.at(-1).config.method, 'DELETE');
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(deletedItem?.id, 42);

  api.open({ id: 43, title: 'Old Lamp', status: 'removed' });
  assert.equal(confirmBtn.textContent, 'Delete permanently');
  assert.match(document.getElementById('delete-consequence').textContent, /cannot be undone/);
  assert.equal(fetchCalls.length, 2);
  confirmBtn.click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchCalls.at(-1).url, '/api/admin/items/43/permanent');
  assert.equal(deletedItem?.id, 43);
});

test('setupAdminItemDetailModal populates fields safely and delegates delete action', () => {
  resetState();
  const host = document.createElement('div');
  host.innerHTML = `
    <div class="admin-modal-backdrop" id="item-detail-modal">
      <button id="detail-close-btn">x</button>
      <button id="detail-delete-btn">Delete</button>
      <h2 id="detail-title"></h2>
      <p id="detail-sub"></p>
      <span id="detail-owner"></span>
      <div id="detail-status-wrap"></div>
      <div id="detail-type-wrap"></div>
      <p id="detail-desc"></p>
      <div id="detail-swap-wrap"><p id="detail-swap-desc"></p></div>
      <img id="detail-img" />
    </div>
  `;
  document.body.appendChild(host);
  const modal = document.getElementById('item-detail-modal');
  const deleteBtn = document.getElementById('detail-delete-btn');

  let deleteRequestedFor = null;
  const detailApi = setupAdminItemDetailModal({
    onDelete(item) {
      deleteRequestedFor = item;
    },
  });

  detailApi.open(
    {
      id: 99,
      title: 'Mechanical Keyboard',
      status: 'available',
      type: 'swap',
      category: { name: 'Electronics' },
      created_at: '2026-11-10T10:00:00Z',
      owner: { name: 'Alice' },
      description: 'Clean condition',
      swap_details: { desired_description: 'Mousepad' },
      image_url: '/uploads/kb.png',
    },
    'Fallback',
  );

  assert.equal(modal.classList.contains('active'), true);
  assert.equal(document.getElementById('detail-title').textContent, 'Mechanical Keyboard');
  assert.equal(document.getElementById('detail-owner').textContent, 'Alice');
  assert.equal(document.getElementById('detail-swap-wrap').classList.contains('is-hidden'), false);
  assert.equal(document.getElementById('detail-swap-desc').textContent, 'Mousepad');
  assert.equal(document.getElementById('detail-img').getAttribute('src'), '/uploads/kb.png');
  assert.equal(document.getElementById('detail-img').classList.contains('is-hidden'), false);
  assert.equal(deleteBtn.disabled, false);

  deleteBtn.click();
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(deleteRequestedFor?.id, 99);

  // Removed item offers permanent deletion
  detailApi.open({ id: 100, title: 'Old Item', status: 'removed', type: 'free' }, 'Bob');
  assert.equal(document.getElementById('detail-owner').textContent, 'Bob');
  assert.equal(document.getElementById('detail-swap-wrap').classList.contains('is-hidden'), true);
  assert.equal(document.getElementById('detail-img').classList.contains('is-hidden'), true);
  assert.equal(deleteBtn.disabled, false);
  assert.equal(deleteBtn.textContent, 'Delete permanently');
});

test('frontend pages use shared logout modal instead of duplicated #logout-modal markup', async () => {
  const pages = [
    'frontend/pages/profile.html',
    'frontend/pages/admin-dashboard.html',
    'frontend/pages/admin-items.html',
    'frontend/pages/admin-users.html',
  ];

  for (const rel of pages) {
    const html = await fs.readFile(path.resolve(rel), 'utf8');
    const pageDom = new JSDOM(html);
    assert.equal(pageDom.window.document.getElementById('logout-modal'), null, `${rel} must not duplicate #logout-modal`);
    assert.ok(pageDom.window.document.getElementById('logout-btn'), `${rel} must retain #logout-btn trigger`);
  }

  const profileJs = await fs.readFile(path.resolve('frontend/assets/js/pages/profile.js'), 'utf8');
  assert.equal(profileJs.includes('bindLogoutConfirm'), true);
  assert.equal(profileJs.includes('pageshow'), true);
});

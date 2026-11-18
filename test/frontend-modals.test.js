import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

function createDomEnv() {
  const docListeners = new Map();
  const winListeners = new Map();
  let activeElement = null;
  let body;

  class FakeClassList {
    constructor(el) {
      this.el = el;
      this.set = new Set();
    }
    add(...names) {
      names.forEach((n) => this.set.add(n));
    }
    remove(...names) {
      names.forEach((n) => this.set.delete(n));
    }
    contains(name) {
      return this.set.has(name);
    }
  }

  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.id = '';
      this._className = '';
      this.classList = new FakeClassList(this);
      this.attrs = new Map();
      this.children = [];
      this.parentElement = null;
      this.listeners = new Map();
      this.textContent = '';
      this.disabled = false;
      this.src = '';
      this._innerHTML = '';
    }

    get className() {
      return this._className;
    }

    set className(val) {
      this._className = String(val || '');
      this.classList.set = new Set(this._className.split(/\s+/).filter(Boolean));
    }

    setAttribute(name, value) {
      this.attrs.set(name, String(value));
      if (name === 'id') this.id = String(value);
      if (name === 'class') this.className = String(value);
    }

    getAttribute(name) {
      return this.attrs.get(name) ?? null;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    append(...nodes) {
      nodes.forEach((n) => this.appendChild(n));
    }

    remove() {
      if (!this.parentElement) return;
      this.parentElement.children = this.parentElement.children.filter((c) => c !== this);
      this.parentElement = null;
    }

    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    }

    dispatchEvent(event) {
      event.target ??= this;
      event.preventDefault ??= () => {};
      const list = this.listeners.get(event.type) || [];
      for (const fn of list) fn(event);
    }

    focus() {
      activeElement = this;
    }

    matches(selector) {
      if (!selector) return false;
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      if (selector.startsWith('.')) {
        const cls = selector.slice(1).split('.')[0];
        return this.classList.contains(cls);
      }
      if (selector.includes('button:not([disabled])') && this.tagName === 'BUTTON' && !this.disabled) {
        return true;
      }
      if (selector.includes('[autofocus]:not([disabled])') && this.attrs.has('autofocus') && !this.disabled) {
        return true;
      }
      return false;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.matches(selector)) results.push(child);
          visit(child);
        }
      };
      visit(this);
      return results;
    }

    closest(selector) {
      let cur = this;
      while (cur) {
        if (cur.matches(selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      // Populate known modal elements when shared logout modal HTML is injected
      if (html.includes('shared-logout-title')) {
        this.children = [];
        const card = new FakeElement('div');
        card.className = 'korna-logout-card';
        const closeBtn = new FakeElement('button');
        closeBtn.className = 'korna-logout-close';
        const title = new FakeElement('h2');
        title.id = 'shared-logout-title';
        const desc = new FakeElement('p');
        desc.id = 'shared-logout-desc';
        const stayBtn = new FakeElement('button');
        stayBtn.className = 'korna-logout-stay';
        stayBtn.setAttribute('autofocus', '');
        const confirmBtn = new FakeElement('button');
        confirmBtn.className = 'korna-logout-confirm';
        card.append(closeBtn, title, desc, stayBtn, confirmBtn);
        this.appendChild(card);
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }
  }

  body = new FakeElement('body');

  const document = {
    body,
    get activeElement() {
      return activeElement;
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
    createElementNS(_ns, tag) {
      return new FakeElement(tag);
    },
    getElementById(id) {
      return body.querySelector(`#${id}`);
    },
    querySelector(sel) {
      if (sel === '.admin-modal-backdrop.active') {
        const visit = (node) => {
          for (const c of node.children) {
            if (c.classList.contains('admin-modal-backdrop') && c.classList.contains('active')) return c;
            const found = visit(c);
            if (found) return found;
          }
          return null;
        };
        return visit(body);
      }
      return body.querySelector(sel);
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      event.preventDefault ??= () => {};
      for (const fn of docListeners.get(event.type) || []) fn(event);
    },
  };

  const replacedUrls = [];
  const window = {
    location: {
      replace(url) {
        replacedUrls.push(url);
      },
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, []);
      winListeners.get(type).push(fn);
    },
    dispatchEvent(event) {
      for (const fn of winListeners.get(event.type) || []) fn(event);
    },
  };

  return { FakeElement, document, window, replacedUrls, resetActive: () => { activeElement = null; } };
}

const dom = createDomEnv();
const fetchCalls = [];
let nextFetchImpl = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ ok: true }),
});

globalThis.document = dom.document;
globalThis.window = dom.window;
globalThis.HTMLImageElement = class {};
globalThis.fetch = async (url, config) => {
  fetchCalls.push({ url, config });
  return nextFetchImpl(url, config);
};

const { bindLogoutConfirm } = await import('../frontend/assets/js/shared/logout-modal.js');
const { goToLogin } = await import('../frontend/assets/js/shared/session.js');
const {
  setupAdminDeleteModal,
  setupAdminItemDetailModal,
} = await import('../frontend/assets/js/shared/admin-common.js');

function resetState() {
  fetchCalls.length = 0;
  dom.replacedUrls.length = 0;
  dom.resetActive();
  nextFetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ ok: true }),
  });
}

test('goToLogin replaces history with ./login.html', () => {
  resetState();
  goToLogin();
  assert.deepEqual(dom.replacedUrls, ['./login.html']);
});

test('bindLogoutConfirm requires confirmation and supports cancel/Escape without logging out', () => {
  resetState();
  const triggerBtn = new dom.FakeElement('button');
  triggerBtn.id = 'logout-btn';
  dom.document.body.appendChild(triggerBtn);

  bindLogoutConfirm(triggerBtn, {
    title: 'Log out of KORNA?',
    description: 'You will need to sign in again.',
  });

  triggerBtn.focus();
  triggerBtn.dispatchEvent({ type: 'click' });

  const modal = dom.document.getElementById('shared-logout-modal');
  assert.ok(modal, 'shared logout modal should be mounted');
  assert.equal(modal.classList.contains('active'), true);
  assert.equal(fetchCalls.length, 0, 'clicking logout button must not call API immediately');
  assert.equal(dom.document.activeElement, modal.querySelector('.korna-logout-stay'));

  // Escape closes without calling logout API and restores focus
  modal.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(fetchCalls.length, 0);
  assert.equal(dom.document.activeElement, triggerBtn);

  // Reopen and cancel via Stay here button
  triggerBtn.dispatchEvent({ type: 'click' });
  assert.equal(modal.classList.contains('active'), true);
  modal.querySelector('.korna-logout-stay').dispatchEvent({ type: 'click' });
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(fetchCalls.length, 0);
});

test('bindLogoutConfirm posts to /api/auth/logout and replaces location on confirm (even on API error)', async () => {
  resetState();
  const triggerBtn = new dom.FakeElement('button');
  dom.document.body.appendChild(triggerBtn);
  bindLogoutConfirm(triggerBtn);

  triggerBtn.dispatchEvent({ type: 'click' });
  const modal = dom.document.getElementById('shared-logout-modal');
  const confirmBtn = modal.querySelector('.korna-logout-confirm');

  confirmBtn.dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, '/api/auth/logout');
  assert.equal(fetchCalls[0].config.method, 'POST');
  assert.equal(fetchCalls[0].config.credentials, 'include');
  assert.deepEqual(dom.replacedUrls, ['./login.html']);

  // Failure case still redirects safely
  resetState();
  confirmBtn.disabled = false;
  nextFetchImpl = async () => {
    throw new Error('network down');
  };
  confirmBtn.dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(dom.replacedUrls, ['./login.html']);
});

test('setupAdminDeleteModal handles open, cancel/Escape, delete success, and delete error', async () => {
  resetState();
  const makeEl = (tag, id, cls = '') => {
    const el = new dom.FakeElement(tag);
    el.id = id;
    if (cls) el.className = cls;
    return el;
  };

  const modal = makeEl('div', 'delete-modal', 'admin-modal-backdrop');
  const closeBtn = makeEl('button', 'delete-close-btn');
  const cancelBtn = makeEl('button', 'delete-cancel-btn');
  const confirmBtn = makeEl('button', 'delete-confirm-btn');
  const errorEl = makeEl('p', 'delete-error');
  const nameEl = makeEl('strong', 'delete-item-name');
  modal.append(closeBtn, cancelBtn, confirmBtn, errorEl, nameEl);
  dom.document.body.appendChild(modal);

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
  dom.document.dispatchEvent({ type: 'keydown', key: 'Escape' });
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
  confirmBtn.dispatchEvent({ type: 'click' });
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
  confirmBtn.dispatchEvent({ type: 'click' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(fetchCalls.at(-1).url, '/api/admin/items/42');
  assert.equal(fetchCalls.at(-1).config.method, 'DELETE');
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(deletedItem?.id, 42);
});

test('setupAdminItemDetailModal populates fields safely and delegates delete action', () => {
  resetState();
  const makeEl = (tag, id, cls = '') => {
    const el = new dom.FakeElement(tag);
    el.id = id;
    if (cls) el.className = cls;
    return el;
  };

  const modal = makeEl('div', 'item-detail-modal', 'admin-modal-backdrop');
  const closeBtn = makeEl('button', 'detail-close-btn');
  const deleteBtn = makeEl('button', 'detail-delete-btn');
  const titleEl = makeEl('h2', 'detail-title');
  const subEl = makeEl('p', 'detail-sub');
  const ownerEl = makeEl('span', 'detail-owner');
  const statusWrap = makeEl('div', 'detail-status-wrap');
  const typeWrap = makeEl('div', 'detail-type-wrap');
  const descEl = makeEl('p', 'detail-desc');
  const swapWrap = makeEl('div', 'detail-swap-wrap');
  const swapDesc = makeEl('p', 'detail-swap-desc');
  const imgEl = makeEl('img', 'detail-img');
  modal.append(closeBtn, deleteBtn, titleEl, subEl, ownerEl, statusWrap, typeWrap, descEl, swapWrap, swapDesc, imgEl);
  dom.document.body.appendChild(modal);

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
  assert.equal(titleEl.textContent, 'Mechanical Keyboard');
  assert.equal(ownerEl.textContent, 'Alice');
  assert.equal(swapWrap.classList.contains('is-hidden'), false);
  assert.equal(swapDesc.textContent, 'Mousepad');
  assert.equal(imgEl.src, '/uploads/kb.png');
  assert.equal(imgEl.classList.contains('is-hidden'), false);
  assert.equal(deleteBtn.disabled, false);

  deleteBtn.dispatchEvent({ type: 'click' });
  assert.equal(modal.classList.contains('active'), false);
  assert.equal(deleteRequestedFor?.id, 99);

  // Removed item disables delete button
  detailApi.open({ id: 100, title: 'Old Item', status: 'removed', type: 'free' }, 'Bob');
  assert.equal(ownerEl.textContent, 'Bob');
  assert.equal(swapWrap.classList.contains('is-hidden'), true);
  assert.equal(imgEl.classList.contains('is-hidden'), true);
  assert.equal(deleteBtn.disabled, true);
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
    assert.equal(html.includes('id="logout-modal"'), false, `${rel} must not duplicate #logout-modal HTML`);
    assert.equal(html.includes('id="logout-btn"'), true, `${rel} must retain #logout-btn trigger`);
  }

  const profileJs = await fs.readFile(path.resolve('frontend/assets/js/pages/profile.js'), 'utf8');
  assert.equal(profileJs.includes('bindLogoutConfirm'), true);
  assert.equal(profileJs.includes('pageshow'), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { chromium } from 'playwright-core';
import { pool } from '../backend/db.js';
import { hashPassword } from '../backend/password.js';

const BASE_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const CHROME_PATH = process.env.CHROME_PATH || '/home/if/.local/bin/google-chrome';

const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const normalEmail = `e2e-user-${suffix}@example.com`;
const adminEmail = `e2e-admin-${suffix}@example.com`;
const testPassword = 'E2E-Test-Password-123!';

let browser;
const createdUserIds = [];

test.before(async () => {
  const { passwordHash, passwordSalt } = await hashPassword(testPassword);

  const userRes = await pool.query(
    `INSERT INTO users (user_name, user_email, password_hash, password_salt, role, user_room_number)
     VALUES ($1, $2, $3, $4, 'user', 'E2E-101')
     RETURNING user_id`,
    ['E2E Member', normalEmail, passwordHash, passwordSalt],
  );
  createdUserIds.push(userRes.rows[0].user_id);

  const adminRes = await pool.query(
    `INSERT INTO users (user_name, user_email, password_hash, password_salt, role, user_room_number)
     VALUES ($1, $2, $3, $4, 'admin', 'E2E-999')
     RETURNING user_id`,
    ['E2E Admin', adminEmail, passwordHash, passwordSalt],
  );
  createdUserIds.push(adminRes.rows[0].user_id);

  browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
});

test.after(async () => {
  if (browser) await browser.close();
  if (createdUserIds.length) {
    await pool.query('DELETE FROM users WHERE user_id = ANY($1::bigint[])', [createdUserIds]);
  }
  await pool.end();
});

async function loginThroughUi(page, email, password, expectedUrlPart) {
  await page.goto(`${BASE_URL}/pages/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await Promise.all([
    page.waitForURL((url) => url.pathname.includes(expectedUrlPart), { timeout: 10000 }),
    page.click('button[type="submit"]'),
  ]);
}

test('E2E: unauthenticated visitors are redirected from profile and admin pages to login', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/pages/profile.html`, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => url.pathname.endsWith('/pages/login.html'), { timeout: 10000 });

  await page.goto(`${BASE_URL}/pages/admin-items.html`, { waitUntil: 'networkidle' });
  await page.waitForURL((url) => url.pathname.endsWith('/pages/login.html'), { timeout: 10000 });

  await context.close();
});

test('E2E: member login -> feed search -> profile -> logout cancel/confirm -> browser back blocked', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await loginThroughUi(page, normalEmail, testPassword, '/pages/feed.html');

  // Search on feed triggers /api/items?q=
  const searchRespPromise = page.waitForResponse(
    (res) => res.url().includes('/api/items') && res.url().includes('q=keyboard') && res.status() === 200,
  );
  await page.fill('#search-input', 'keyboard');
  await searchRespPromise;

  // Go to profile page
  await page.goto(`${BASE_URL}/pages/profile.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('#logout-btn');

  // Open logout modal and cancel via Escape
  await page.click('#logout-btn');
  await page.waitForSelector('#shared-logout-modal.active');
  await page.keyboard.press('Escape');
  const activeAfterEsc = await page.locator('#shared-logout-modal.active').count();
  assert.equal(activeAfterEsc, 0);
  assert.ok(page.url().includes('/pages/profile.html'));

  // Open logout modal and cancel via Close (X) button
  await page.click('#logout-btn');
  await page.waitForSelector('#shared-logout-modal.active');
  await page.click('.korna-logout-close');
  assert.equal(await page.locator('#shared-logout-modal.active').count(), 0);
  assert.ok(page.url().includes('/pages/profile.html'));

  // Confirm logout -> redirects to login.html
  await page.click('#logout-btn');
  await page.waitForSelector('#shared-logout-modal.active');
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith('/pages/login.html'), { timeout: 10000 }),
    page.click('.korna-logout-confirm'),
  ]);

  // Browser Back must not allow returning to authenticated profile content
  await page.goBack().catch(() => {});
  await page.waitForTimeout(300);
  assert.ok(
    !page.url().includes('/pages/profile.html'),
    `Expected not to stay on profile.html after logout + Back, got ${page.url()}`,
  );

  assert.deepEqual(pageErrors, []);
  await context.close();
});

test('E2E: admin login -> admin-items search -> shared logout modal -> browser back blocked', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await loginThroughUi(page, adminEmail, testPassword, '/pages/feed.html');

  await page.goto(`${BASE_URL}/pages/admin-dashboard.html`, { waitUntil: 'networkidle' });
  await page.goto(`${BASE_URL}/pages/admin-items.html`, { waitUntil: 'networkidle' });
  const adminSearchResp = page.waitForResponse(
    (res) => res.url().includes('/api/admin/items') && res.url().includes('q=chair') && res.status() === 200,
  );
  await page.fill('#items-search', 'chair');
  await adminSearchResp;

  // Shared logout modal on admin page
  await page.click('#logout-btn');
  await page.waitForSelector('#shared-logout-modal.active');
  await Promise.all([
    page.waitForURL((url) => url.pathname.endsWith('/pages/login.html'), { timeout: 10000 }),
    page.click('.korna-logout-confirm'),
  ]);

  await page.goBack().catch(() => {});
  await page.waitForTimeout(300);
  assert.ok(
    !page.url().includes('/pages/admin-items.html'),
    `Expected not to stay on admin-items.html after logout + Back, got ${page.url()}`,
  );

  assert.deepEqual(pageErrors, []);
  await context.close();
});

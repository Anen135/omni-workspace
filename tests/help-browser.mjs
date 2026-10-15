import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Fictional fixtures only; no live Omni requests.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5196, strictPort: true } });
let browser;
try {
  await server.listen();
  await mkdir('tmp', { recursive: true });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  let connected = false;
  const section = data => ({ data, error: null });
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'status') return route.fulfill({ json: { connected } });
    assert.equal(action, 'snapshot');
    return route.fulfill({ json: { account: { id: '1', name: 'Тестовый преподаватель', branch: 'Тестовый филиал' },
      fetchedAt: new Date().toISOString(), teachers: section([]), groups: section([]), schedule: section({}),
      presents: section({ cur_date: '2026-10-16', cur_lenta: '0', students: [], schedule: { 0: { name_spec: 'Тестовая пара' } } }),
      newHomework: section([]), homework: section([]), counts: { homework: 0, practice: 0 } } });
  });
  await page.goto('http://127.0.0.1:5196/');
  await page.locator('.sidebar nav button').last().click();
  await page.locator('.help-page').waitFor();
  assert.equal(await page.locator('.connection-card').count(), 0, 'help is available without a session');
  await page.getByRole('link', { name: 'Расчёт дохода', exact: true }).click();
  assert.equal(new URL(page.url()).hash, '', 'help anchors must not alter app navigation');
  await page.screenshot({ path: 'tmp/help-desktop.png' });
  connected = true;
  await page.reload();
  const tip = page.locator('.help-tip-trigger').first();
  await tip.waitFor();
  await tip.hover();
  await page.getByRole('tooltip').waitFor();
  assert.equal(await tip.getAttribute('aria-describedby'), await page.getByRole('tooltip').getAttribute('id'));
  await page.getByRole('tooltip').hover();
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole('tooltip').count(), 1, 'pointer can enter the explanation');
  await page.keyboard.press('Escape');
  await page.getByRole('tooltip').waitFor({ state: 'detached' });
  await tip.focus();
  await page.getByRole('tooltip').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await tip.evaluate(node => document.activeElement === node), true);
  await tip.click();
  await page.getByRole('tooltip').waitFor();
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).click();
  await page.getByRole('tooltip').waitFor({ state: 'detached' });
  await page.screenshot({ path: 'tmp/help-compact-lesson.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await tip.click();
  const bounds = await page.getByRole('tooltip').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, 'tip fits narrow viewport');
  await tip.click();
  await page.getByRole('tooltip').waitFor({ state: 'detached' });
  await tip.click();
  await page.screenshot({ path: 'tmp/help-tip-mobile.png' });
  await page.keyboard.press('Escape');
  await page.getByLabel('Раздел', { exact: true }).selectOption('help');
  assert.equal(await page.locator('.help-page-intro').evaluate(node => getComputedStyle(node).display), 'flex');
  assert.ok(await page.locator('.help-page-intro').evaluate(node => parseFloat(getComputedStyle(node).columnGap) >= 8));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'tmp/help-mobile.png' });
  await page.goto('http://127.0.0.1:5196/#demo');
  await page.getByRole('button', { name: 'С прошлого урока', exact: true }).click();
  const modalTip = page.locator('dialog[open] .help-tip-trigger');
  await modalTip.click();
  assert.equal(await page.getByRole('tooltip').evaluate(node => !!node.closest('dialog[open]')), true, 'modal tip participates in the dialog top layer');
  await page.getByRole('tooltip').hover();
  await page.screenshot({ path: 'tmp/help-tip-modal.png' });
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.locator('.mobile-toggle').click();
  await page.getByRole('button', { name: 'Справка', exact: true }).click();
  await page.locator('.help-page').waitFor();
  assert.equal(await page.getByText('Вы сейчас в демонстрационном режиме.', { exact: false }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('PASS: disconnected/live/demo help navigation, local anchors, hover/focus/tap/Escape/outside tips and mobile bounds.');
} finally { await browser?.close(); await server.close(); }

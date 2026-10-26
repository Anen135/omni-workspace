import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5197, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  let checks = 0;
  let connected = false;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const section = { data: [], error: null };
  await page.route('**/api/omni/**', route => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'connect') return route.fulfill({ json: { connected: false, state: 'login' } });
    if (action === 'status') {
      checks++;
      return route.fulfill({ json: { connected, state: connected ? 'ready' : 'login' } });
    }
    assert.equal(action, 'snapshot', 'settings/polling never send domain writes');
    return route.fulfill({ json: {
      account: { id: '1', name: 'Тестовый преподаватель', branch: 'Тест' },
      schedule: section, presents: { data: {}, error: null }, groups: section,
      teachers: section, homework: section, newHomework: section,
      counts: { homework: 0, practice: 0 }, fetchedAt: new Date().toISOString(),
    } });
  });
  await page.goto('http://127.0.0.1:5197/');
  await page.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  const interval = page.getByLabel('Интервал проверки подключения');
  assert.equal(await interval.inputValue(), '60');
  const initial = checks;
  await page.clock.runFor(59999);
  assert.equal(checks, initial, 'no early periodic check');
  const firstCheck = page.waitForResponse(response => response.url().endsWith('/status'));
  await page.clock.runFor(1);
  await firstCheck;
  assert.equal(checks, initial + 1, 'default interval is one minute');
  await interval.selectOption('15');
  await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('status').filter({ hasText: 'Настройки сохранены.' }).waitFor();
  const changedCheck = page.waitForResponse(response => response.url().endsWith('/status'));
  await page.clock.runFor(15000);
  await changedCheck;
  assert.equal(checks, initial + 2, 'saved interval is applied without reload');
  await page.reload();
  await interval.waitFor();
  assert.equal(await interval.inputValue(), '15', 'saved preference survives reload');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log('PASS: settings default/save/reload, 60s/15s recovery polling and mobile width. Fictional read-only fixtures.');
} finally {
  await browser?.close();
  await server.close();
}

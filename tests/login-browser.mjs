import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5186, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  let outcome = 'LOGIN_REJECTED';
  let loginCalls = 0;
  let connectCalls = 0;
  const section = { data: [], error: null };
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'login') {
      loginCalls++;
      assert.deepEqual(route.request().postDataJSON(), { username: 'fixture-user', password: 'fixture-password' });
      assert.equal(route.request().headers()['x-omni-client'], 'workspace');
      if (outcome !== 'ready') return route.fulfill({ status: 401, json: { error: { code: outcome, message: outcome === 'CHALLENGE' ? 'Omni требует проверку браузера.' : 'Проверьте логин и пароль.' } } });
      return route.fulfill({ json: { connected: true, state: 'ready' } });
    }
    if (action === 'connect') connectCalls++;
    if (action === 'snapshot') return route.fulfill({ json: { account: { id: '1', name: 'Тестовый преподаватель' }, schedule: section, presents: section, groups: section, homework: section, newHomework: section, teachers: section, counts: { homework: 0, practice: 0 }, fetchedAt: new Date().toISOString() } });
    return route.fulfill({ json: { connected: false, state: 'login' } });
  });
  await page.goto('http://127.0.0.1:5186');
  const login = page.getByLabel('Логин Omni');
  const password = page.getByLabel('Пароль', { exact: true });
  await login.fill('fixture-user');
  async function submit() {
    await password.fill('fixture-password');
    await page.getByRole('button', { name: 'Войти в Omni', exact: true }).click();
  }
  await submit();
  await page.getByRole('alert').filter({ hasText: 'Проверьте логин и пароль.' }).waitFor();
  assert.equal(await password.inputValue(), '');
  assert.equal(await login.inputValue(), 'fixture-user');
  assert.equal(connectCalls, 0);
  outcome = 'CHALLENGE';
  await submit();
  await page.getByRole('alert').filter({ hasText: 'Omni требует проверку браузера.' }).waitFor();
  await page.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  await page.getByRole('heading', { name: 'Завершите вход в окне Omni' }).waitFor();
  assert.equal(connectCalls, 1);
  outcome = 'ready';
  await submit();
  await page.getByRole('heading', { name: 'Ваше рабочее пространство.' }).waitFor();
  assert.equal(loginCalls, 3);
  assert.equal(await page.locator('input[type=password]').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }).includes('fixture-password')), false);
  console.log('PASS: login form, password clearing, rejected login, challenge fallback, success and snapshot loading. All credentials fictional; no requests to Omni.');
} finally { await browser?.close(); await server.close(); }

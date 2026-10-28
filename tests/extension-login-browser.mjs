import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const origin = 'https://omni.top-academy.ru';
const profile = await mkdtemp(resolve(tmpdir(), 'omni-login-test-'));
let context;
try {
  const extension = resolve('dist-extension');
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  await worker.evaluate(() => {
    globalThis.loginFixtureMessages = [];
    chrome.runtime.onMessage.addListener(message => { globalThis.loginFixtureMessages.push(JSON.stringify(message)); });
  });
  const waitContent = async () => {
    const started = await worker.evaluate(async origin => {
      for (let attempt = 0; attempt < 80; attempt++) {
        const tab = (await chrome.tabs.query({ url: origin + '/*' })).find(tab => tab.url?.startsWith(origin));
        if (tab) {
          const result = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', func: () => !!globalThis.omniWorkspaceStarted });
          if (result[0]?.result) return true;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return false;
    }, origin);
    assert.equal(started, true, 'heavy controller has started before native-choice assertions');
  };
  await context.addCookies([{ name: 'fixture-cookie', value: 'official-session', url: origin }]);
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  let signedIn = false;
  let variant = 'plain';
  let loginBehavior = 'reject';
  let loginPosts = 0;
  let profiles = 0;
  let delayNative = true;
  let releaseNative;
  const nativeReady = new Promise(resolve => { releaseNative = resolve; });
  let releaseLogin;
  let heldLogin;
  const secret = 'fixture-password-never-persist';
  await context.route(origin + '/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/fixture-slow.js') { await nativeReady; return route.fulfill({ contentType: 'text/javascript', body: '' }); }
    if (request.isNavigationRequest()) {
      const child = path === '/frame-login';
      const login = path.startsWith('/login') || child;
      const csrf = ['missing-csrf', 'delayed-csrf'].includes(variant) && login ? '' : '<meta name="csrf-token" content="fixture-csrf">';
      const challenge = variant === 'captcha' && login ? '<div class="g-recaptcha">Fixture verification</div>' : '';
      const otp = variant === 'otp' && login ? '<input autocomplete="one-time-code">' : '';
      const form = variant === 'reset' && login ? '<form id="native-login" action="/auth/reset"><input name="new_password" type="password" autocomplete="new-password"><input name="new_password_confirm" type="password" autocomplete="new-password"></form>' : login ? '<form id="native-login"><input name="username"><input name="password" type="password">' + otp + '</form>' : '';
      const renderedForm = variant === 'delayed-form' && login ? '' : form;
      const delayed = variant === 'delayed-form' && login ? `<script>setTimeout(() => document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(form)}), 600)</script>`
        : variant === 'delayed-csrf' && login ? '<script>setTimeout(() => {const meta=document.createElement("meta");meta.name="csrf-token";meta.content="fixture-csrf";document.head.append(meta);},600)</script>' : '';
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html>${csrf}<title>${variant === 'ddos' && login ? 'DDoS-Guard' : 'Fixture Omni'}</title><body><main id="native-marker">Original content</main>${delayNative && !child ? '<script src="/fixture-slow.js"></script>' : ''}${renderedForm}${challenge}${delayed}${login && !child ? '<iframe id="child-frame" src="/frame-login"></iframe>' : ''}</body>` });
    }
    if (path === '/auth/login') {
      loginPosts++;
      assert.equal(request.method(), 'POST');
      assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
      assert.match(request.headers().cookie, /fixture-cookie=official-session/);
      assert.deepEqual(request.postDataJSON(), { LoginForm: { id_city: null, username: 'fixture-teacher', password: secret } });
      if (loginBehavior === 'hold') await heldLogin;
      if (loginBehavior === 'challenge') return route.fulfill({ status: 403, body: 'verification required' });
      if (loginBehavior === 'reject') return route.fulfill({ json: { success: false, error: { password: secret } } });
      signedIn = true;
      return route.fulfill({ json: { success: true, IdLocalHash: 'fixture-login-hash' } });
    }
    if (path === '/profile/get-profile') {
      profiles++;
      return route.fulfill(signedIn ? { json: { teach_info: { id_teach: 1, fio_teach: 'Тестовый преподаватель' } } } : { status: 401, body: '' });
    }
    if (path === '/auth/get-start-info') return route.fulfill({ json: { branch: { name: 'Тестовый филиал' } } });
    if (path === '/presents/get-presents') return route.fulfill({ json: {} });
    if (['/auth/get-teach-list', '/schedule/get-schedule', '/students/get-groups-list', '/homework/get-group-spec', '/homework/get-new-homeworks'].includes(path)) return route.fulfill({ json: [] });
    if (path === '/favicon.ico') return route.fulfill({ status: 404 });
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/login/index', { waitUntil: 'commit' });
  await page.getByRole('status').filter({ hasText: 'Загружаем Omni Workspace' }).waitFor();
  await page.locator('#native-marker').waitFor({ state: 'attached' });
  assert.equal(await page.locator('#native-marker').isVisible(), false, 'native page is concealed before its blocking script finishes');
  assert.equal(await page.locator('.extension-auth-form').count(), 0, 'small bootstrap precedes the heavy app');
  delayNative = false; releaseNative();
  await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  assert.equal(await page.locator('#native-login').isVisible(), false);
  assert.equal(await page.frameLocator('#child-frame').locator('#omni-workspace-root').count(), 0, 'no takeover in a child frame');
  await mkdir('tmp', { recursive: true });
  await page.screenshot({ path: 'tmp/extension-own-login.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('#omni-workspace-root').evaluate(node => node.scrollWidth <= node.clientWidth));
  await page.screenshot({ path: 'tmp/extension-own-login-mobile.png', animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.querySelector('#omni-workspace-root')?.getAttribute('data-omni-theme') === 'dark');
  assert.notEqual(await page.locator('.connection-card').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
  await page.screenshot({ path: 'tmp/extension-own-login-dark.png', animations: 'disabled' });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.locator('.sidebar').getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.getByRole('heading', { name: 'Настройки', exact: true }).waitFor();
  await page.locator('.sidebar').getByRole('button', { name: 'Мой урок', exact: true }).click();
  await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  assert.equal(await page.locator('.extension-auth-shell').count(), 0, 'login is embedded in the normal workspace with usable navigation');
  const fill = async () => {
    await page.getByLabel('Логин Omni', { exact: true }).fill(' fixture-teacher ');
    await page.getByLabel('Пароль', { exact: true }).fill(secret);
  };
  await fill();
  await page.getByRole('button', { name: 'Войти в Omni', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByLabel('Пароль', { exact: true }).inputValue(), '');
  assert.equal((await page.getByRole('alert').innerText()).includes(secret), false);
  assert.equal(loginPosts, 1);

  loginBehavior = 'challenge';
  await fill();
  await page.getByRole('button', { name: 'Войти в Omni', exact: true }).click();
  await page.locator('#native-login input[type=password]').first().waitFor();
  assert.equal(await page.locator('#omni-workspace-root').count(), 0, 'server challenge restores official form');
  assert.equal(await page.locator('#native-login').evaluate(node => node.inert), false);
  await page.reload();
  await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  await page.locator('#native-login input[type=password]').first().waitFor();
  await page.reload();
  await page.locator('#native-login input[type=password]').first().waitFor();
  assert.equal(await page.locator('#omni-workspace-root').count(), 0, 'only explicit official escape survives reload');

  for (const delayedManual of ['missing-csrf', 'delayed-form', 'delayed-csrf']) {
    variant = delayedManual;
    await page.goto(origin + '/login/index');
    await page.locator('#native-login input[type=password]').first().waitFor();
    await waitContent();
    assert.equal(await page.locator('#omni-workspace-root').count(), 0, 'explicit native choice is respected during delayed form/token loading');
  }
  await worker.evaluate(async origin => {
    const tab = (await chrome.tabs.query({ url: origin + '/*' })).find(tab => tab.url?.startsWith(origin));
    await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', func: () => {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
      try {
        Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Fixture storage blocked', 'SecurityError'); } });
        window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
      } finally {
        Object.defineProperty(window, 'sessionStorage', descriptor);
      }
    } });
  }, origin);
  assert.equal(await page.locator('#omni-workspace-root').count(), 0, 'in-memory manual choice survives lifecycle restore with blocked storage');
  variant = 'plain';
  const reset = async () => {
    await page.evaluate(() => sessionStorage.removeItem('omni.native-login'));
    await page.goto(origin + '/login/index');
  };
  for (const fallback of ['captcha', 'ddos', 'otp', 'missing-csrf', 'reset']) {
    variant = fallback;
    await reset();
    if (fallback === 'missing-csrf') await page.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
    await page.locator('#native-login input[type=password]').first().waitFor();
    assert.equal(await page.locator('#omni-workspace-root').count(), 0, `${fallback} keeps native recovery usable`);
  }
  variant = 'captcha';
  await reset();
  await page.locator('#native-login input[type=password]').first().waitFor();
  // Model completion of the official verification without bypassing any real service.
  await page.locator('.g-recaptcha').evaluate(node => node.remove());
  await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  assert.equal(await page.locator('#native-login').isVisible(), false, 'custom login resumes when the official challenge completes in the same document');
  for (const delayed of ['delayed-form', 'delayed-csrf']) {
    variant = delayed;
    await reset();
    await page.locator('.connection-card').waitFor();
    assert.equal(await page.getByText('Открываем рабочее пространство', { exact: true }).count(), 0);
    await page.locator('.sidebar').waitFor();
    assert.equal(await page.locator('#native-marker').isVisible(), false);
    await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  }
  variant = 'plain';
  await page.evaluate(() => sessionStorage.setItem('omni.native-login', '1'));
  await page.goto(origin + '/login/index');
  await page.getByLabel('Логин Omni', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('omni.native-login')), null, 'old automatic-fallback flag is cleared');
  loginBehavior = 'hold';
  heldLogin = new Promise(resolve => { releaseLogin = resolve; });
  await fill();
  await page.getByRole('button', { name: 'Войти в Omni', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.extension-auth-form')?.getAttribute('aria-busy') === 'true');
  await page.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  loginBehavior = 'success'; releaseLogin();
  await page.locator('#native-login input[type=password]').first().waitFor();
  assert.equal(await page.evaluate(() => sessionStorage.getItem('IdLocalHash')), null, 'abandoned request cannot commit a late hash');

  signedIn = false;
  await reset();
  loginBehavior = 'hold';
  heldLogin = new Promise(resolve => { releaseLogin = resolve; });
  await fill();
  const before = loginPosts;
  await page.getByRole('button', { name: 'Войти в Omni', exact: true }).click();
  await page.locator('.extension-auth-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  assert.equal(await page.getByLabel('Пароль', { exact: true }).inputValue(), '');
  await page.waitForTimeout(100);
  assert.equal(loginPosts, before + 1, 'duplicate submit cannot send a second login');
  loginBehavior = 'success'; releaseLogin();
  await page.waitForURL(origin + '/');
  await page.locator('.connected-badge').waitFor();
  assert.ok(profiles > 0, 'workspace is gated by actual profile verification');
  assert.equal(await page.evaluate(() => sessionStorage.getItem('omni.native-login')), null);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('IdLocalHash')), 'fixture-login-hash');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.equal(await page.locator('#omni-workspace-root').count(), 0);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.locator('.connected-badge').waitFor();
  const secretsLeaked = await worker.evaluate(async secret => {
    const messages = globalThis.loginFixtureMessages || [];
    const stored = JSON.stringify({ local: await chrome.storage.local.get(null), session: await chrome.storage.session.get(null) });
    return messages.some(message => message.includes(secret) || message.includes('fixture-teacher')) || stored.includes(secret) || stored.includes('fixture-teacher');
  }, secret);
  assert.equal(secretsLeaked, false, 'credentials never enter extension messages or storage');
  assert.deepEqual(errors, []);
  console.log('PASS: early no-flash loader, own login/CSRF/cookie/duplicate guard, secret cleanup, native challenge/OTP/failure/bypass, verified profile, frame isolation and bfcache recovery. Fictional credentials only.');
} finally {
  await context?.close();
  if (profile.startsWith(resolve(tmpdir()) + '\\') && profile.includes('omni-login-test-')) await rm(profile, { recursive: true, force: true });
}

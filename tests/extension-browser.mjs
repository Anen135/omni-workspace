import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const profile = await mkdtemp(resolve(tmpdir(), 'omni-extension-test-'));
const extension = resolve('dist-extension');
let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const stream = 'BT /F1 24 Tf 40 700 Td (Extension PDF fixture) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await worker.evaluate(pdf => {
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://fs.top-academy.ru/api/v1/files/pdf-fixture' || options.credentials !== 'omit') throw new Error('Unexpected network request in fixture');
      const result = new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    };
  }, pdf);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const paths = [];
  let signedIn = false;
  let teacherId = 1;
  let rejectSwitch = false;
  const empty = {};
  // All Omni responses are fictional: no real login, cookies or academic data.
  await context.route('https://omni.top-academy.ru/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && path === '/auth/logout') {
      signedIn = false;
      paths.push(path);
      return route.fulfill({ status: 302, headers: { location: 'https://omni.top-academy.ru/login/index' } });
    }
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="csrf-token" content="fixture-csrf"><title>Fixture Omni</title>${signedIn ? '' : '<input type="password">'}<script>globalThis.angular = { element: () => ({ injector: () => ({ get: () => ({ clearLocalStorage: () => sessionStorage.setItem('switch-cleaned', 'yes') }) }) }) };</script>` });
    if (path === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (request.method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    paths.push(path);
    assert.equal(request.method(), 'POST');
    assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
    let data = empty;
    if (path === '/profile/get-profile') data = { teach_info: { id_teach: teacherId, fio_teach: `Тестовый преподаватель ${teacherId}` } };
    if (path === '/auth/get-teach-list') data = [1, 2].map(id => ({ id_teach: id, fio_teach: `Тестовый преподаватель ${id}` }));
    if (path === '/auth/change-user') {
      assert.equal(request.headers()['id-local-hash'], 'fixture-hash');
      const input = request.postDataJSON();
      assert.deepEqual(Object.keys(input), ['id_user']);
      assert.ok(['1', '2'].includes(input.id_user));
      if (!rejectSwitch) teacherId = Number(input.id_user);
      data = { success: !rejectSwitch };
    }
    if (path === '/auth/get-start-info') data = { branch: { name: 'Тестовая академия' } };
    if (path === '/students/get-groups-list') data = [];
    if (path === '/homework/get-new-homeworks') data = [{ filename: 'fixture.pdf', download_url_stud: 'https://fs.top-academy.ru/api/v1/files/pdf-fixture' }];
    assert.ok(signedIn);
    return route.fulfill({ json: data });
  });
  const ui = await context.newPage();
  ui.setDefaultTimeout(15000);
  await ui.goto(`chrome-extension://${id}/index.html`);
  await ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).waitFor();
  assert.equal(await ui.locator('input[type=password]').count(), 0);
  const [official] = await Promise.all([context.waitForEvent('page'), ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click()]);
  await official.waitForURL('https://omni.top-academy.ru/**');
  await official.waitForLoadState('domcontentloaded');
  assert.equal(new URL(official.url()).origin, 'https://omni.top-academy.ru');
  await official.locator('input[type=password]').waitFor();
  // Simulates completion of an official login, without ever sending a password.
  await official.evaluate(() => { document.querySelector('input').remove(); sessionStorage.setItem('IdLocalHash', 'fixture-hash'); });
  signedIn = true;
  await ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  await ui.getByRole('heading', { name: 'Мой урок' }).waitFor();
  assert.ok(paths.includes('/schedule/get-schedule'));
  assert.ok(paths.filter(path => path === '/profile/get-profile').length >= 2);
  await ui.getByRole('button', { name: 'Домашние задания', exact: true }).click();
  await ui.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
  await ui.locator('.remote-attachment canvas[data-rendered="true"]').waitFor();
  const external = await worker.evaluate(async () => {
    const { omniTabId } = await chrome.storage.session.get('omniTabId');
    const result = await chrome.scripting.executeScript({ target: { tabId: omniTabId }, func: () => chrome.runtime.sendMessage({ action: 'status', input: {} }) });
    return result[0].result;
  });
  assert.equal(external.error.code, 'FORBIDDEN');
  const forbidden = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'eval', input: { code: 'alert(1)' } }));
  assert.equal(forbidden.error.code, 'BAD_INPUT');
  const actAs = ui.getByLabel('Работаю от имени', { exact: true });
  assert.equal(await actAs.isEnabled(), true);
  const capabilities = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'capabilities', input: {} }));
  assert.equal(capabilities.data.teacherSwitch, true);
  assert.equal(capabilities.data.version, '0.3.0');
  assert.equal(capabilities.data.accountSwitch, true);
  const malformed = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '', accountId: '1' } }));
  assert.match(malformed.error.message, /идентификатор выбранного преподавателя/);
  const denied = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '999', accountId: '1' } }));
  assert.equal(denied.error.code, 'TEACHER_NOT_ALLOWED');
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  const stale = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '2', accountId: '9' } }));
  assert.equal(stale.error.code, 'ACCOUNT_CHANGED');
  // Simulate a new interface talking to the pre-switching background worker.
  await ui.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = message => message.action === 'capabilities'
      ? Promise.resolve({ error: { code: 'BAD_INPUT', message: 'Команда или параметры не поддерживаются.' } })
      : send(message);
  });
  await actAs.selectOption('2');
  await ui.getByRole('alert').filter({ hasText: 'Фоновый обработчик расширения устарел' }).waitFor();
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  await ui.reload();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  await actAs.selectOption('2');
  await ui.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await actAs.inputValue(), '2');
  assert.equal(await official.evaluate(() => sessionStorage.getItem('switch-cleaned')), 'yes');
  assert.equal(await ui.locator('.file-preview-full').count(), 0);
  assert.equal(await ui.getByRole('heading', { name: 'Мой урок' }).count(), 1);
  rejectSwitch = true;
  await actAs.selectOption('1');
  await ui.getByRole('alert').filter({ hasText: 'Omni отклонил переключение' }).waitFor();
  assert.equal(await ui.locator('.lesson-banner').count(), 0);
  assert.equal(teacherId, 2);
  await ui.reload();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  ui.once('dialog', dialog => dialog.dismiss());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  assert.equal(paths.filter(path => path === '/auth/logout').length, 0);
  assert.equal(await actAs.inputValue(), '2');
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  await official.waitForURL('https://omni.top-academy.ru/login/index');
  await ui.getByRole('heading', { name: 'Завершите вход в окне Omni' }).waitFor();
  assert.equal(await ui.locator('.lesson-banner').count(), 0);
  assert.equal(await ui.locator('input[type=password]').count(), 0);
  assert.equal(paths.filter(path => path === '/auth/logout').length, 1);
  teacherId = 3; signedIn = true;
  await official.goto('https://omni.top-academy.ru/');
  await ui.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await actAs.inputValue(), '3');
  await official.close();
  const status = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'status', input: {} }));
  assert.equal(status.data.connected, false);
  assert.deepEqual(errors, []);
  console.log('PASS: MV3 snapshot/PDF, teacher switching, validation/rejections, stale worker, account change confirmation/cancel/logout/login, old data cleared, automatic new snapshot, sender restrictions and closed-tab recovery. All data fictional.');
} finally {
  await context?.close();
  // Only the unique temporary test profile created above is removed.
  if (profile.startsWith(resolve(tmpdir()) + '\\') && profile.includes('omni-extension-test-')) await rm(profile, { recursive: true, force: true });
}

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
  const empty = {};
  // All Omni responses are fictional: no real login, cookies or academic data.
  await context.route('https://omni.top-academy.ru/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="csrf-token" content="fixture-csrf"><title>Fixture Omni</title><input type="password">' });
    if (path === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (request.method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    paths.push(path);
    assert.equal(request.method(), 'POST');
    assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
    let data = empty;
    if (path === '/profile/get-profile') data = { teach_info: { id_teach: 1, fio_teach: 'Тестовый преподаватель' } };
    if (path === '/auth/get-teach-list') data = [];
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
  await ui.getByRole('heading', { name: 'Ваше рабочее пространство.' }).waitFor();
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
  await official.close();
  const status = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'status', input: {} }));
  assert.equal(status.data.connected, false);
  assert.deepEqual(errors, []);
  console.log('PASS: actual MV3 installation, bundled UI, official tab, isolated agent, session headers, snapshot, PDF canvas, rejected sender/command and closed-tab recovery. All data fictional.');
} finally {
  await context?.close();
  // Only the unique temporary test profile created above is removed.
  if (profile.startsWith(resolve(tmpdir()) + '\\') && profile.includes('omni-extension-test-')) await rm(profile, { recursive: true, force: true });
}

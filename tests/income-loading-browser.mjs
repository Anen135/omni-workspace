import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const today = '2026-10-14';
const weekFor = (offset, date = today) => {
  const start = new Date(`${date}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + offset * 7);
  return { body: {}, dates: Object.fromEntries(Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start); day.setUTCDate(day.getUTCDate() + index);
    return [index + 1, day.toISOString().slice(0, 10)];
  })) };
};
const html = `<html><body><div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TeacherDossier } from '/src/features/dossier/TeacherDossier.tsx';
window.events = []; window.failures = [];
function Harness() {
  const [props, setProps] = React.useState({ accountId: '101', branch: 'a', today: '${today}', active: true, refreshKey: 0,
    schedule: { data: ${JSON.stringify(weekFor(0))}, error: null } });
  window.update = next => setProps(current => ({ ...current, ...next }));
  return React.createElement(TeacherDossier, { ...props, key: JSON.stringify([props.accountId, props.branch]), accountName: 'Fixture', disabled: false,
    onIncomeLoading: loading => window.events.push(loading), onConnectionError: reason => window.failures.push(reason.code) });
}
createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode, null, React.createElement(Harness)));
</script></body></html>`;
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5194, strictPort: true },
  plugins: [{ name: 'income-loading-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      if (req.url !== '/fixture') return next();
      res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/fixture', html));
    });
  } }] });
const reads = [];
let dossierReads = 0;
let failWeek = null;
let weekMode = 'full';
let wrongAccount = false;
let hold = false;
let release;
let date = today;
const incomingWeek = week => {
  const data = weekFor(week, date);
  if (week === 0 && weekMode !== 'full') {
    data.body = { 1: { 1: { groups: 'Fixture', scheduleType: 'planned', name_spec: 'Known lesson' } } };
    if (weekMode === 'partial') data.dates = { 1: data.dates[1], 2: data.dates[2] };
    if (weekMode === 'wrong-range') data.dates[2] = weekFor(1, date).dates[1];
  }
  return data;
};
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'teacher-dossier') {
      dossierReads++;
      return route.fulfill({ json: { account: { id: await page.evaluate(() => window.fixtureAccount || '101'), name: 'Fixture' },
        all: { data: {}, error: null }, single: { data: null, error: null }, graphics: { data: null, error: null } } });
    }
    assert.equal(action, 'schedule-range');
    const input = route.request().postDataJSON();
    reads.push(input);
    if (hold) await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { account: { id: wrongAccount ? '999' : input.accountId }, weeks: input.weeks.map(week => ({ week,
      schedule: week === failWeek ? { data: null, error: 'Unavailable' } : { data: incomingWeek(week), error: null } })) } });
  });
  const settle = async () => {
    await page.waitForFunction(() => window.events.length > 0 && window.events.at(-1) === false);
    await page.waitForFunction(() => document.querySelector('.teacher-dossier')?.getAttribute('aria-busy') === 'false');
    // Allow deferred activation/scope effects to run before counting requests.
    await page.waitForTimeout(80);
  };
  await page.goto('http://127.0.0.1:5194/fixture');
  await settle();
  assert.equal(dossierReads, 1, 'StrictMode sends one initial teacher-dossier request');
  assert.equal(reads.length, 1);
  assert.equal(reads[0].weeks.length, 13, '14 recent weeks minus the exact supplied current week, versus 49 previously');
  assert.equal(reads[0].weeks.includes(0), false);
  assert.equal(await page.locator('.dossier-summary-card').count() > 0, true);
  const beforeReturn = reads.length;
  await page.evaluate(() => window.update({ active: false }));
  await page.waitForTimeout(30);
  await page.evaluate(() => window.update({ active: true }));
  await settle();
  assert.equal(reads.length, beforeReturn, 'returning to a completed dossier sends zero reads');
  assert.equal(dossierReads, 1);

  failWeek = -20;
  const priorWeeks = new Set(reads.flatMap(item => item.weeks).concat(0));
  await page.getByRole('button', { name: 'Загрузить историю за год', exact: true }).click();
  await settle();
  const added = reads.slice(beforeReturn).flatMap(item => item.weeks);
  assert.equal(added.length, 35);
  assert.ok(added.every(week => !priorWeeks.has(week)), 'year extension retains every successful recent week');
  assert.ok(reads.every(item => item.weeks.length <= 16));
  const beforeRetry = reads.length;
  failWeek = null;
  await page.getByRole('button', { name: 'Повторить недостающие недели', exact: true }).click();
  await settle();
  assert.deepEqual(reads.slice(beforeRetry).flatMap(item => item.weeks), [-20], 'partial retry reads only the failed week');

  const beforeRefresh = reads.length;
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await settle();
  assert.equal(reads.slice(beforeRefresh).flatMap(item => item.weeks).length, 49, 'explicit refresh rereads the entire selected scope, including supplied week');

  weekMode = 'partial';
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await settle();
  const monthPlan = page.locator('.dossier-summary-card').filter({ has: page.getByText('План на текущий месяц', { exact: true }) });
  assert.match(await monthPlan.locator('dd').first().innerText(), /700/, 'partial dated week retains its known lesson amount');
  assert.match(await monthPlan.innerText(), /без данных: 5/, 'the five omitted days remain unknown');
  const beforePartialReturn = reads.length;
  await page.evaluate(() => window.update({ active: false }));
  await page.waitForTimeout(30);
  await page.evaluate(() => window.update({ active: true }));
  await settle();
  assert.equal(reads.length, beforePartialReturn, 'navigation does not reread valid partial responses');
  await page.getByRole('button', { name: 'Повторить недостающие недели', exact: true }).click();
  await settle();
  assert.deepEqual(reads.slice(beforePartialReturn).flatMap(item => item.weeks), [0], 'explicit retry rereads only the partial week');
  await page.waitForTimeout(100);
  assert.equal(reads.length, beforePartialReturn + 1, 'another partial result does not cause an automatic retry loop');
  weekMode = 'complete';
  await page.getByRole('button', { name: 'Повторить недостающие недели', exact: true }).click();
  await settle();
  assert.equal((await monthPlan.locator('dd').first().innerText()).replace(/\s+/g, ' '), '700 ₽');
  const afterComplete = reads.length;
  await page.evaluate(() => window.update({ active: false }));
  await page.waitForTimeout(30);
  await page.evaluate(() => window.update({ active: true }));
  await settle();
  assert.equal(reads.length, afterComplete, 'the completed week now satisfies cached requests');
  weekMode = 'wrong-range';
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await settle();
  assert.equal(await monthPlan.locator('dd').first().innerText(), '—', 'mixed calendar weeks discard the invalid lesson amount');
  weekMode = 'full';
  await page.getByRole('button', { name: 'Повторить недостающие недели', exact: true }).click();
  await settle();

  // Leave while the first batch is in flight: its ownership persists until settle,
  // and no later batch starts until the panel becomes active again.
  hold = true;
  const beforePause = reads.length;
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await page.waitForFunction(() => window.events.at(-1) === true);
  while (!release) await page.waitForTimeout(10);
  await page.evaluate(() => window.update({ active: false }));
  await page.waitForTimeout(30);
  assert.equal(await page.evaluate(() => window.events.at(-1)), true);
  hold = false; release(); release = undefined;
  await settle();
  assert.equal(reads.length, beforePause + 1, 'inactive panel stops after the actual in-flight batch settles');
  await page.evaluate(() => window.update({ active: true }));
  await settle();
  assert.equal(reads.slice(beforePause).flatMap(item => item.weeks).length, 49, 'resume reads only remaining batches');

  // Date context changes reject a supplied schedule from the old calendar week.
  const beforeDate = reads.length;
  date = '2026-10-21';
  await page.evaluate(() => window.update({ today: '2026-10-21', schedule: { data: { dates: { 1: '2026-10-12' }, body: {} }, error: null } }));
  await settle();
  assert.ok(reads.slice(beforeDate).some(item => item.weeks.includes(0)), 'wrong/partial snapshot range does not seed current week');

  // Identity change remounts the local state; no account-A weeks serve account B.
  const beforeAccount = reads.length;
  await page.evaluate(() => { window.fixtureAccount = '102'; window.update({ accountId: '102', schedule: { data: null, error: null } }); });
  await settle();
  assert.equal(dossierReads, 2);
  assert.ok(reads.slice(beforeAccount).every(item => item.accountId === '102'));
  assert.ok(reads.slice(beforeAccount).flatMap(item => item.weeks).length >= 13);

  const settings = page.locator('.dossier-income-settings');
  await settings.locator('summary').click();
  const beforePayday = reads.length;
  const knownWeeks = new Set(reads.slice(beforeAccount).flatMap(item => item.weeks));
  await settings.getByLabel('День выплаты', { exact: true }).fill('28');
  await settings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  await settle();
  const paydayReads = reads.slice(beforePayday).flatMap(item => item.weeks);
  assert.ok(paydayReads.length > 0, 'new payday extends the previous closed pay cycle');
  assert.ok(paydayReads.every(week => !knownWeeks.has(week)), 'payday changes reuse every successful week');
  const afterPayday = reads.length;
  await settings.getByLabel('День выплаты', { exact: true }).fill('10');
  await settings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  await settle();
  assert.equal(reads.length, afterPayday, 'returning to a covered payday needs no reads');

  hold = true;
  const beforeInvalidate = reads.length;
  const beforeInvalidDossier = dossierReads;
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  while (!release) await page.waitForTimeout(10);
  await page.evaluate(() => window.update({ refreshKey: 1 }));
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.events.at(-1)), true, 'refresh invalidation retains the old transport owner');
  assert.equal(dossierReads, beforeInvalidDossier, 'new dossier read waits for the old income transport');
  hold = false; release(); release = undefined;
  await page.waitForFunction(() => window.events.at(-1) === false && window.events.length >= 2);
  await page.waitForFunction(() => document.querySelector('.dossier-income-summary'));
  await settle();
  assert.equal(dossierReads, beforeInvalidDossier + 1);
  assert.equal(reads.length, beforeInvalidate + 2, 'old read settles, then fresh context gets one recent batch');

  wrongAccount = true;
  await page.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await settle();
  assert.deepEqual(await page.evaluate(() => window.failures), ['ACCOUNT_CHANGED']);
  assert.deepEqual(errors, []);
  const events = await page.evaluate(() => window.events);
  assert.ok(events.every((value, index) => value === (index % 2 === 0)), 'every busy true has exactly one settled false');
  console.log('PASS: StrictMode single dossier load; 13 versus 49 initial week reads; return 0 reads; explicit year 35 missing weeks; partial retry 1 week; fresh refresh; pause/resume ownership; date/account guards. Fixture only.');
} finally { await browser?.close(); await server.close(); }

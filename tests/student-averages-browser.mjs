import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// The real hook and request queue run against held fictional HTTP responses.
// No account, roster or photo request leaves this local fixture.
const fixture = `
import React, { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useStudentAverages } from '/src/app/useStudentAverages';
import { omniRequest } from '/src/services/omni-client';
const root = createRoot(document.getElementById('root'));
const snapshot = account => ({ account: { id: account, name: account, branch: 'fixture-branch' } });
let props = { snapshot: snapshot('teacher-a'), groupIds: ['1'], enabled: false };
window.averageStates = [];
function Fixture({ snapshot, groupIds, enabled }) {
  const result = useStudentAverages(snapshot, groupIds, enabled);
  const state = { account: snapshot.account.id, enabled, loading: result.loading,
    values: [...(result.values ?? [])], photos: [...(result.photos ?? [])], error: result.error };
  useLayoutEffect(() => { window.averageStates.push(state); });
  return <div><output id="values">{JSON.stringify(state.values)}</output><output id="photos">{JSON.stringify(state.photos)}</output>
    <output id="loading">{String(state.loading)}</output><output id="error">{state.error}</output>
    {state.loading && <span className="average-skeleton">Loading averages</span>}
  </div>;
}
const render = () => flushSync(() => root.render(<Fixture {...props}/>));
window.patchAverages = patch => { props = { ...props, ...patch }; render(); };
window.freshAverages = (account, group, enabled = true) => { props = { snapshot: snapshot(account), groupIds: [group], enabled }; render(); };
window.holdTransport = () => { window.transportDone = false; void omniRequest('fixture-hold').then(() => { window.transportDone = true; }); };
render();
`;
const server = await createServer({ configFile: false, server: {
  host: '127.0.0.1', port: 5207, strictPort: true,
  watch: { ignored: ['**/dist*/**', '**/tmp/**', '**/.omni-browser/**'] },
}, plugins: [{
  name: 'student-averages-fixture',
  resolveId(id) { if (id === '/student-averages-fixture.tsx') return id; },
  load(id) { if (id === '/student-averages-fixture.tsx') return fixture; },
}] });
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const wait = async promise => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Held fixture request did not start')), 10000); })]); }
  finally { clearTimeout(timer); }
};
const roster = (account, id, average) => ({ account: { id: account, branch: 'fixture-branch' }, students: [{ id_stud: id, gpa: average, photo_pas: `https://example.invalid/fixture-${id}.png` }] });
const plans = [], requests = [], unexpected = [];
function hold(group, response, status = 200) {
  const started = deferred(), released = deferred();
  const plan = { group, response, status, started, released };
  plans.push(plan);
  return { started: started.promise, release: () => released.resolve() };
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    const group = action === 'fixture-hold' ? 'transport' : route.request().postDataJSON().group;
    requests.push({ action, group });
    const next = plans.shift();
    if (!next || next.group !== group || !['group', 'fixture-hold'].includes(action)) {
      unexpected.push({ action, group, expected: next?.group });
      await route.fulfill({ status: 500, json: { error: { code: 'FIXTURE_ERROR', message: 'Unexpected fixture request' } } });
      return;
    }
    next.started.resolve();
    await next.released.promise;
    await route.fulfill({ status: next.status, json: next.response });
  });
  await page.route('**/student-averages-fixture.html', route => route.fulfill({ contentType: 'text/html', body: '<html><div id="root"></div><script type="module" src="/student-averages-fixture.tsx"></script></html>' }));
  await page.goto('http://127.0.0.1:5207/student-averages-fixture.html');
  await page.waitForFunction(() => typeof window.patchAverages === 'function');
  const values = async () => JSON.parse(await page.locator('#values').textContent());
  const photos = async () => JSON.parse(await page.locator('#photos').textContent());

  // Enable changes do not replace the snapshot or group key. Cancellation must
  // clear the completion marker after the old active transport settles.
  const oldSameContext = hold('1', roster('teacher-a', '101', '1'));
  await page.evaluate(() => window.patchAverages({ enabled: true }));
  await wait(oldSameContext.started);
  await page.evaluate(() => window.patchAverages({ enabled: false }));
  await page.evaluate(() => window.patchAverages({ enabled: true }));
  assert.equal(await page.locator('#loading').textContent(), 'true');
  const restarted = hold('1', roster('teacher-a', '102', '9.5'));
  oldSameContext.release();
  await wait(restarted.started);
  assert.deepEqual(await values(), [], 'cancelled active read never publishes its old average');
  assert.deepEqual(await photos(), [], 'cancelled active read never publishes its old photo');
  assert.equal(await page.locator('.average-skeleton').count(), 1, 'same-context restart remains visibly loading');
  restarted.release();
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'false');
  assert.deepEqual(await values(), [['102', '9.5']]);
  assert.deepEqual(await photos(), [['102', 'https://example.invalid/fixture-102.png']]);
  assert.equal(await page.evaluate(() => window.averageStates.some(state => state.values.some(([id]) => id === '101'))), false);

  // Changing account/group while a previous read owns the transport clears
  // existing context data synchronously, and ignores the delayed private roster.
  const oldAccount = hold('2', roster('teacher-a', '201', '2'));
  await page.evaluate(() => window.freshAverages('teacher-a', '2'));
  await wait(oldAccount.started);
  const newAccount = hold('3', roster('teacher-b', '301', '11'));
  await page.evaluate(() => window.freshAverages('teacher-b', '3'));
  assert.deepEqual(await values(), []);
  assert.deepEqual(await photos(), []);
  oldAccount.release();
  await wait(newAccount.started);
  assert.deepEqual(await values(), [], 'old account response cannot populate the new account');
  assert.deepEqual(await photos(), []);
  newAccount.release();
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'false');
  assert.deepEqual(await values(), [['301', '11']]);
  assert.deepEqual(await photos(), [['301', 'https://example.invalid/fixture-301.png']]);
  assert.equal(await page.evaluate(() => window.averageStates.some(state => state.account === 'teacher-b' && (state.values.some(([id]) => id !== '301') || state.photos.some(([id]) => id !== '301')))), false);

  // Keep a foreground request active so the hook's next background read queues;
  // disabling it must remove that queued read before it can reach HTTP.
  await page.evaluate(() => window.patchAverages({ enabled: false }));
  const transport = hold('transport', {});
  await page.evaluate(() => window.holdTransport());
  await wait(transport.started);
  await page.evaluate(() => window.freshAverages('teacher-b', '4'));
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'true');
  await page.evaluate(() => window.patchAverages({ enabled: false }));
  transport.release();
  await page.waitForFunction(() => window.transportDone);
  assert.equal(requests.filter(request => request.group === '4').length, 0, 'aborted queued background read never dispatches');
  const afterQueuedAbort = hold('4', roster('teacher-b', '401', '8'));
  await page.evaluate(() => window.patchAverages({ enabled: true }));
  await wait(afterQueuedAbort.started);
  afterQueuedAbort.release();
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'false');
  assert.deepEqual(await values(), [['401', '8']], 'aborted queued context can subsequently restart');

  // A failed fresh snapshot never keeps an indefinite skeleton or old cache.
  const failed = hold('5', { error: { code: 'ROSTER_UNAVAILABLE', message: 'Fixture roster failed' } }, 503);
  await page.evaluate(() => window.freshAverages('teacher-b', '5'));
  await wait(failed.started); failed.release();
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'false');
  assert.equal(await page.locator('.average-skeleton').count(), 0);
  assert.equal(await page.locator('#error').textContent(), 'Fixture roster failed');
  assert.deepEqual(await values(), []);
  assert.deepEqual(await photos(), []);
  const recovered = hold('5', roster('teacher-b', '501', '0'));
  await page.evaluate(() => window.freshAverages('teacher-b', '5'));
  await wait(recovered.started); recovered.release();
  await page.waitForFunction(() => document.querySelector('#loading').textContent === 'false');
  assert.deepEqual(await values(), [['501', '0']], 'fresh snapshot recovers and retains a real zero average');
  assert.equal(await page.locator('#error').textContent(), '');
  assert.deepEqual(requests.map(request => request.group), ['1', '1', '2', '3', 'transport', '4', '5', '5']);
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  console.log('PASS real averages hook: active same-context cancellation/restart, account isolation, queued background abort, stopped error skeleton and fresh-snapshot recovery');
} finally {
  for (const plan of plans) plan.released.resolve();
  await browser?.close();
  await server.close();
}

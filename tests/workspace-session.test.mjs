import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { resolve } from 'node:path';
class FixtureConnectionError extends Error { constructor(code, message) { super(message); this.code = code; } }
globalThis.sessionConnectionError = FixtureConnectionError;

const { outputFiles } = await build({ entryPoints: ['src/app/workspace-session.ts', 'src/app/workspace-homework.ts', 'src/app/workspace-navigation.ts', 'src/app/workspace-lesson-draft.ts', 'src/app/useWorkspaceController.ts'], outdir: 'tmp/session-test-bundle', bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'session-transport-fixture', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'fixture' }));
    builder.onResolve({ filter: /services\/omni-client$/ }, () => ({ path: 'client', namespace: 'fixture' }));
    builder.onResolve({ filter: /extension-client$/ }, () => ({ path: 'extension', namespace: 'fixture' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: resolve('.'), contents: args.path === 'react' ? `export * from ${JSON.stringify(resolve('node_modules/react/index.js'))}; export { default } from ${JSON.stringify(resolve('node_modules/react/index.js'))}; export const useState = value => globalThis.sessionHooks.useState(value); export const useRef = value => globalThis.sessionHooks.useRef(value); export const useEffect = effect => globalThis.sessionHooks.useEffect(effect); export const useMemo = factory => factory();` : args.path === 'extension'
      ? 'export const onExtensionSessionChange = callback => { globalThis.sessionRevision = callback; return () => {}; }; export const isExtension = () => true; export const extensionRequest = (action, input) => globalThis.sessionBufferRequest(input);'
      : 'export const ConnectionError = globalThis.sessionConnectionError; export const invalidatePendingOmniRequests = () => { globalThis.sessionInvalidations++; }; export const omniRequest = (...args) => globalThis.sessionRequest(...args); export const rows = value => Array.isArray(value) ? value : []; export const label = value => value == null ? "" : String(value); export const record = value => value && typeof value === "object" ? value : {};', loader: 'js' }));
  } }],
});
const load = async name => import('data:text/javascript;base64,' + Buffer.from(outputFiles.find(file => file.path.endsWith(name + '.js')).text).toString('base64'));
const { createWorkspaceSession } = await load('workspace-session');
const { createWorkspaceHomework } = await load('workspace-homework');
const { createWorkspaceNavigation } = await load('workspace-navigation');
const { createWorkspaceLessonDraft } = await load('workspace-lesson-draft');
const { useWorkspaceController } = await load('useWorkspaceController');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const state = { busy: false, error: '', snapshot: { account: { id: '1' } }, waiting: false, authNeeded: false };
  const options = { week: 0, operation: { current: false }, sessionVersion: { current: 0 }, currentAccount: { current: '1' }, lastBranch: { current: '' }, draft: undefined, presentData: {}, draftKey: '', snapshot: state.snapshot, hasDrafts: false, ensureAccount() {}, reconcileDrafts() {}, failed: reason => { state.error = reason.message; } };
  for (const name of ['Busy', 'Error', 'Snapshot', 'Waiting', 'AuthNeeded', 'ConnectionState', 'ChangingAccount', 'SwitchingTeacher', 'LessonDrafts', 'GroupStudents', 'GroupName', 'GroupId', 'Detail', 'Lesson', 'Week', 'HomeworkSaved', 'HomeworkNeedsReload', 'HomeworkSaving', 'AttendanceSaving', 'RosterRevision', 'BufferedDrafts', 'Notice']) {
    const key = name[0].toLowerCase() + name.slice(1);
    options['set' + name] = value => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  }
  globalThis.window = { confirm: () => true };
  const calls = [];
  const pending = deferred();
  globalThis.sessionRequest = action => { calls.push(action); return pending.promise; };
  return { state, options, calls, pending, actions: createWorkspaceSession(options) };
}
for (const action of ['refresh', 'connect', 'login', 'changeAccount', 'switchTeacher']) {
  for (const outcome of ['success', 'rejection']) test(action + ' ignores stale ' + outcome + ' and preserves newer operation ownership', async () => {
    const f = fixture();
    const work = action === 'login' ? f.actions.login('fixture', 'fictional') : action === 'switchTeacher' ? f.actions.switchTeacher('2') : f.actions[action]();
    f.options.sessionVersion.current++;
    Object.assign(f.state, { busy: true, error: 'new session error', snapshot: { account: { id: '3' } }, changingAccount: true, switchingTeacher: true, waiting: true });
    f.options.operation.current = true;
    const before = structuredClone(f.state);
    if (outcome === 'rejection') f.pending.reject(new Error('obsolete error'));
    else f.pending.resolve(action === 'refresh' ? { account: { id: '1' }, presents: { data: {} } } : { connected: true, state: 'connected', account: { id: '2' } });
    await work;
    assert.deepEqual(f.state, before);
    assert.equal(f.options.operation.current, true);
    assert.equal(f.calls.length, 1, 'obsolete completion does not initiate a snapshot');
  });
}
test('initial disconnected status settles into polling instead of leaving startup unchanged', async () => {
  const f = fixture(); const cleanup = f.actions.watchInitialStatus();
  f.pending.resolve({ connected: false, state: 'loading' }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.waiting, true); assert.equal(f.state.connectionState, 'loading'); cleanup();
});
test('initial login status exposes authentication and initial failure is visible', async () => {
  for (const failure of [false, true]) {
    const f = fixture(); f.actions.watchInitialStatus();
    if (failure) f.pending.reject(new Error('status unavailable')); else f.pending.resolve({ connected: false, state: 'login' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(f.state.authNeeded, true);
    if (failure) assert.equal(f.state.error, 'status unavailable');
  }
});
test('disposed initial status cannot start refresh or change connection UI', async () => {
  const f = fixture(); const cleanup = f.actions.watchInitialStatus(); cleanup(); const before = structuredClone(f.state);
  f.pending.resolve({ connected: true }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.state, before); assert.deepEqual(f.calls, ['status']);
});

for (const name of ['lesson load', 'homework refresh', 'homework grade', 'lesson save']) {
  for (const rejected of [false, true]) test(name + ' stale completion preserves current lock and loading flags (' + (rejected ? 'reject' : 'resolve') + ')', async () => {
    const f = fixture();
    Object.assign(f.options, { selectedDate: '2026-10-12', tab: 'lesson', setTab() {}, homeworkNeedsReload: false, attendanceReason: '', hasTheme: true, draftKey: JSON.stringify(['1', '', '2026-10-12', '10', '0', '50']), draft: { attendance: {}, marks: {}, rewards: {} }, lessonStudents: [], bufferedDrafts: [], attemptedBuffers: { current: new Set() } });
    globalThis.sessionBufferRequest = input => input.op === 'checkpoint' ? Promise.resolve(null) : f.pending.promise;
    const actions = name.startsWith('homework') ? createWorkspaceHomework(f.options) : name === 'lesson save' ? createWorkspaceLessonDraft(f.options) : createWorkspaceNavigation(f.options);
    const work = (name === 'lesson load' ? actions.loadLesson() : name === 'homework refresh' ? actions.refreshHomework() : name === 'homework grade' ? actions.gradeHomework([{ key: 'fictional', studentId: '1' }], 10) : actions.saveLessonDraft()).catch(() => {});
    f.options.sessionVersion.current++;
    Object.assign(f.state, { busy: true, error: 'new error', snapshot: { account: { id: '3' } }, homeworkSaving: true, attendanceSaving: true, rosterRevision: 9 });
    const before = structuredClone(f.state);
    if (rejected) f.pending.reject(new Error('obsolete failure')); else f.pending.resolve(null);
    await work;
    assert.equal(f.options.operation.current, true); assert.deepEqual(f.state, before);
  });
}
for (const rejected of [false, true]) test('obsolete buffered discard cannot clear current draft/error (' + (rejected ? 'reject' : 'resolve') + ')', async () => {
  const f = fixture(); const key = 'fictional-key';
  Object.assign(f.options, { draftKey: key, bufferedDrafts: [{ key, revision: 'old' }] });
  globalThis.sessionBufferRequest = () => f.pending.promise;
  const work = createWorkspaceLessonDraft(f.options).clearLessonDraft(); f.options.sessionVersion.current++;
  Object.assign(f.state, { error: 'new error', lessonDrafts: { [key]: { fresh: true } }, bufferedDrafts: [{ key, revision: 'new' }] });
  const before = structuredClone(f.state);
  if (rejected) f.pending.reject(new Error('old discard')); else f.pending.resolve({ key, revision: 'old-claimed' });
  await work; assert.deepEqual(f.state, before);
});

for (const entry of ['revision', 'AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE']) test('controller ' + entry + ' advances epoch and resets obsolete UI before a new action', async () => {
  const values = []; const effects = []; let cursor = 0;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.sessionInvalidations = 0;
  globalThis.sessionHooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial; return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useEffect(effect) { effects.push(effect); },
  };
  const render = () => { cursor = 0; return useWorkspaceController({}); };
  let model = render();
  if (entry === 'revision') effects.find(effect => effect.toString().includes('onExtensionSessionChange'))();
  const first = deferred(); const second = deferred(); const calls = [];
  globalThis.sessionRequest = action => { calls.push(action); return calls.length === 1 ? first.promise : second.promise; };
  const oldLogin = model.session.login('fictional', 'password');
  assert.equal(render().session.busy, true);
  const version = model.session.sessionVersion.current;
  if (entry === 'revision') globalThis.sessionRevision(); else model.page.failed(new FixtureConnectionError(entry, 'current auth error'));
  model = render();
  assert.equal(model.session.sessionVersion.current, version + 1);
  assert.equal(globalThis.sessionInvalidations, 1);
  assert.equal(model.session.busy, false); assert.equal(model.session.snapshot, null);
  const newLogin = model.session.login('new', 'fictional');
  first.reject(new Error('obsolete login rejection')); await oldLogin;
  assert.equal(render().session.busy, true); assert.equal(render().session.error, '');
  second.reject(new Error('current login rejection')); await newLogin;
  assert.equal(render().session.busy, false); assert.equal(render().session.error, 'current login rejection');
});
test('current teacher identity mismatch is rejected without a follow-up read', async () => {
  const f = fixture(); const work = f.actions.switchTeacher('2'); f.pending.resolve({ account: { id: '3' } }); await work;
  assert.match(f.state.error, /не подтвердил/); assert.deepEqual(f.calls, ['switch-teacher']);
});
test('initial BUSY becomes polling and obsolete initial status is ignored', async () => {
  const f = fixture(); f.actions.watchInitialStatus(); f.pending.reject(new FixtureConnectionError('BUSY', 'busy')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.waiting, true); assert.equal(f.state.error, '');
  const stale = fixture(); stale.actions.watchInitialStatus(); stale.options.sessionVersion.current++; const before = structuredClone(stale.state);
  stale.pending.resolve({ connected: false, state: 'login' }); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(stale.state, before);
});

for (const hold of ['confirmed checkpoint', 'remove']) test('lesson Save preserves durable completion without stale UI at ' + hold, async () => {
  const f = fixture(); const key = JSON.stringify(['1', '', '2026-10-12', '10', '0', '50']);
  const student = { id_stud: '101', id_vizit: '201', was: 1, prize: 0, mark2: null, mark4: null, theme: 'Saved theme' };
  const presents = { cur_date: '2026-10-12', cur_group: 10, cur_lenta: 0, cur_schedule: 50, students: [student] };
  const mark = type => ({ stud: '101', type, mark: 10, previousMark: null, visit: '201' });
  const draft = { attendance: {}, marks: { '101:2': mark(2), ...(hold === 'confirmed checkpoint' ? { '101:4': mark(4) } : {}) }, rewards: {} };
  Object.assign(f.options, { snapshot: { account: { id: '1', branch: '' } }, draftKey: key, draft, lessonStudents: [student], attendanceReason: '', hasTheme: true, bufferedDrafts: [], attemptedBuffers: { current: new Set() } });
  const entered = deferred(); const release = deferred(); let paused = false; let envelope = null; let revision = 0; const commands = []; const bufferOps = [];
  globalThis.sessionRequest = async (action, input) => {
    commands.push(action);
    if (action === 'snapshot') return { account: { id: '1', branch: '' } };
    if (action === 'set-lesson-mark') student['mark' + input.type] = input.mark;
    return { account: { id: '1', branch: '' }, presents };
  };
  globalThis.sessionBufferRequest = async input => {
    bufferOps.push(input.op + ':' + (input.state || ''));
    if (!paused && commands.includes('set-lesson-mark') && (hold === 'remove' ? input.op === 'remove' : input.op === 'checkpoint' && input.state === 'ready')) {
      paused = true; entered.resolve(); await release.promise;
    }
    if (input.op === 'remove') { envelope = null; return null; }
    envelope = { key, draft: structuredClone(input.draft), state: input.state, revision: String(++revision) }; return envelope;
  };
  Object.assign(f.state, { bufferedDrafts: [], rosterRevision: 0 });
  const work = createWorkspaceLessonDraft(f.options).saveLessonDraft();
  const timer = setTimeout(() => entered.reject(new Error('did not reach held Save stage: ' + JSON.stringify({ commands, bufferOps, state: f.state }))), 2000);
  try { await entered.promise; } finally { clearTimeout(timer); }
  assert.equal(commands.filter(action => action === 'set-lesson-mark').length, 1, 'fixture reaches a confirmed mutation');
  f.options.sessionVersion.current++;
  Object.assign(f.state, { busy: true, attendanceSaving: true, error: 'new error', notice: 'new notice', rosterRevision: 8, lessonDrafts: { current: { fresh: true } }, bufferedDrafts: [{ key: 'new-session' }] });
  const before = structuredClone(f.state); release.resolve(); await work;
  assert.deepEqual(f.state, before); assert.equal(f.options.operation.current, true);
  assert.equal(commands.filter(action => action === 'set-lesson-mark').length, 1, 'no next write from obsolete Save');
  if (hold === 'remove') { assert.equal(envelope, null); assert.ok(bufferOps.includes('remove:')); }
  else { assert.ok(envelope); assert.equal(envelope.state, 'review'); assert.deepEqual(Object.keys(envelope.draft.marks), ['101:4'], 'confirmed mark removed from durable remainder'); }
});

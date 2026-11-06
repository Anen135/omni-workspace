import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { build } from 'esbuild';

// Exercise the branch's actual nested handlers/effects without exposing test APIs
// or copying the component's composition into a second production controller.
const source = await readFile(new URL('../src/app/LiveWorkspace.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('LiveWorkspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'LiveWorkspace');
const declarations = component.body.statements.filter(ts.isFunctionDeclaration);
const methodNames = new Set(declarations.map(node => node.name.text));
const effects = component.body.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'useEffect').map(node => node.expression.arguments[0]);
const initial = effects.find(node => node.getText(ast).includes("('status')") && node.getText(ast).includes('cancelled'));
const revision = effects.find(node => node.getText(ast).includes('onExtensionSessionChange'));
assert.ok(initial && revision);
let incomeCallback;
function findIncomeCallback(node) { if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onIncomeLoading') incomeCallback = node.initializer.expression.getText(ast); ts.forEachChild(node, findIncomeCallback); }
findIncomeCallback(component);
assert.ok(incomeCallback);
const code = ts.transpileModule('const incomeGeneration = sessionVersion.current; const onIncomeLoading = ' + incomeCallback + ';\n' + declarations.map(node => node.getText(ast)).join('\n') + '\nconst watchInitialStatus = ' + initial.getText(ast) + ';\nconst watchRevision = ' + revision.getText(ast) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const names = ['refresh', 'connect', 'login', 'changeAccount', 'switchTeacher', 'loadLesson', 'refreshHomework', 'gradeHomework', 'saveLessonDraft', 'clearLessonDraft', 'failed', 'watchInitialStatus', 'watchRevision', 'onIncomeLoading'].filter(name => methodNames.has(name) || name.startsWith('watch') || name === 'onIncomeLoading');
const factory = new Function('scope', 'with (scope) {' + code + '; return {' + names.join(',') + '};}');
const { outputFiles } = await build({ stdin: { contents: "export * from './src/features/lesson/attendance'; export * from './src/features/lesson/lesson-draft'; export * from './src/features/lesson/lesson-reward';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const domain = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'));
class FixtureConnectionError extends Error { constructor(code, message) { super(message); this.code = code; } }
const createWorkspaceSession = options => factory(Object.assign(options, domain, {
  ConnectionError: FixtureConnectionError,
  label: value => value == null ? '' : String(value), record: value => value && typeof value === 'object' ? value : {}, rows: value => Array.isArray(value) ? value : [],
  isExtension: () => true, omniRequest: (...args) => globalThis.sessionRequest(...args), bufferRequest: input => globalThis.sessionBufferRequest(input),
  invalidatePendingOmniRequests: () => { options.invalidations = (options.invalidations || 0) + 1; },
  onExtensionSessionChange: callback => { options.revisionChanged = callback; return () => {}; },
}));
const createWorkspaceHomework = createWorkspaceSession;
const createWorkspaceNavigation = createWorkspaceSession;
const createWorkspaceLessonDraft = createWorkspaceSession;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function fixture() {
  const state = { busy: false, error: '', snapshot: { account: { id: '1' } }, waiting: false, authNeeded: false };
  const options = { week: 0, operation: { current: false }, sessionVersion: { current: 0 }, currentAccount: { current: '1' }, lastBranch: { current: '' }, draft: undefined, presentData: {}, draftKey: '', snapshot: state.snapshot, hasDrafts: false, ensureAccount() {}, reconcileDrafts() {}, failed: reason => { state.error = reason.message; } };
  for (const name of ['IncomeBusy', 'Busy', 'Error', 'Snapshot', 'Waiting', 'AuthNeeded', 'ConnectionState', 'ChangingAccount', 'SwitchingTeacher', 'LessonDrafts', 'GroupStudents', 'GroupName', 'GroupId', 'Detail', 'Lesson', 'Week', 'HomeworkSaved', 'HomeworkNeedsReload', 'HomeworkSaving', 'AttendanceSaving', 'RosterRevision', 'BufferedDrafts', 'Notice']) {
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

for (const name of ['lesson load', ...(methodNames.has('refreshHomework') ? ['homework refresh'] : []), 'homework grade', 'lesson save']) {
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

for (const entry of ['revision', 'AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE']) test('actual ' + entry + ' invalidator advances epoch and releases obsolete UI ownership', async () => {
  const f = fixture(); f.actions.watchRevision();
  const oldLogin = f.actions.login('fictional', 'password'); const version = f.options.sessionVersion.current;
  if (entry === 'revision') f.options.revisionChanged(); else f.actions.failed(new FixtureConnectionError(entry, 'auth failure'));
  assert.equal(f.options.sessionVersion.current, version + 1); assert.equal(f.options.invalidations, 1);
  assert.equal(f.options.operation.current, false); assert.equal(f.state.busy, false); assert.equal(f.state.snapshot, null); assert.equal(f.state.authNeeded, true);
  const next = deferred(); globalThis.sessionRequest = () => next.promise;
  const newLogin = f.actions.login('new', 'fictional');
  f.pending.reject(new Error('obsolete login')); await oldLogin;
  assert.equal(f.options.operation.current, true); assert.equal(f.state.busy, true); assert.equal(f.state.error, '');
  next.reject(new Error('new login rejection')); await newLogin; assert.equal(f.state.busy, false); assert.equal(f.state.error, 'new login rejection');
});
test('current teacher identity mismatch is rejected without a follow-up read', async () => {
  const f = fixture(); const work = f.actions.switchTeacher('2'); f.pending.resolve({ account: { id: '3' } }); await work;
  assert.match(f.state.error, /не подтвердил/); assert.equal(f.options.sessionVersion.current, 1); assert.deepEqual(f.calls, ['switch-teacher']);
});
test('initial BUSY becomes polling and obsolete initial status is ignored', async () => {
  const f = fixture(); f.actions.watchInitialStatus(); f.pending.reject(new FixtureConnectionError('BUSY', 'busy')); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.waiting, true); assert.equal(f.state.error, '');
  const stale = fixture(); stale.actions.watchInitialStatus(); stale.options.sessionVersion.current++; const before = structuredClone(stale.state);
  stale.pending.resolve({ connected: false, state: 'login' }); await new Promise(resolve => setImmediate(resolve)); assert.deepEqual(stale.state, before);
});


test('obsolete income completion cannot clear the new session loading flag', () => {
  const f = fixture(); f.actions.onIncomeLoading(true); assert.equal(f.state.incomeBusy, true);
  f.actions.onIncomeLoading(false); assert.equal(f.state.incomeBusy, false, 'current owner can release loading');
  f.options.sessionVersion.current++; f.state.incomeBusy = true; f.actions.onIncomeLoading(false);
  assert.equal(f.state.incomeBusy, true, 'old captured callback cannot release the new owner');
});

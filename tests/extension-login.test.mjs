import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { loginPageState } from '../extension/login-page.mjs';

const page = ({ title = 'Omni', readyState = 'complete', csrf = true, password = true, challenge = false, otp = false, reset = false, action = '', unknown = false } = {}) => {
  const input = (type, name, autocomplete = '') => ({ type, getAttribute: key => ({ name, autocomplete })[key] || null });
  const user = input('text', unknown ? 'unrecognized' : 'username');
  const secret = input('password', reset ? 'new_password' : 'password', reset ? 'new-password' : 'current-password');
  const form = { querySelectorAll: () => [user, secret], querySelector: () => null, getAttribute: key => key === 'action' ? action : null };
  secret.form = form;
  return { title, readyState, baseURI: 'https://omni.top-academy.ru/login/index',
    querySelectorAll: () => password ? [secret] : [],
    querySelector(selector) {
      if (selector.startsWith('[data-login-challenge]')) return challenge ? {} : null;
      if (selector.startsWith('input[autocomplete')) return otp ? {} : null;
      if (selector.startsWith('meta')) return csrf ? { getAttribute: () => 'csrf-fixture' } : null;
      if (selector === 'form input[type="password"]' || selector === 'input[type="password"]') return password ? secret : null;
      return null;
    },
  };
};

test('own login only handles the known native form; challenges and unsupported flows stay official', () => {
  assert.equal(loginPageState(page(), '/login/index'), 'login');
  assert.equal(loginPageState(page({ readyState: 'loading' }), '/login/index'), 'loading');
  assert.equal(loginPageState(page({ csrf: false }), '/login/index'), 'loading');
  assert.equal(loginPageState(page({ password: false }), '/login/index'), 'loading');
  for (const options of [{ challenge: true }, { otp: true }, { title: 'DDoS-Guard' }, { reset: true }, { unknown: true }, { action: '/auth/reset' }, { action: 'https://example.invalid/login' }]) {
    assert.equal(loginPageState(page(options), '/login/index'), 'official');
  }
  assert.equal(loginPageState(page(), '/login/reset-password'), 'official');
  assert.equal(loginPageState(page(), '/'), 'official', 'unrecognized password form is not captured');
  assert.equal(loginPageState(page({ password: false }), '/'), 'workspace');
  assert.equal(loginPageState(page({ password: false }), '/auth/logout'), 'loading');
});

const { outputFiles } = await build({ entryPoints: ['extension/bootstrap.mjs'], bundle: true, format: 'iife', write: false });
const bootstrap = outputFiles[0].text;
function runBootstrap({ origin = 'https://omni.top-academy.ru', frame = false, challenge = false, bypass = false, legacy = false } = {}) {
  class Node {
    constructor(tag = '') { this.tag = tag; this.children = []; this.isConnected = false; }
    append(...nodes) { for (const node of nodes) { node.isConnected = true; this.children.push(node); } }
    remove() { this.isConnected = false; }
    setAttribute() {}
    attachShadow() { return new Node('shadow'); }
  }
  const timers = new Map();
  const stored = new Map(bypass ? [['omni.native-login', 'manual']] : legacy ? [['omni.native-login', '1']] : []);
  const document = { ...page({ password: false, challenge }), documentElement: new Node('html'), createElement: tag => new Node(tag) };
  const window = {}; window.top = frame ? {} : window;
  const context = vm.createContext({ document, window, location: { origin, pathname: '/login/index', assign() {} },
    matchMedia: () => ({ matches: false }), localStorage: { getItem: () => null },
    sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    MutationObserver: class { observe() {} disconnect() {} },
    setTimeout: (callback, delay) => { const key = Symbol(); timers.set(key, { callback, delay }); return key; },
    clearTimeout: key => timers.delete(key),
  });
  vm.runInContext(bootstrap, context);
  return { controller: context.omniWorkspaceBootstrap, timers, document, stored };
}

test('early loading shell has watchdog recovery, idempotent release and explicit readiness', () => {
  const loading = runBootstrap();
  assert.equal(loading.controller.active, true);
  assert.equal(loading.controller.host.isConnected, true);
  assert.match(loading.controller.conceal.textContent, /display:none/);
  const watchdog = [...loading.timers.values()][0];
  assert.equal(watchdog.delay, 30000);
  watchdog.callback();
  assert.equal(loading.controller.host.isConnected, false);
  assert.equal(loading.controller.conceal.isConnected, false);
  loading.controller.release();
  const legacy = runBootstrap({ legacy: true });
  assert.equal(legacy.controller.active, true, 'legacy automatic fallback must not permanently force native login');
  assert.equal(legacy.stored.has('omni.native-login'), false);
  const ready = runBootstrap(); ready.controller.ready();
  assert.equal(ready.timers.size, 0);
  const adopted = runBootstrap();
  adopted.controller.adopt(() => { throw new Error('fixture failure'); });
  assert.throws(() => [...adopted.timers.values()][0].callback());
  assert.equal(adopted.controller.conceal.isConnected, false, 'cleanup survives a failing adopted controller');
});

test('bootstrap leaves foreign frames, challenge and explicit native bypass untouched', () => {
  for (const options of [{ origin: 'https://example.invalid' }, { frame: true }, { challenge: true }, { bypass: true }]) {
    const state = runBootstrap(options);
    assert.equal(state.controller, undefined);
    assert.equal(state.document.documentElement.children.length, 0);
    assert.equal(state.timers.size, 0);
  }
});

test('manifest launches only the small bootstrap at document_start in the isolated top frame', async () => {
  const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
  const [early] = manifest.content_scripts;
  assert.deepEqual(early.js, ['bootstrap.js']);
  assert.equal(early.run_at, 'document_start');
  assert.equal(early.all_frames, false);
  assert.equal(early.world, 'ISOLATED');
  assert.deepEqual(early.matches, ['https://omni.top-academy.ru/*']);
  assert.equal(manifest.content_scripts.find(script => script.js.includes('content.js')).run_at, 'document_idle');
});

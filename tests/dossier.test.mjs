import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { dispatch } from '../shared/omni-agent.mjs';
import { createBridge, validateInput } from '../server/omni-bridge.mjs';
import { validateMessage } from '../extension/policy.mjs';

const paths = ['/dossier/get-single-data', '/dossier/get-data-graphics', '/dossier/get-all-data'];

test('teacher dossier accepts empty input only in both command policies', () => {
  assert.doesNotThrow(() => validateInput('teacher-dossier', {}));
  assert.doesNotThrow(() => validateMessage({ action: 'teacher-dossier', input: {} }));
  for (const input of [null, [], '1', { teacherId: '2' }, { accountId: '1' }, { url: paths[0] }, { method: 'POST' }]) {
    assert.throws(() => validateInput('teacher-dossier', input), { code: 'BAD_INPUT' });
    if (input !== null) assert.throws(() => validateMessage({ action: 'teacher-dossier', input }));
  }
});

async function withTransport(transport, fetch, run) {
  const browserGlobals = {
    location: { origin: 'https://omni.top-academy.ru', pathname: '/' },
    document: { title: '', body: { innerText: '' }, querySelector: selector => selector.startsWith('meta') ? { content: 'fixture-csrf', getAttribute: () => 'fixture-csrf' } : null },
    sessionStorage: { getItem: () => 'fixture-hash' },
    AbortSignal, fetch,
  };
  if (transport === 'extension') {
    const names = Object.keys(browserGlobals);
    const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
    Object.assign(globalThis, browserGlobals);
    try { await run(() => dispatch('teacher-dossier')); }
    finally { names.forEach((name, index) => saved[index] ? Object.defineProperty(globalThis, name, saved[index]) : delete globalThis[name]); }
    return;
  }
  const context = vm.createContext(browserGlobals);
  const page = {
    isClosed: () => false,
    url: () => 'https://omni.top-academy.ru/',
    goto: async () => {},
    bringToFront: async () => {},
    evaluate: async (fn, argument) => JSON.parse(JSON.stringify(await vm.runInContext(`(${fn.toString()})(${JSON.stringify(argument)})`, context))),
  };
  const connection = mock.method(chromium, 'connectOverCDP', async () => ({
    contexts: () => [{ pages: () => [page] }], close: async () => {},
  }));
  const bridge = createBridge();
  try {
    await bridge.dispatch('connect');
    await run(() => bridge.dispatch('teacher-dossier'));
  } finally { await bridge.close(); connection.mock.restore(); }
}

for (const transport of ['extension', 'dev bridge']) {
  test(`${transport}: dossier uses authenticated GETs without a body and preserves raw sections`, async () => {
    const calls = [];
    const values = [{ current: { value: '42' } }, [{ points: [1, 2] }], { future_field: null }];
    await withTransport(transport, async (path, options) => {
      calls.push({ path, method: options.method, body: options.body });
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
      assert.equal(options.headers['Id-Local-Hash'], 'fixture-hash');
      if (path === '/profile/get-profile') {
        assert.equal(options.method, 'POST');
        return Response.json({ teach_info: { id_teach: 1, fio_teach: 'Fixture' } });
      }
      assert.ok(paths.includes(path));
      assert.equal(options.method, 'GET');
      assert.equal(Object.hasOwn(options, 'body'), false);
      return Response.json(values[paths.indexOf(path)]);
    }, async load => {
      assert.deepEqual(await load(), {
        account: { id: '1', name: 'Fixture' },
        single: { data: values[0], error: null }, graphics: { data: values[1], error: null }, all: { data: values[2], error: null },
      });
      assert.deepEqual(calls.map(call => call.path), ['/profile/get-profile', ...paths, '/profile/get-profile']);
    });
  });

  test(`${transport}: section failures stay visible and do not hide account changes`, async () => {
    let changed = false, identities = 0;
    await withTransport(transport, async path => {
      if (path === '/profile/get-profile') return Response.json({ teach_info: { id_teach: changed && ++identities === 2 ? 2 : 1, fio_teach: 'Fixture' } });
      if (path === paths[0]) return new Response('', { status: 503 });
      if (path === paths[1]) return new Response('<html>invalid JSON</html>');
      assert.equal(path, paths[2]);
      return Response.json([]);
    }, async load => {
      const result = await load();
      assert.equal(result.single.data, null);
      assert.equal(typeof result.single.error, 'string');
      assert.ok(result.single.error.length);
      assert.equal(result.graphics.data, null);
      assert.ok(result.graphics.error.length);
      assert.deepEqual(result.all, { data: [], error: null });
      changed = true;
      await assert.rejects(load(), { code: 'ACCOUNT_CHANGED' });
    });
  });

  test(`${transport}: authentication, conflict and invalid identity fail the whole dossier`, async () => {
    for (const [status, code] of [[401, 'AUTH_REQUIRED'], [403, 'AUTH_REQUIRED'], [409, 'ACCOUNT_CHANGED']]) {
      const calls = [];
      await withTransport(transport, async path => {
        calls.push(path);
        if (path === '/profile/get-profile') return Response.json({ teach_info: { id_teach: 1, fio_teach: 'Fixture' } });
        return new Response('', { status });
      }, async load => {
        await assert.rejects(load(), { code });
        assert.deepEqual(calls, ['/profile/get-profile', paths[0]]);
      });
    }
    await withTransport(transport, async path => {
      assert.equal(path, '/profile/get-profile');
      return Response.json({});
    }, async load => { await assert.rejects(load(), { code: 'SCHEMA_CHANGED' }); });
  });
}

import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import vm from 'node:vm';
import { chromium } from 'playwright';
import { validateInput, BridgeError } from '../server/bridge-protocol.mjs';
import { validateMessage } from '../extension/policy.mjs';
import { loadScheduleRange } from '../server/schedule-range.mjs';
import { dispatch } from '../shared/omni-agent.mjs';
import { createBridge } from '../server/omni-bridge.mjs';

const account = { id: '1', name: 'Fixture teacher' };
const input = { accountId: account.id, weeks: [-1, 0, 1] };

test('schedule range requires a bounded unique list of integer weeks and an account', async () => {
  for (const weeks of [[-52], [52], Array.from({ length: 16 }, (_, i) => i - 8)]) {
    assert.doesNotThrow(() => validateInput('schedule-range', { accountId: '1', weeks }));
    assert.doesNotThrow(() => validateMessage({ action: 'schedule-range', input: { accountId: '1', weeks } }));
  }
  for (const invalid of [null, [], '1', {}, { weeks: [0] }, { accountId: 1, weeks: [0] }, { accountId: '0', weeks: [0] }, { accountId: '1', weeks: [] }, { accountId: '1', weeks: [0, 0] }, { accountId: '1', weeks: [0, -0] }, { accountId: '1', weeks: [53] }, { accountId: '1', weeks: [-53] }, { accountId: '1', weeks: ['0'] }, { accountId: '1', weeks: [0.5] }, { accountId: '1', weeks: [NaN] }, { accountId: '1', weeks: [Infinity] }, { accountId: '1', weeks: new Array(1) }, { accountId: '1', weeks: Array.from({ length: 17 }, (_, i) => i) }, { ...input, path: '/anything' }]) {
    assert.throws(() => validateInput('schedule-range', invalid), { code: 'BAD_INPUT' });
    assert.throws(() => validateMessage({ action: 'schedule-range', input: invalid }));
    await assert.rejects(loadScheduleRange(invalid, { identity: () => assert.fail('invalid input must not read'), section: () => assert.fail('invalid input must not read') }), { code: 'BAD_INPUT' });
  }
});

test('schedule range reads sequentially and preserves partial section errors', async () => {
  const events = [];
  const result = await loadScheduleRange(input, {
    identity: async () => { events.push('identity'); return account; },
    section: async (path, params) => {
      events.push(params.week);
      assert.equal(path, '/schedule/get-schedule');
      assert.deepEqual(Object.keys(params), ['week']);
      return params.week === 0 ? { data: null, error: 'Unavailable' } : { data: { week: params.week }, error: null };
    },
  });
  assert.deepEqual(events, ['identity', -1, 'identity', 0, 'identity', 1, 'identity']);
  assert.deepEqual(result, { account, weeks: [{ week: -1, schedule: { data: { week: -1 }, error: null } }, { week: 0, schedule: { data: null, error: 'Unavailable' } }, { week: 1, schedule: { data: { week: 1 }, error: null } }] });
});

test('schedule range checks the requested identity first and rejects changes after each week', async () => {
  let reads = 0;
  await assert.rejects(loadScheduleRange(input, { identity: async () => ({ id: '2' }), section: () => { reads++; } }), { code: 'ACCOUNT_CHANGED', status: 409 });
  assert.equal(reads, 0);
  for (const changedCheck of [2, 3, 4]) {
    let checks = 0;
    reads = 0;
    await assert.rejects(loadScheduleRange(input, {
      identity: async () => ++checks === changedCheck ? { id: '2' } : account,
      section: async () => { reads++; return { data: null, error: 'Partial error' }; },
    }), { code: 'ACCOUNT_CHANGED', status: 409 });
    assert.equal(reads, changedCheck - 1);
  }
  for (const code of ['AUTH_REQUIRED', 'CHALLENGE', 'ACCOUNT_CHANGED']) {
    await assert.rejects(loadScheduleRange(input, { identity: async () => account, section: async () => { throw new BridgeError(code, 'fixture'); } }), { code });
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
    try { await run(input => dispatch('schedule-range', input)); }
    finally { names.forEach((name, index) => saved[index] ? Object.defineProperty(globalThis, name, saved[index]) : delete globalThis[name]); }
    return;
  }
  const context = vm.createContext(browserGlobals);
  const page = {
    isClosed: () => false, url: () => 'https://omni.top-academy.ru/', goto: async () => {}, bringToFront: async () => {},
    evaluate: async (fn, argument) => JSON.parse(JSON.stringify(await vm.runInContext(`(${fn.toString()})(${JSON.stringify(argument)})`, context))),
  };
  const connection = mock.method(chromium, 'connectOverCDP', async () => ({ contexts: () => [{ pages: () => [page] }], close: async () => {} }));
  const bridge = createBridge();
  try { await bridge.dispatch('connect'); await run(input => bridge.dispatch('schedule-range', input)); }
  finally { await bridge.close(); connection.mock.restore(); }
}

for (const transport of ['extension', 'dev bridge']) {
  test(`${transport}: range uses only schedule POSTs and identity checks, retaining partial errors`, async () => {
    const calls = [];
    await withTransport(transport, async (path, options) => {
      calls.push(path);
      assert.equal(options.method, 'POST');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
      assert.equal(options.headers['Id-Local-Hash'], 'fixture-hash');
      if (path === '/profile/get-profile') return Response.json({ teach_info: { id_teach: 1, fio_teach: account.name } });
      assert.equal(path, '/schedule/get-schedule');
      const params = JSON.parse(options.body);
      assert.deepEqual(Object.keys(params), ['week']);
      return params.week === 0 ? new Response('', { status: 503 }) : Response.json({ fixture: params.week });
    }, async load => {
      const result = await load(input);
      assert.deepEqual(result.account, account);
      assert.deepEqual(result.weeks.map(row => row.week), input.weeks);
      assert.deepEqual(result.weeks[0].schedule, { data: { fixture: -1 }, error: null });
      assert.equal(result.weeks[1].schedule.data, null);
      assert.ok(result.weeks[1].schedule.error);
      assert.deepEqual(result.weeks[2].schedule, { data: { fixture: 1 }, error: null });
      assert.deepEqual(calls, ['/profile/get-profile', '/schedule/get-schedule', '/profile/get-profile', '/schedule/get-schedule', '/profile/get-profile', '/schedule/get-schedule', '/profile/get-profile']);
    });
  });

  test(`${transport}: range rejects changed or unauthenticated accounts without additional weeks`, async () => {
    for (const [failure, expected, expectedReads] of [['initial', 'ACCOUNT_CHANGED', 0], ['change', 'ACCOUNT_CHANGED', 1], [401, 'AUTH_REQUIRED', 1], [403, 'AUTH_REQUIRED', 1], [409, 'ACCOUNT_CHANGED', 1], ['profile', 'SCHEMA_CHANGED', 0]]) {
      let reads = 0, identities = 0;
      await withTransport(transport, async path => {
        if (path === '/profile/get-profile') {
          identities++;
          return Response.json(failure === 'profile' ? {} : { teach_info: { id_teach: failure === 'initial' || failure === 'change' && identities > 1 ? 2 : 1, fio_teach: account.name } });
        }
        assert.equal(path, '/schedule/get-schedule');
        reads++;
        return typeof failure === 'number' ? new Response('', { status: failure }) : Response.json({});
      }, async load => {
        await assert.rejects(load(input), { code: expected });
        assert.equal(reads, expectedReads);
      });
    }
  });
}

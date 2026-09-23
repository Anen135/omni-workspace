import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from '../desktop/omni-agent.mjs';

test('desktop agent validates commands, origin and unauthenticated state', async () => {
  globalThis.location = { origin: 'https://evil.test', pathname: '/' };
  await assert.rejects(dispatch('status'), { code: 'AUTH_REQUIRED' });
  globalThis.location = { origin: 'https://omni.top-academy.ru', pathname: '/login/index' };
  globalThis.document = { title: '', querySelector: () => null };
  assert.deepEqual(await dispatch('status'), { connected: false, state: 'login' });
  await assert.rejects(dispatch('snapshot'), { code: 'AUTH_REQUIRED' });
  await assert.rejects(dispatch('arbitrary-url', { url: 'https://evil.test' }), { code: 'NOT_FOUND' });
  await assert.rejects(dispatch('group', { group: '1', path: '/auth/logout' }), { code: 'BAD_INPUT' });
  document.title = 'DDOS-GUARD';
  assert.equal((await dispatch('status')).state, 'challenge');
});

test('desktop read uses official session and detects account changes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.location = { origin: 'https://omni.top-academy.ru', pathname: '/' };
  globalThis.document = { title: '', querySelector: selector => selector.startsWith('meta') ? { content: 'fixture-csrf' } : null };
  globalThis.sessionStorage = { getItem: () => 'fixture-hash' };
  let reads = 0;
  let changed = false;
  globalThis.fetch = async (path, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.headers['X-CSRF-Token'], 'fixture-csrf');
    assert.equal(options.headers['Id-Local-Hash'], 'fixture-hash');
    if (path === '/profile/get-profile') { reads++; return Response.json({ teach_info: { id_teach: changed && reads % 2 === 0 ? 2 : 1, fio_teach: 'Fixture' } }); }
    assert.equal(path, '/students/get-students');
    assert.deepEqual(JSON.parse(options.body), { group: '3' });
    return Response.json([]);
  };
  try {
    assert.deepEqual(await dispatch('group', { group: '3' }), { students: [], account: { id: '1', name: 'Fixture' } });
    changed = true;
    await assert.rejects(dispatch('group', { group: '3' }), { code: 'ACCOUNT_CHANGED' });
    await assert.rejects(dispatch('switch-teacher', { accountId: '1', teacherId: '2' }), { code: 'NOT_SUPPORTED' });
  } finally { globalThis.fetch = originalFetch; delete globalThis.location; delete globalThis.document; delete globalThis.sessionStorage; }
});

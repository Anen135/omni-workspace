import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { submitOfficialLogin } from '../server/login.mjs';
import { validateInput } from '../server/omni-bridge.mjs';

test('login validates credentials and does not allow arbitrary endpoints', () => {
  assert.doesNotThrow(() => validateInput('login', { username: 'teacher', password: 'test' }));
  for (const input of [{}, { username: ' ', password: 'p' }, { username: 'u', password: '' }, { username: 'u', password: 'p', url: 'https://evil.test' }, { username: 'u', password: 'x'.repeat(1025) }]) assert.throws(() => validateInput('login', input));
});

async function runLogin(response, options = {}) {
  const stored = new Map([['isWarned', '1']]);
  let calls = 0;
  const context = vm.createContext({
    location: { origin: options.origin || 'https://omni.top-academy.ru' },
    document: { querySelector: selector => options.challenge ? null : selector.startsWith('meta') ? { getAttribute: () => 'csrf-fixture' } : {} },
    sessionStorage: { setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    AbortSignal,
    fetch: async (path, init) => {
      calls++;
      assert.equal(path, '/auth/login');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers['X-CSRF-Token'], 'csrf-fixture');
      assert.deepEqual(JSON.parse(init.body), { LoginForm: { id_city: null, username: 'fixture', password: 'test-password' } });
      return response;
    },
  });
  const result = await vm.runInContext(`(${submitOfficialLogin.toString()})({username:'fixture',password:'test-password'})`, context);
  return { result: JSON.parse(JSON.stringify(result)), stored, calls };
}
test('login matches official protocol and keeps session hash inside Omni', async () => {
  const { result, stored } = await runLogin(Response.json({ success: true, IdLocalHash: 'hash-fixture' }));
  assert.deepEqual(result, { success: true });
  assert.equal(stored.get('IdLocalHash'), 'hash-fixture');
  assert.equal(stored.has('isWarned'), false);
});
test('login handles rejected credentials, challenges, throttling and permission errors without leaking responses', async () => {
  for (const [response, code] of [[Response.json({ error: { password: ['test-password'] } }), 'LOGIN_REJECTED'], [Response.json({ error_permission: true }), 'LOGIN_PERMISSION'], [new Response('', { status: 403 }), 'CHALLENGE'], [new Response('<html>captcha</html>'), 'CHALLENGE'], [new Response('', { status: 429 }), 'LOGIN_RATE_LIMIT']]) {
    const { result } = await runLogin(response);
    assert.deepEqual(result, { code });
  }
  assert.equal((await runLogin(null, { challenge: true })).calls, 0);
  assert.equal((await runLogin(null, { origin: 'https://evil.test' })).calls, 0);
});

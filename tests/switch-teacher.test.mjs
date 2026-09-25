import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switchTeacherInPage } from '../extension/switch-teacher.mjs';

test('teacher switch verifies identity after reload and fails closed before mutation', async () => {
  const names = ['location', 'document', 'sessionStorage', 'angular', 'fetch'];
  const saved = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  let id = '1', allowed = ['1', '2'], cleaned = 0, writes = 0;
  Object.assign(globalThis, {
    location: { origin: 'https://omni.top-academy.ru', pathname: '/' },
    document: { querySelector: selector => selector.startsWith('meta') ? { content: 'fixture' } : null, body: {} },
    sessionStorage: { getItem: () => 'fixture' },
    angular: { element: () => ({ injector: () => ({ get: () => ({ clearLocalStorage: () => cleaned++ }) }) }) },
    fetch: async (path, options) => {
      let data;
      if (path === '/profile/get-profile') data = { teach_info: { id_teach: id, fio_teach: 'Fixture' } };
      else if (path === '/auth/get-teach-list') data = allowed.map(id_teach => ({ id_teach }));
      else if (path === '/auth/change-user') { writes++; id = JSON.parse(options.body).id_user; data = { success: true }; }
      else throw Error('Unexpected path');
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  try {
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '9' })).error.code, 'ACCOUNT_CHANGED');
    allowed = ['1'];
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '1' })).error.code, 'TEACHER_NOT_ALLOWED');
    assert.equal(cleaned, 0); assert.equal(writes, 0);
    allowed = ['1', '2'];
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '1' })).data.switched, true);
    assert.equal(cleaned, 1); assert.equal(writes, 1);
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '1' }, true)).data.account.id, '2');
    id = '1';
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '1' }, true)).error.code, 'ACCOUNT_CHANGED');
    globalThis.angular = undefined;
    assert.equal((await switchTeacherInPage({ teacherId: '2', accountId: '1' })).error.code, 'SWITCH_UNAVAILABLE');
    assert.equal(writes, 1);
  } finally {
    names.forEach((name, index) => { if (saved[index]) Object.defineProperty(globalThis, name, saved[index]); else delete globalThis[name]; });
  }
});

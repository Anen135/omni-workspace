import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonAccess } from '../server/lesson-access.mjs';
import { lessonAccessDate } from '../src/features/lesson/lesson-access.ts';
import { validateMessage } from '../extension/policy.mjs';

const input = () => ({ accountId: '1', date: '2026-11-06', message: 'Нужно исправить данные урока' });
function fixture(options = {}) {
  let identities = 0, reads = 0;
  const writes = [], history = [];
  return { writes, deps: {
    identity: async () => ({ id: ++identities >= (options.changeAt || Infinity) ? '2' : '1' }),
    request: async (path, data) => {
      if (path === '/presents/get-data-request-zavuch') {
        reads++;
        if (options.failedReadback && reads > 1) throw new Error('Timeout');
        return { dates: options.dates || ['06-11-2026', '05-11-2026'], requests: structuredClone(options.history || history) };
      }
      assert.equal(path, '/presents/send-request-zavuch'); writes.push(data);
      if (options.timeout) throw new Error('Timeout');
      if (options.reject) return { error: '<b>Отказ</b>' };
      if (Object.hasOwn(options, 'reply')) return options.reply;
      if (!options.noSave) history.push({ date_req: '2026-11-06', approve: 'Ожидает одобрения', zavuch_id: 0, can_set: '0' });
      return { success: 'Запрос отправлен' };
    },
  } };
}

test('access validates both real date formats without rolling invalid dates', () => {
  assert.equal(lessonAccessDate('06-11-2026'), '2026-11-06');
  assert.equal(lessonAccessDate('2026-11-06'), '2026-11-06');
  for (const value of ['31-02-2026', '2026-02-29', '11/06/2026', '', null]) assert.equal(lessonAccessDate(value), null);
});

test('access protocol allows only fixed bounded account/date/reason commands', () => {
  validateMessage({ action: 'lesson-access', input: { accountId: '1' } });
  validateMessage({ action: 'request-lesson-access', input: input() });
  for (const patch of [{ accountId: '' }, { date: '2026-02-30' }, { date: '06-11-2026' }, { message: ' ' }, { message: 'x'.repeat(2001) }, { url: '/anything' }]) assert.throws(() => validateMessage({ action: 'request-lesson-access', input: { ...input(), ...patch } }));
  assert.throws(() => validateMessage({ action: 'lesson-access', input: { accountId: '1', date: '2026-11-06' } }));
});

test('access reader normalizes dates and explicit approval without any writes', async () => {
  const { deps, writes } = fixture({ history: [
    { date_req: '2026-11-04', approve: 'Одобрено', zavuch_id: 4, fio_teach: 'Тестовый завуч', can_set: '1' },
    { date_req: '2026-11-05', approve: 'Ожидает', zavuch_id: 0, can_set: '0' },
  ] });
  const result = await lessonAccess('lesson-access', { accountId: '1' }, deps);
  assert.deepEqual(result.dates, ['2026-11-06', '2026-11-05']);
  assert.equal(result.requests[0].canOpen, true); assert.equal(result.requests[1].canOpen, false);
  assert.equal(result.requests[1].approver, ''); assert.deepEqual(writes, []);
});

test('access send uses the original server date and confirms a real history entry', async () => {
  const { deps, writes } = fixture();
  const result = await lessonAccess('request-lesson-access', { ...input(), message: '  Причина  ' }, deps);
  assert.deepEqual(writes, [{ date: '06-11-2026', message: 'Причина' }]);
  assert.equal(result.requests[0].date, '2026-11-06'); assert.equal(result.requests[0].canOpen, false);
});

test('access refuses unavailable/ambiguous dates, existing requests and account changes before sending', async () => {
  for (const [options, code] of [
    [{ dates: ['05-11-2026'] }, 'ACCESS_DATE_UNAVAILABLE'],
    [{ dates: ['06-11-2026', '2026-11-06'] }, 'SCHEMA_CHANGED'],
    [{ dates: ['31-02-2026'] }, 'SCHEMA_CHANGED'],
    [{ history: [{ date_req: '2026-11-06' }] }, 'ACCESS_REQUEST_EXISTS'],
    [{ changeAt: 1 }, 'ACCOUNT_CHANGED'], [{ changeAt: 2 }, 'ACCOUNT_CHANGED'],
  ]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(lessonAccess('request-lesson-access', input(), deps), { code });
    assert.deepEqual(writes, []);
  }
});

test('access uncertain/rejected sends never retry or fabricate approval', async () => {
  for (const [options, code] of [[{ timeout: true }, 'ACCESS_UNCONFIRMED'], [{ reject: true }, 'ACCESS_REJECTED'], ...[null, {}, { unexpected: true }, { success: {} }, { success: false }].map(reply => [{ reply }, 'ACCESS_UNCONFIRMED']), [{ noSave: true }, 'ACCESS_UNCONFIRMED'], [{ failedReadback: true }, 'ACCESS_UNCONFIRMED'], [{ changeAt: 3 }, 'ACCOUNT_CHANGED']]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(lessonAccess('request-lesson-access', input(), deps), { code });
    assert.equal(writes.length, 1);
  }
});

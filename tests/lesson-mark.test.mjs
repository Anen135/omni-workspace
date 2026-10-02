import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveLessonMark } from '../extension/lesson-mark.mjs';
import { saveAttendance } from '../extension/attendance.mjs';
import { validateMessage } from '../extension/policy.mjs';
const input = (date = '2020-01-01') => ({ accountId: '1', date, group: '10', lenta: '0', schedule: '50', stud: '101', visit: '8', type: 2, mark: 10, previousMark: '5' });
function fixture(value = input(), options = {}) {
  let identities = 0;
  const writes = [];
  const presents = { cur_date: value.date, cur_group: 10, cur_lenta: 0, cur_schedule: 50, students: [{ id_stud: 101, id_vizit: 8, was: 0, mark2: 5, mark4: null, theme: 'Тема', primary_teach: 0 }], ...options.presents };
  return { writes, deps: {
    identity: async () => ({ id: ++identities >= (options.changeAt || Infinity) ? '2' : '1' }),
    request: async (path, data) => {
      if (path === '/presents/get-presents') { assert.equal(data.date, value.date); return structuredClone(presents); }
      writes.push({ path, data });
      if (options.timeout) throw new Error('Timeout');
      if (options.reject) return { success: false, message: 'Период закрыт' };
      if (!options.noSave) {
        if (path === '/presents/set-mark') presents.students[0][`mark${data.marks[0].type}`] = data.marks[0].mark;
        else if (path === '/presents/set-was') presents.students[0].was = data.visits[0].was;
        else assert.fail(path);
      }
      return { success: true };
    },
  } };
}
test('marks validate known types, bounded values and pinned visit/context', () => {
  validateMessage({ action: 'set-lesson-mark', input: input() });
  for (const patch of [{ type: 3 }, { mark: 0 }, { mark: 1.5 }, { mark: 101 }, { mark: '10' }, { visit: null }, { previousMark: undefined }, { schedule: '0' }, { date: '2026-02-30' }, { arbitrary: true }]) assert.throws(() => validateMessage({ action: 'set-lesson-mark', input: { ...input(), ...patch } }));
});
test('past and future lessons accept mark edits and attendance, with no client time gate', async () => {
  for (const date of ['2020-01-01', '2030-01-01']) {
    for (const type of [2, 4]) {
      const value = { ...input(date), type, previousMark: type === 2 ? '5' : null };
      const { deps, writes } = fixture(value);
      const result = await saveLessonMark(value, deps);
      assert.equal(result.presents.students[0][`mark${type}`], 10);
      assert.deepEqual(writes, [{ path: '/presents/set-mark', data: { marks: { 0: { type, mark: 10, vizit: 8 } } } }]);
    }
    const value = input(date), { deps, writes } = fixture(value);
    await saveAttendance({ accountId: value.accountId, date, group: value.group, lenta: value.lenta, schedule: value.schedule, changes: [{ stud: '101', visit: '8', was: 1, previousWas: 0 }] }, deps);
    assert.equal(writes[0].path, '/presents/set-was');
  }
});
test('marks refuse stale lesson, account, student, visit and previous mark before mutation', async () => {
  for (const [options, patch, code] of [[{ changeAt: 1 }, {}, 'ACCOUNT_CHANGED'], [{ changeAt: 2 }, {}, 'ACCOUNT_CHANGED'], [{ presents: { cur_schedule: 51 } }, {}, 'LESSON_CHANGED'], [{}, { stud: '102' }, 'MARK_CONFLICT'], [{}, { visit: '9' }, 'MARK_CONFLICT'], [{}, { previousMark: '4' }, 'MARK_CONFLICT']]) {
    const { deps, writes } = fixture(input(), options);
    await assert.rejects(saveLessonMark({ ...input(), ...patch }, deps), { code }); assert.equal(writes.length, 0);
  }
});
test('marks report rejection and uncertain writes without retries or false success', async () => {
  for (const [options, code] of [[{ reject: true }, 'MARK_REJECTED'], [{ timeout: true }, 'MARK_UNCONFIRMED'], [{ noSave: true }, 'MARK_UNCONFIRMED'], [{ changeAt: 3 }, 'ACCOUNT_CHANGED']]) {
    const { deps, writes } = fixture(input(), options);
    await assert.rejects(saveLessonMark(input(), deps), { code }); assert.equal(writes.length, 1);
  }
});

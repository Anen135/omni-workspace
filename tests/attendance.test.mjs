import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveAttendance } from '../extension/attendance.mjs';
import { validateMessage } from '../extension/policy.mjs';
import { attendanceStatus, attendanceUnavailable } from '../src/attendance.ts';

const input = () => ({ accountId: '1', date: '2026-09-30', group: '10', lenta: '0', schedule: '50', changes: [{ stud: '101', was: 1, previousWas: 0, visit: null }] });
const fixture = (options = {}) => {
  let presents = { cur_date: '2026-09-30', cur_group: 10, cur_lenta: 0, cur_schedule: 50, students: [{ id_stud: 101, id_vizit: null, was: 0, theme: '', primary_teach: 0 }, { id_stud: 102, id_vizit: 9, was: 2, theme: '', primary_teach: 0 }] };
  presents.students.forEach(student => { student.theme = 'Тестовая тема'; });
  Object.assign(presents, options.presents);
  const writes = [];
  let identities = 0;
  const deps = {
    identity: async () => ({ id: String(++identities >= (options.changeAt ?? Infinity) ? 2 : options.account ?? 1) }),
    request: async (path, data) => {
      if (path === '/presents/get-presents') {
        assert.deepEqual(data, { date: '2026-09-30', group: '10', lenta: '0' });
        if (writes.length && options.readFailure) throw new Error('Network unavailable');
        return structuredClone(presents);
      }
      assert.equal(path, '/presents/set-was');
      writes.push(structuredClone(data));
      if (options.writeFailure) throw options.writeFailure;
      if (options.rejection) return options.rejection;
      if (!options.noSave) for (const visit of Object.values(data.visits)) {
        const student = presents.students.find(row => row.id_stud === visit.id_stud);
        student.was = visit.was; student.id_vizit ||= 8;
      }
      return { new_id_vizit: { 101: { id_vizit: 8 } } };
    },
  };
  return { deps, writes };
};

test('attendance schema accepts only bounded explicit student changes and known status codes', () => {
  assert.doesNotThrow(() => validateMessage({ action: 'set-attendance', input: input() }));
  for (const changes of [[], Array(101).fill(input().changes[0]), [{ ...input().changes[0], was: 3 }], [{ ...input().changes[0], was: '1' }], [{ ...input().changes[0], previousWas: undefined }], [{ ...input().changes[0], visit: '../1' }], [{ ...input().changes[0], theme: 'invented' }], [input().changes[0], input().changes[0]]]) {
    assert.throws(() => validateMessage({ action: 'set-attendance', input: { ...input(), changes } }));
  }
  for (const patch of [{ accountId: '0' }, { group: undefined }, { schedule: null }, { date: '2026-02-30' }, { lenta: {} }, { url: '/presents/set-mark' }]) assert.throws(() => validateMessage({ action: 'set-attendance', input: { ...input(), ...patch } }));
});
test('attendance derives saved theme from server and confirms newly created visits', async () => {
  const { deps, writes } = fixture();
  const result = await saveAttendance(input(), deps);
  assert.deepEqual(writes, [{ schedule: 50, visits: { 0: { was: 1, vizit: null, id_stud: 101, id_schedule: 50, primary_teach: 0, theme: 'Тестовая тема' } } }]);
  assert.equal(result.presents.students[0].was, 1);
  assert.equal(result.presents.students[0].id_vizit, 8);
  assert.equal(attendanceUnavailable(result.presents), '');
  assert.equal(attendanceStatus(null), null);
  assert.equal(attendanceStatus('0'), 0);
});
test('attendance batches explicit rows without touching grades or other students', async () => {
  const { deps, writes } = fixture();
  const value = input(); value.changes.push({ stud: '102', was: 1, previousWas: 2, visit: '9' });
  const result = await saveAttendance(value, deps);
  assert.equal(writes.length, 1);
  assert.deepEqual(result.presents.students.map(row => row.was), [1, 1]);
});
test('attendance rejects changed account before reading or before writing', async () => {
  for (const options of [{ account: 2 }, { changeAt: 2 }]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(saveAttendance(input(), deps), { code: 'ACCOUNT_CHANGED' });
    assert.equal(writes.length, 0);
  }
});
test('attendance refuses a different lesson, missing student and stale visit/state', async () => {
  for (const [patch, code] of [[{ cur_schedule: 51 }, 'LESSON_CHANGED'], [{ cur_lenta: 1 }, 'LESSON_CHANGED'], [{ students: [] }, 'ATTENDANCE_UNAVAILABLE'], [{ students: [{ id_stud: 200, theme: '' }] }, 'LESSON_CHANGED'], [{ students: [{ id_stud: 101, was: 2 }] }, 'ATTENDANCE_CONFLICT'], [{ students: [{ id_stud: 101, was: 0, id_vizit: 88 }] }, 'ATTENDANCE_CONFLICT']]) {
    if (patch.students) patch.students.forEach(student => { student.theme = 'Тестовая тема'; });
    const { deps, writes } = fixture({ presents: patch });
    await assert.rejects(saveAttendance(input(), deps), { code });
    assert.equal(writes.length, 0);
  }
});
test('attendance never writes before a nonempty topic has been saved', async () => {
  for (const theme of ['', '   ', null, undefined]) {
    const { deps, writes } = fixture({ presents: { students: [{ id_stud: 101, was: 0, id_vizit: null, theme }] } });
    await assert.rejects(saveAttendance(input(), deps), { code: 'ATTENDANCE_THEME_REQUIRED' });
    assert.equal(writes.length, 0);
  }
});
test('attendance reports rejection, lost response and unconfirmed readback without retrying writes', async () => {
  for (const [options, code] of [[{ rejection: { error: 'Сначала задайте тему' } }, 'ATTENDANCE_REJECTED'], [{ rejection: { success: false } }, 'ATTENDANCE_REJECTED'], [{ writeFailure: new Error('Timeout') }, 'ATTENDANCE_UNCONFIRMED'], [{ noSave: true }, 'ATTENDANCE_UNCONFIRMED'], [{ readFailure: true }, 'ATTENDANCE_UNCONFIRMED'], [{ changeAt: 3 }, 'ACCOUNT_CHANGED'], [{ writeFailure: { code: 'AUTH_REQUIRED' } }, 'AUTH_REQUIRED']]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(saveAttendance(input(), deps), { code });
    assert.equal(writes.length, 1);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonTheme } from '../extension/lesson-theme.mjs';
import { validateMessage } from '../extension/policy.mjs';
const input = () => ({ accountId: '1', date: '2026-10-01', group: '10', lenta: '0', schedule: '50' });
const choice = () => ({ ...input(), theme: 'Тема методпакета', previousTheme: '', publicWeekId: '7', issueHomework: true, issueLabwork: false });
function fixture(options = {}) {
  let count = 0;
  const writes = [];
  const presents = { cur_date: '2026-10-01', cur_group: 10, cur_lenta: 0, cur_schedule: 50, can_set_theme: true, scheduleType: 'planned', cur_spec: { id_spec: 5, source: 'fixture', id_base_spec: 6 }, students: [{ id_stud: 101, was: null, id_vizit: null, theme: '', primary_teach: 0 }], ...options.presents };
  const deps = {
    identity: async () => ({ id: ++count >= (options.changeAt || Infinity) ? '2' : '1' }),
    request: async (path, data) => {
      if (path === '/presents/get-presents') return structuredClone(presents);
      if (path === '/presents/get-methodpackage-themes') { assert.deepEqual(data, { schedule: 50 }); return [{ public_week_id: 7, package_id: 3, week: 1, theme: 'Тема методпакета', has_homework: true, has_labwork: false }]; }
      assert.equal(path, '/presents/set-theme'); writes.push(data);
      if (options.timeout) throw new Error('Timeout');
      if (options.reject) return { success: false, message: 'Отказ' };
      if (!options.noSave) presents.students = presents.students.map(student => ({ ...student, theme: data.theme, public_week_id: data.public_week_id, id_vizit: 88, was: 0 }));
      return options.partial ? { theme_saved: true, success: false } : { success: true };
    },
  };
  return { deps, writes };
}
test('theme protocol validates fixed commands and all fields', () => {
  validateMessage({ action: 'lesson-themes', input: input() });
  validateMessage({ action: 'set-lesson-theme', input: choice() });
  for (const patch of [{ schedule: '0' }, { date: '2026-02-30' }, { theme: '' }, { theme: 'x'.repeat(2001) }, { publicWeekId: {} }, { previousTheme: null }, { issueHomework: 'true' }, { url: '/anything' }]) assert.throws(() => validateMessage({ action: 'set-lesson-theme', input: { ...choice(), ...patch } }));
});
test('theme list uses real catalogue and does not write', async () => {
  const { deps, writes } = fixture();
  const result = await lessonTheme('lesson-themes', input(), deps);
  assert.equal(result.themes[0].public_week_id, 7); assert.equal(writes.length, 0);
});
test('theme save derives metadata and returns fresh visits for attendance', async () => {
  const { deps, writes } = fixture();
  const result = await lessonTheme('set-lesson-theme', choice(), deps);
  assert.deepEqual(writes, [{ date: '2026-10-01', group: '10', lenta: '0', theme: 'Тема методпакета', spec: 5, source: 'fixture', id_base_spec: 6, public_week_id: 7, issue_homework: true, issue_labwork: false, schedule: 50, scheduleType: 'planned', teach_type: 0, numberParticipants: null }]);
  assert.equal(result.presents.students[0].id_vizit, 88);
});
test('manual topic works without issuing materials', async () => {
  const { deps, writes } = fixture();
  await lessonTheme('set-lesson-theme', { ...choice(), publicWeekId: null, theme: 'Своя тема', issueHomework: false }, deps);
  assert.equal(writes[0].public_week_id, null); assert.equal(writes[0].issue_homework, false);
});
test('theme save refuses stale account, lesson, theme, permissions and unavailable choices before writing', async () => {
  for (const [options, patch, code] of [
    [{ changeAt: 1 }, {}, 'ACCOUNT_CHANGED'], [{ changeAt: 2 }, {}, 'ACCOUNT_CHANGED'],
    [{ presents: { cur_schedule: 51 } }, {}, 'LESSON_CHANGED'], [{ presents: { can_set_theme: false } }, {}, 'THEME_UNAVAILABLE'],
    [{}, { previousTheme: 'stale' }, 'THEME_CONFLICT'], [{}, { publicWeekId: '8' }, 'THEME_CONFLICT'],
    [{}, { issueLabwork: true }, 'BAD_INPUT'], [{}, { publicWeekId: null }, 'BAD_INPUT'],
  ]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(lessonTheme('set-lesson-theme', { ...choice(), ...patch }, deps), { code });
    assert.equal(writes.length, 0);
  }
});
test('theme save never retries rejected, uncertain or unconfirmed writes; surfaces partial success', async () => {
  for (const [options, code] of [[{ reject: true }, 'THEME_REJECTED'], [{ timeout: true }, 'THEME_UNCONFIRMED'], [{ noSave: true }, 'THEME_UNCONFIRMED'], [{ changeAt: 3 }, 'ACCOUNT_CHANGED']]) {
    const { deps, writes } = fixture(options);
    await assert.rejects(lessonTheme('set-lesson-theme', choice(), deps), { code }); assert.equal(writes.length, 1);
  }
  const { deps } = fixture({ partial: true });
  assert.match((await lessonTheme('set-lesson-theme', choice(), deps)).warning, /ошибке выдачи/);
});

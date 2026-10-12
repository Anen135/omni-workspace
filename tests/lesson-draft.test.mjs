import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

// Node's built-in type stripping does not resolve extensionless TS imports;
// bundle the small pure helper with esbuild so the project test command can load it.
const { outputFiles } = await build({
  entryPoints: [resolve('src/features/lesson/lesson-draft.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const helperUrl = `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`;
const { lessonDraftConflict, reconcileLessonDraft } = await import(helperUrl);

const presents = (students) => ({
  cur_date: '2026-10-12', cur_group: 10, cur_lenta: 0, cur_schedule: 50,
  students,
});
const baseStudents = () => [
  { id_stud: 101, was: null, id_vizit: null, theme: '', mark2: null, mark4: null },
  { id_stud: 102, was: 2, id_vizit: 9, theme: 'Тема', mark2: 6, mark4: null },
];

test('reconcile removes only values confirmed by the fresh lesson and preserves other expected baselines', () => {
  const draft = {
    attendance: {
      101: { stud: '101', was: 1, previousWas: null, visit: null },
      102: { stud: '102', was: 0, previousWas: 2, visit: '9' },
    },
    marks: {
      '101:2': { stud: '101', type: 2, mark: 8, previousMark: null, visit: null },
      '102:4': { stud: '102', type: 4, mark: 7, previousMark: null, visit: '9' },
    },
    needsReload: true,
  };
  const fresh = presents([
    { id_stud: 101, was: 1, id_vizit: null, theme: '', mark2: 8, mark4: null },
    ...baseStudents().slice(1),
  ]);

  const reconciled = reconcileLessonDraft(draft, fresh);

  assert.deepEqual(reconciled.attendance, { 102: draft.attendance[102] });
  assert.deepEqual(reconciled.marks, { '102:4': draft.marks['102:4'] });
  assert.equal(reconciled.needsReload, false);
  assert.equal(draft.attendance[102].previousWas, 2, 'reconciliation must not rebase an unconfirmed edit');
  assert.equal(draft.marks['102:4'].previousMark, null);
});

test('detects a conflicting attendance or mark source changed in Omni', () => {
  const draft = {
    attendance: { 101: { stud: '101', was: 1, previousWas: null, visit: null } },
    marks: { '102:2': { stud: '102', type: 2, mark: 8, previousMark: '6', visit: '9' } },
  };
  const changed = baseStudents();
  changed[0].was = 0;
  assert.match(lessonDraftConflict(draft, presents(changed)), /Посещаемость или запись ученика изменилась/);

  const attendanceOnly = { attendance: {}, marks: draft.marks };
  changed[0].was = null;
  changed[1].mark2 = 5;
  assert.match(lessonDraftConflict(attendanceOnly, presents(changed)), /Оценка или запись ученика изменилась/);
});

test('accepts a no-visit draft before topic save, then validates it against rebased post-topic metadata', () => {
  const draft = {
    theme: { theme: 'Новая тема', publicWeekId: '7', issueHomework: false, issueLabwork: false, previousTheme: 'Тема' },
    attendance: { 101: { stud: '101', was: 1, previousWas: null, visit: null } },
    marks: { '101:2': { stud: '101', type: 2, mark: 9, previousMark: null, visit: null } },
  };
  const beforeTopic = presents(baseStudents());
  assert.equal(lessonDraftConflict(draft, beforeTopic), '');

  const afterTopicStudents = baseStudents();
  afterTopicStudents[0] = { ...afterTopicStudents[0], was: 0, id_vizit: 80, theme: 'Новая тема' };
  afterTopicStudents[1] = { ...afterTopicStudents[1], theme: 'Новая тема' };
  const afterTopic = presents(afterTopicStudents);
  assert.match(lessonDraftConflict(draft, afterTopic), /Тема уже изменилась/);
  const afterThemeAccepted = { ...draft, theme: undefined };
  assert.match(lessonDraftConflict(afterThemeAccepted, afterTopic), /Посещаемость или запись ученика изменилась/);

  const rebased = {
    ...afterThemeAccepted,
    attendance: { 101: { ...draft.attendance[101], previousWas: 0, visit: '80' } },
    marks: { '101:2': { ...draft.marks['101:2'], visit: '80' } },
  };
  assert.equal(lessonDraftConflict(rebased, afterTopic), '');
});

test('reconciliation matches student IDs exactly and keeps a different student draft', () => {
  const draft = {
    attendance: {
      101: { stud: '101', was: 1, previousWas: null, visit: null },
      1101: { stud: '1101', was: 2, previousWas: null, visit: null },
    },
    marks: {},
  };
  const fresh = presents([
    { id_stud: 101, was: 1, id_vizit: null },
    { id_stud: 1101, was: null, id_vizit: null },
  ]);
  const reconciled = reconcileLessonDraft(draft, fresh);
  assert.deepEqual(reconciled.attendance, { 1101: draft.attendance[1101] });
});

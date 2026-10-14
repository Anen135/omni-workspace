import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [resolve('src/features/lesson/lesson-copy.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { matchingLessonStudents, transferableMark, copyLessonDraft } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`,
);

const emptyDraft = () => ({ attendance: {}, marks: {} });
const targetStudent = (id, overrides = {}) => ({
  id_stud: id, was: 0, id_vizit: id + 1000, theme: 'Текущая тема', mark2: 5, mark4: null,
  ...overrides,
});
const sourceStudent = (id, overrides = {}) => ({
  id_stud: id, was: 1, id_vizit: id + 9000, theme: 'Другая тема', mark2: 8, mark4: 9,
  ...overrides,
});

test('matches by unique student ID regardless of collection order and skips unmatched or ambiguous students', () => {
  const target = [targetStudent(101), targetStudent(102), targetStudent(103), targetStudent(103), targetStudent(104), targetStudent(105), targetStudent(0), targetStudent('invalid')];
  const source = [sourceStudent(102), sourceStudent('101'), sourceStudent(106), sourceStudent(104), sourceStudent('104'), sourceStudent(0), sourceStudent('invalid')];
  assert.deepEqual(matchingLessonStudents(target, source).map(match => [match.target.id_stud, match.source.id_stud]), [[101, '101'], [102, 102]]);
  const draft = copyLessonDraft(emptyDraft(), target, source, { attendance: true, marks: true, overwrite: true });
  assert.deepEqual(Object.keys(draft.attendance), ['101', '102']);
  assert.deepEqual(Object.keys(draft.marks), ['101:2', '101:4', '102:2', '102:4']);
});

test('copies values using destination visit IDs and baselines without copying source theme or mutating inputs', () => {
  const target = [targetStudent(101, { id_vizit: null, was: null, mark2: null })];
  const source = [sourceStudent(101)];
  const draft = emptyDraft();
  const before = structuredClone({ target, source, draft });
  const next = copyLessonDraft(draft, target, source, { attendance: true, marks: true, overwrite: true });
  assert.deepEqual(next.attendance['101'], { stud: '101', was: 1, previousWas: null, visit: null });
  assert.deepEqual(next.marks['101:2'], { stud: '101', type: 2, mark: 8, previousMark: null, visit: null });
  assert.deepEqual(next.marks['101:4'], { stud: '101', type: 4, mark: 9, previousMark: null, visit: null });
  assert.equal(next.theme, undefined);
  assert.deepEqual({ target, source, draft }, before);
});

test('category selection transfers only selected fields and leaves an existing topic choice intact', () => {
  const target = [targetStudent(101)];
  const source = [sourceStudent(101)];
  const draft = { ...emptyDraft(), theme: { theme: 'Черновая тема', publicWeekId: null, previousTheme: 'Текущая тема', issueHomework: false, issueLabwork: false } };
  const attendance = copyLessonDraft(draft, target, source, { attendance: true, marks: false, overwrite: true });
  assert.deepEqual(Object.keys(attendance.attendance), ['101']);
  assert.deepEqual(attendance.marks, {});
  assert.deepEqual(attendance.theme, draft.theme);
  const marks = copyLessonDraft(draft, target, source, { attendance: false, marks: true, overwrite: true });
  assert.deepEqual(marks.attendance, {});
  assert.deepEqual(Object.keys(marks.marks), ['101:2', '101:4']);
  assert.deepEqual(copyLessonDraft(draft, target, source, { attendance: false, marks: false }), draft);
});

test('copying over pending edits preserves their first expected server values and destination visits', () => {
  const draft = {
    attendance: { 101: { stud: '101', was: 2, previousWas: 0, visit: '1101' } },
    marks: { '101:2': { stud: '101', type: 2, mark: 6, previousMark: '5', visit: '1101' } },
  };
  // A displayed draft row carries staged values; those must not replace its baseline.
  const target = [targetStudent(101, { was: 2, mark2: 6 })];
  const next = copyLessonDraft(draft, target, [sourceStudent(101)], { attendance: true, marks: true, overwrite: true });
  assert.deepEqual(next.attendance['101'], { stud: '101', was: 1, previousWas: 0, visit: '1101' });
  assert.deepEqual(next.marks['101:2'], { stud: '101', type: 2, mark: 8, previousMark: '5', visit: '1101' });
});

test('copying baseline values clears reverted edits while empty source values leave pending edits unchanged', () => {
  const draft = {
    attendance: { 101: { stud: '101', was: 2, previousWas: 0, visit: '1101' } },
    marks: { '101:2': { stud: '101', type: 2, mark: 6, previousMark: '5', visit: '1101' }, '101:4': { stud: '101', type: 4, mark: 7, previousMark: null, visit: '1101' } },
  };
  const target = [targetStudent(101, { was: 2, mark2: 6, mark4: 7 })];
  const source = [sourceStudent(101, { was: 0, mark2: 5, mark4: null })];
  const next = copyLessonDraft(draft, target, source, { attendance: true, marks: true, overwrite: true });
  assert.deepEqual(next.attendance, {});
  assert.deepEqual(next.marks, { '101:4': draft.marks['101:4'] });
  const emptySource = [sourceStudent(101, { was: null, mark2: '', mark4: 0 })];
  assert.deepEqual(copyLessonDraft(draft, target, emptySource, { attendance: true, marks: true, overwrite: true }), draft);
});

test('accepts actual integer marks and rejects empty, boolean, zero, fractional or out-of-range values', () => {
  for (const value of [null, undefined, '', ' ', false, true, 0, '0', -1, 101, 2.5, 'NaN']) assert.equal(transferableMark(value), null);
  assert.equal(transferableMark(1), 1);
  assert.equal(transferableMark('12'), 12);
  assert.equal(transferableMark(100), 100);
});

test('default copy fills only empty destination values and preserves filled values in both Omni and local draft', () => {
  const target = [targetStudent(101), targetStudent(102, { was: null, mark2: null, mark4: null })];
  const source = [sourceStudent(101), sourceStudent(102)];
  const draft = {
    attendance: { 102: { stud: '102', was: 2, previousWas: null, visit: '1102' } },
    marks: { '102:2': { stud: '102', type: 2, mark: 6, previousMark: null, visit: '1102' } },
  };
  const copied = copyLessonDraft(draft, target, source, { attendance: true, marks: true });
  assert.deepEqual(copied.attendance, draft.attendance, 'remote absence and existing local late status are both populated');
  assert.equal(copied.marks['101:2'], undefined, 'existing remote grade must remain');
  assert.deepEqual(copied.marks['102:2'], draft.marks['102:2'], 'existing pending grade must remain');
  assert.deepEqual(copied.marks['101:4'], { stud: '101', type: 4, mark: 9, previousMark: null, visit: '1101' });
  assert.deepEqual(copied.marks['102:4'], { stud: '102', type: 4, mark: 9, previousMark: null, visit: '1102' });
});

test('copying Topcoins fills only eligible students and can use attendance staged by the same copy', () => {
  const target = [targetStudent(101, { was: null, prize: 0 }), targetStudent(102, { was: 1, prize: 0 }), targetStudent(103, { was: 0, prize: 0 })];
  const source = [sourceStudent(101, { was: 2, prize: 1 }), sourceStudent(102, { prize: 2 }), sourceStudent(103, { prize: 3 })];
  const rewardsOnly = copyLessonDraft(emptyDraft(), target, source, { attendance: false, marks: false, rewards: true });
  assert.deepEqual(rewardsOnly.rewards, { 102: { stud: '102', reward: 2, previousReward: null, visit: '1102' } });
  const copiedTogether = copyLessonDraft(emptyDraft(), target, source, { attendance: true, marks: false, rewards: true });
  assert.deepEqual(Object.keys(copiedTogether.rewards), ['101', '102'], 'unknown attendance can be filled, existing absence is protected');
  assert.equal(copiedTogether.attendance[101].was, 2);
  const overwrite = copyLessonDraft(emptyDraft(), target, source, { attendance: true, marks: false, rewards: true, overwrite: true });
  assert.deepEqual(Object.keys(overwrite.rewards), ['101', '102', '103']);
});

test('copying Topcoins skips removal, unknown source and unknown destination values instead of guessing rewards', () => {
  for (const prize of [0, '0', 4, '4', null, undefined, '', 5, true]) {
    const next = copyLessonDraft(emptyDraft(), [targetStudent(101, { was: 1, prize: 0 })], [sourceStudent(101, { prize })], { attendance: false, marks: false, rewards: true, overwrite: true });
    assert.deepEqual(next.rewards || {}, {}, 'source removal must not revoke or create a destination award');
  }
  const unknownTarget = copyLessonDraft(emptyDraft(), [targetStudent(101, { was: 1, prize: 9 })], [sourceStudent(101, { prize: 2 })], { attendance: false, marks: false, rewards: true, overwrite: true });
  assert.deepEqual(unknownTarget.rewards || {}, {});
});

test('reward copy preserves pending awards and removals by default; explicit overwrite retains first reward baseline', () => {
  const draft = { ...emptyDraft(), rewards: { 101: { stud: '101', reward: 4, previousReward: '3', visit: '1101' } } };
  const target = [targetStudent(101, { was: 1, prize: 3 })];
  const source = [sourceStudent(101, { prize: 2 })];
  const untouched = copyLessonDraft(draft, target, source, { attendance: false, marks: false, rewards: true });
  assert.deepEqual(untouched.rewards, draft.rewards, 'pending removal counts as an existing local choice');
  const overwritten = copyLessonDraft(draft, target, source, { attendance: false, marks: false, rewards: true, overwrite: true });
  assert.deepEqual(overwritten.rewards['101'], { stud: '101', reward: 2, previousReward: '3', visit: '1101' });
});

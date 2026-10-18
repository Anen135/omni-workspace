import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentText, studentId, studentRow, selectStudents, studentPage, studentDate, studentProfileData, studentAttendance } from '../src/features/students/students.ts';

test('display preserves zero and rejects missing and non-scalar values', () => {
  assert.equal(studentText(0), '0');
  for (const value of [null, undefined, '', '  ', false, {}, [], NaN, Infinity]) assert.equal(studentText(value), '');
  assert.equal(studentText('  example@example.invalid '), 'example@example.invalid');
});

test('opening requires a valid student ID', () => {
  assert.equal(studentId({ id_stud: '123' }), '123');
  assert.equal(studentId({ id_stud: 123 }), '123');
  assert.equal(studentId({ id_stud: '123456789012' }), '123456789012');
  for (const id of [null, undefined, 0, -1, 1.5, 'invalid', Infinity, '9007199254740992', '1234567890123', '01']) assert.equal(studentId({ id_stud: id }), '');
});

test('known source fields retain valid zero and raw record identity', () => {
  const source = { id_stud: 7, fio_stud: 'Тестовый Студент', gpa: 0, average: 10, avg_mark: 4, percent_vizit: 0, age: 0, st_email: 'test@example.invalid', phone_stud: '+7 000 100-20-30', st_login: 'test_student', last_date_vizit: '2026-10-18 09:15:32' };
  const row = studentRow(source);
  assert.equal(row.source, source);
  assert.equal(row.values.name, 'Тестовый Студент');
  assert.equal(row.values.average, '0');
  assert.equal(row.values.attendance, '0');
  assert.equal(row.values.age, '0');
  assert.equal(row.values.email, 'test@example.invalid');
  assert.equal(row.values.phone, '+7 000 100-20-30');
  assert.equal(row.values.login, 'test_student');
  assert.equal(row.values.lastVisit, '18.10.2026 09:15:32');
  assert.equal(studentRow({ avg_mark: 0 }).values.average, '0');
  assert.equal(studentRow({ average: null }).values.average, '');
});

function normalized(id, values = {}) {
  return { ...studentRow({ id_stud: id, fio_stud: `Студент ${id}` }), values: { ...studentRow({}).values, name: `Студент ${id}`, ...values } };
}

test('search covers actual contact, login and name fields with multiple terms', () => {
  const items = [{ id_stud: 1, fio_stud: 'Анна Тестовая', st_email: 'anna@example.invalid', phone_stud: '+7 000 100-20-30', st_login: 'anna_test' }, { id_stud: 2, fio_stud: 'Борис Тестовый' }].map(studentRow);
  for (const query of ['АННА', 'example.invalid', '100-20-30', 'anna_test', 'анна anna_test']) assert.equal(selectStudents(items, query, 'name', true)[0].id, '1');
  assert.equal(selectStudents(items, 'борис anna_test', 'name', true).length, 0);
  assert.equal(selectStudents(items, '   ', 'name', true).length, 2);
});

test('calendar dates retain source day, timestamp precision and missing values', () => {
  assert.equal(studentDate('2024-02-29'), '29.02.2024');
  assert.equal(studentDate('2026-10-18T23:59:54Z'), '18.10.2026 23:59:54');
  assert.equal(studentDate('2026-10-18 10:20'), '18.10.2026 10:20');
  assert.equal(studentDate('0000-00-00 00:00:00'), '');
  assert.equal(studentDate(null), '');
  for (const invalid of ['2025-02-29', '2026-13-01', '2026-01-01 24:20:00', 'unknown']) assert.equal(studentDate(invalid), invalid);
});

test('MyStat login sorts by calendar chronology across months and years, including seconds', () => {
  const items = [
    { id_stud: 1, last_date_vizit: '2026-02-01 01:00:00' },
    { id_stud: 2, last_date_vizit: null },
    { id_stud: 3, last_date_vizit: '2025-12-31 23:59:00' },
    { id_stud: 4, last_date_vizit: '2026-01-30 10:00:05' },
    { id_stud: 5, last_date_vizit: '2026-01-30 10:00:01' },
  ].map(studentRow);
  assert.deepEqual(selectStudents(items, '', 'lastVisit', true).map(item => item.id), ['3', '5', '4', '1', '2']);
  assert.deepEqual(selectStudents(items, '', 'lastVisit', false).map(item => item.id), ['1', '4', '5', '3', '2']);
});

test('profile merges direct details and rejects explicitly mismatched or invalid identity', () => {
  const source = { id_stud: 1, fio_stud: 'Тестовый Студент', gpa: 0, name_tgroups: 'Старая группа' };
  const details = { name_tgroups: 'Текущая группа', name_streams: 'Поток A', dir_name: 'Направление A', birthdat_stud: '2010-01-02', st_mob1: '+7 000 123-45-67' };
  const profile = studentProfileData(source, details);
  assert.equal(profile.mismatch, false);
  assert.equal(profile.student.name_tgroups, 'Текущая группа');
  assert.equal(profile.student.gpa, 0);
  assert.equal(profile.student.birthdat_stud, '2010-01-02');
  assert.equal(studentRow(profile.student).values.phone, '+7 000 123-45-67');
  assert.equal(studentProfileData(source, { id_stud: '1', ...details }).mismatch, false);
  for (const id_stud of [2, null, '', 'invalid']) {
    const rejected = studentProfileData(source, { id_stud, ...details });
    assert.equal(rejected.mismatch, true);
    assert.equal(rejected.student, source);
  }
  assert.equal(source.name_tgroups, 'Старая группа');
  assert.equal(studentProfileData(source, []).student.fio_stud, source.fio_stud);
});

test('attendance uses official per-class fields, zero as ungraded, explicit status and comments', () => {
  const visits = studentAttendance([
    { date_vizit: '2026-10-18', name_spec: 'Тестовый предмет', theme: 'Тестовая тема', fio_teach: 'Тестовый Преподаватель', was: 0, homework_mark: 0, control_mark: 10, work_in_class: null, labwork_mark: 9, mark5: 8, comments: 'Тестовый комментарий' },
    { was: '1' }, { was: 2 }, { was: 3 }, { unknown: 'ignored' },
  ]);
  assert.equal(visits.length, 4);
  assert.equal(visits[0].date, '18.10.2026');
  assert.equal(visits[0].teacher, 'Тестовый Преподаватель');
  assert.deepEqual(visits[0].marks, ['', '10', '', '9', '8']);
  assert.equal(visits[0].comment, 'Тестовый комментарий');
  assert.deepEqual(visits.map(visit => visit.status), ['Отсутствовал', 'Присутствовал', 'Опоздал', 'Не отмечено']);
  assert.deepEqual(studentAttendance(null), []);
  assert.equal(studentAttendance({ date_vizit: '2026-10-18', was: 1 }).length, 1);
});

test('numeric sort is numeric, locale aware and keeps missing values last', () => {
  const items = [normalized(1, { average: '' }), normalized(2, { average: '10' }), normalized(3, { average: '2,5' }), normalized(4, { average: '0' })];
  assert.deepEqual(selectStudents(items, '', 'average', true).map(row => row.id), ['4', '3', '2', '1']);
  assert.deepEqual(selectStudents(items, '', 'average', false).map(row => row.id), ['2', '3', '4', '1']);
  assert.deepEqual(items.map(row => row.id), ['1', '2', '3', '4'], 'sorting does not mutate the input');
});

test('natural name sorting and ties are stable', () => {
  const items = [normalized(12), normalized(2), normalized(1), normalized(3, { name: 'Студент 2' })];
  assert.deepEqual(selectStudents(items, '', 'name', true).map(row => row.id), ['1', '2', '3', '12']);
});

test('pagination supports 25, 50 and 100 and clamps after filtering', () => {
  const items = Array.from({ length: 113 }, (_, index) => normalized(index + 1));
  for (const size of [25, 50, 100]) {
    const first = studentPage(items, 0, size);
    assert.equal(first.items.length, size);
    const last = studentPage(items, 999, size);
    assert.equal(last.page, Math.ceil(113 / size) - 1);
    assert.equal(last.items.at(-1).id, '113');
  }
  assert.deepEqual(studentPage([], 20, 25), { items: [], page: 0, pages: 1 });
  assert.equal(studentPage(items.slice(0, 3), 4, 25).page, 0);
});

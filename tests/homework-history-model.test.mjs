import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: [resolve('src/features/homework/homework-history.ts')], bundle: true,
  platform: 'node', format: 'esm', write: false });
const { homeworkHistoryGroups, homeworkHistoryId, homeworkHistoryStatus, homeworkHistoryMatches, homeworkHistoryModel } =
  await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

const student = { id_stud: '7', fio_stud: 'Студент' };
const assignment = { id_domzad: 11, theme: 'Тема', overdue: true };
const model = cell => homeworkHistoryModel([student], { table_header: [assignment], table_body: { 7: { 11: cell } } });

test('uses only exact official numeric and numeric-string cell statuses', () => {
  for (const [value, status] of ['pending', 'checked', 'new', 'retake', 'overdue'].entries()) {
    assert.equal(homeworkHistoryStatus({ status: value }), status);
    assert.equal(homeworkHistoryStatus({ status: String(value) }), status);
  }
  for (const status of [undefined, null, '', ' ', false, true, '01', '1.0', ' 1', 5, -1, {}, []]) {
    assert.equal(homeworkHistoryStatus({ status, mark: 10, overdue: true, stud_date: '2026-10-28' }), 'unknown');
  }
  assert.equal(homeworkHistoryStatus(null), 'unknown');
});

test('missing and null cells stay unknown; assignment overdue never overrides submitted status', () => {
  assert.equal(model(null).rows[0].status, 'unknown');
  assert.equal(homeworkHistoryModel([student], { table_header: [assignment], table_body: {} }).rows[0].status, 'unknown');
  const row = model({ status: 1, mark: 10 }).rows[0];
  assert.equal(row.status, 'checked');
  assert.equal(row.assignment.overdue, true);
  assert.equal(homeworkHistoryMatches(row, 'submitted'), true);
  assert.equal(homeworkHistoryMatches(row, 'overdue'), false);
  for (const status of ['checked', 'new']) assert.equal(homeworkHistoryMatches({ status }, 'submitted'), true);
  for (const status of ['pending', 'overdue', 'retake', 'unknown']) assert.equal(homeworkHistoryMatches({ status }, 'submitted'), false);
});

test('catalog preserves exact subject tuple and supports keyed group IDs', () => {
  const source = { id_spec: 21, name_spec: 'Предмет', source: 'base', id_base_spec: '31' };
  assert.deepEqual(homeworkHistoryGroups({ groups_spec: { 12: { name_tgroups: 'Группа', data: [source] } }, months: [] }), [
    { id: '12', name: 'Группа', subjects: [{ key: '["21","base","31"]', name: 'Предмет', source }] },
  ]);
  assert.equal(homeworkHistoryGroups({ groups_spec: [{ id_tgroups: 2, data: [{ id_spec: 3 }] }] })[0].subjects[0].key, '["3",null,null]');
  assert.equal(homeworkHistoryGroups({ groups_spec: [{ id_tgroups: 2, data: [{ id_spec: 3, source: 0, id_base_spec: 0 }] }] })[0].subjects[0].key, '["3",0,0]');
  assert.throws(() => homeworkHistoryGroups({ groups_spec: [{ id_tgroups: 2, data: [{ id_spec: 3, source: {} }] }] }), /формат/);
  for (const id of ['', '0', '-1', '1.2', '01', '1234567890123', null, true]) assert.equal(homeworkHistoryId(id), '');
  assert.equal(homeworkHistoryId('123456789012'), '123456789012');
});

test('accepts indexed students and bounds the official full-header matrix to one assignment page', () => {
  const headers = Array.from({ length: 23 }, (_, index) => ({ id_domzad: index + 1, theme: String(index + 1) }));
  const result = homeworkHistoryModel({ 7: student }, { table_header: headers, table_body: [] }, 10, 10);
  assert.equal(result.rows.length, 10);
  assert.equal(result.rows[0].homeworkId, '11');
  assert.equal(result.rows[9].homeworkId, '20');
  assert.equal(result.hasNext, true);
  assert.equal(homeworkHistoryModel([student], { table_header: headers, table_body: {} }, 20, 10).hasNext, false);
  assert.equal(homeworkHistoryModel([], { table_header: [], table_body: {} }).assignmentCount, 0);
});

test('real matrix schema supplies student identities and dz_theme with nullable subject IDs', () => {
  const subject = { id_spec: null, id_base_spec: '41', source: 1, name_spec: 'Предмет A' };
  const catalog = { groups_spec: { 5: { name_tgroups: 'Группа A', data: [subject] } } };
  const parsedSubject = homeworkHistoryGroups(catalog)[0].subjects[0];
  assert.equal(parsedSubject.key, '[null,1,"41"]');
  assert.equal(parsedSubject.source, subject);
  assert.equal(homeworkHistoryGroups({ groups_spec: { 5: { data: [{ id_spec: null, id_base_spec: '41', source: 1 }] } } })[0].subjects[0].name, '41');
  const headers = [21, 22, 23].map(id => ({ id_domzad: id, dz_theme: `Задание ${id}`, theme: 'Старое название', overdue: true }));
  const body = Object.fromEntries(['101', '102'].map((id, index) => [id, Object.fromEntries(headers.map(header => [header.id_domzad, {
    id_stud: null, stud_stud: id, fio_stud: `Студент ${index + 1}`, theme: null, status: 0,
  }]))]));
  const result = homeworkHistoryModel([], { table_header: headers, table_body: body });
  assert.equal(result.rows.length, 6);
  assert.deepEqual(result.rows.map(row => row.studentId), ['101', '101', '101', '102', '102', '102']);
  assert.deepEqual(result.rows.map(row => row.theme), ['Задание 21', 'Задание 22', 'Задание 23', 'Задание 21', 'Задание 22', 'Задание 23']);
  assert.deepEqual(result.rows.map(row => row.studentName), ['Студент 1', 'Студент 1', 'Студент 1', 'Студент 2', 'Студент 2', 'Студент 2']);
  assert.ok(result.rows.every(row => row.status === 'pending' && row.cell.id_stud === null));
  assert.equal(homeworkHistoryModel([student], { table_header: headers, table_body: body }).rows.length, 6);
  const missingCells = homeworkHistoryModel([{ id_stud: 101, fio_stud: 'Имя из списка' }], {
    table_header: headers, table_body: { 101: {} },
  });
  assert.equal(missingCells.rows[0].studentName, 'Имя из списка');
  assert.ok(missingCells.rows.every(row => row.status === 'unknown'));
  assert.equal(homeworkHistoryModel([], { table_header: headers, table_body: {} }).rows.length, 0);
  assert.throws(() => homeworkHistoryModel([], {
    table_header: headers, table_body: { 101: { 21: { stud_stud: '102', fio_stud: 'Чужое имя', status: 0 } } },
  }), /формат/);
});

test('nullable subject requires explicit null, positive base ID and scalar source', () => {
  const parse = subject => homeworkHistoryGroups({ groups_spec: { 5: { data: [subject] } } });
  for (const id_spec of [undefined, 0, '0', '', 'bad', false]) {
    assert.throws(() => parse({ id_spec, id_base_spec: 41, source: 1 }), /формат/);
  }
  for (const id_base_spec of [undefined, null, 0, '0', '', -1, '01', '1234567890123']) {
    assert.throws(() => parse({ id_spec: null, id_base_spec, source: 1 }), /формат/);
  }
  for (const source of [{}, [], true, Infinity, NaN]) {
    assert.throws(() => parse({ id_spec: null, id_base_spec: 41, source }), /формат/);
  }
  for (const source of [null, '', 'base', 0, 1]) {
    assert.equal(parse({ id_spec: null, id_base_spec: 41, source })[0].subjects[0].key, JSON.stringify([null, source, 41]));
  }
});

test('unsupported schemas fail visibly instead of becoming empty history', () => {
  for (const catalog of [null, { group: { data: [] } }, { groups_spec: [{ id_tgroups: '1', data: [{ id_spec: '0' }] }] },
    { groups_spec: [{ id_tgroups: '1', subjects: [] }] }, { groups_spec: null }]) {
    assert.throws(() => homeworkHistoryGroups(catalog), /формат/);
  }
  for (const history of [null, {}, [], { table_header: {}, table_body: {} }, { table_header: [], table_body: null },
    { table_header: [{ theme: 'Без ID' }], table_body: {} }, { table_header: [assignment], table_body: { 7: { 11: 'unexpected' } } }]) {
    assert.throws(() => homeworkHistoryModel([student], history), /формат/);
  }
  assert.throws(() => homeworkHistoryModel([{ name: 'Нет ID' }], { table_header: [], table_body: {} }), /формат/);
  assert.throws(() => homeworkHistoryModel([student, student], { table_header: [], table_body: {} }), /формат/);
  assert.throws(() => homeworkHistoryModel([], { table_header: [assignment], table_body: { bad: {} } }), /формат/);
});

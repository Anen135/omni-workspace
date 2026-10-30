import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/features/lesson/lesson-table-filter.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { filterLessonRows, lessonFilterFields, lessonFilterError } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const rows = Object.freeze([
  { id_stud: '1', fio_stud: 'Анна', was: 1, mark4: '', prize: 0 },
  { id_stud: '2', fio_stud: 'Борис', was: 2, mark4: '10', prize: 1 },
  { id_stud: '3', fio_stud: 'Вера', was: 0, mark4: '0', prize: 4 },
  { id_stud: '4', fio_stud: 'Глеб', was: null, mark4: 'bad', prize: null },
]);
const fields = lessonFilterFields(new Map([['1', '8'], ['2', '10,5'], ['3', '0'], ['4', '']]));
const c = (fieldId, operator, value = '', to = '') => ({ fieldId, operator, value, to });
const ids = groups => filterLessonRows(rows, fields, groups).map(row => row.id_stud);

test('OR groups of AND conditions reuse typed accessors, preserve original row order and identity', () => {
  assert.deepEqual(ids([[c('attendance', 'eq', '1'), c('mark4', 'empty')]]), ['1']);
  assert.deepEqual(ids([[c('attendance', 'eq', '1')], [c('attendance', 'eq', '2')]]), ['1', '2']);
  assert.deepEqual(ids([[c('attendance', 'eq', '1'), c('mark4', 'filled')], [c('student', 'contains', 'БОР')]]), ['2']);
  const result = filterLessonRows(rows, fields, [[c('mark4', 'filled')]]);
  assert.equal(result[0], rows[1]);
  assert.deepEqual(filterLessonRows(rows, fields, []), rows);
});

test('numeric bounds are inclusive; strict comparisons, negation and comma inputs exclude missing values', () => {
  assert.deepEqual(ids([[c('average', 'between', '8', '10,5')]]), ['1', '2']);
  assert.deepEqual(ids([[c('average', 'between', '', '8')]]), ['1', '3']);
  assert.deepEqual(ids([[c('average', 'between', '8')]]), ['1', '2']);
  assert.deepEqual(ids([[c('average', 'gt', '8')]]), ['2']);
  assert.deepEqual(ids([[c('average', 'gte', '8')]]), ['1', '2']);
  assert.deepEqual(ids([[c('average', 'lt', '8')]]), ['3']);
  assert.deepEqual(ids([[c('average', 'lte', '8')]]), ['1', '3']);
  assert.deepEqual(ids([[c('average', 'eq', '10.5')]]), ['2']);
  assert.deepEqual(ids([[c('average', 'ne', '8')]]), ['2', '3']);
  assert.deepEqual(ids([[c('attendance', 'ne', '1')]]), ['2', '3']);
  assert.deepEqual(ids([[c('student', 'notContains', 'А')]]), ['2', '4']);
});

test('zero values are filled while null, invalid numbers and missing statuses are empty', () => {
  assert.deepEqual(ids([[c('average', 'eq', '0')]]), ['3']);
  assert.deepEqual(ids([[c('mark4', 'filled')]]), ['2', '3']);
  assert.deepEqual(ids([[c('mark4', 'empty')]]), ['1', '4']);
  assert.deepEqual(ids([[c('attendance', 'empty')]]), ['4']);
  assert.deepEqual(ids([[c('rewards', 'eq', '0')]]), ['1', '3', '4'], 'Omni represents no reward as 0, 4 or null');
});

test('invalid, incomplete, unavailable or empty groups fail closed even beside a matching OR branch', () => {
  const bad = [c('average', 'between'), c('average', 'between', '11', '8'), c('average', 'gte', 'Infinity'),
    c('average', 'eq', 'false'), c('student', 'contains', '  '), c('missing', 'empty'), c('attendance', 'eq', '9'), c('student', 'gte', '1')];
  for (const condition of bad) {
    assert.ok(lessonFilterError(condition, fields));
    assert.deepEqual(ids([[condition], [c('student', 'contains', 'Анна')]]), []);
  }
  assert.deepEqual(ids([[]]), []);
  assert.deepEqual(filterLessonRows([], fields, [[c('mark4', 'empty')]]), []);
});

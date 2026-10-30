import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/features/lesson/lesson-table-sort.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { lessonSortFields, lessonSortNumber } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('lesson numeric accessors distinguish empty/invalid data from zero and parse comma decimals', () => {
  for (const value of [null, undefined, '', ' ', false, true, NaN, Infinity, '12abc']) assert.equal(lessonSortNumber(value), null);
  assert.equal(lessonSortNumber(' 10,5 '), 10.5);
  assert.equal(lessonSortNumber('2'), 2);
  assert.equal(lessonSortNumber(0), 0);
  const fields = lessonSortFields(new Map([['1', '0'], ['2', '10,5']]));
  const value = (id, row) => fields.find(field => field.id === id).value(row);
  assert.equal(value('average', { id_stud: 1 }), 0);
  assert.equal(value('average', { id_stud: 2 }), 10.5);
  assert.equal(value('mark4', { mark4: '12' }), 12);
  assert.equal(value('attendance', { was: 0 }), 0);
  assert.equal(value('rewards', { prize: 4 }), 0);
  assert.equal(lessonSortFields(new Map([['1', '12']]), true).find(field => field.id === 'average').value({ id_stud: 1 }), null);
});

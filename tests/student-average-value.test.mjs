import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/app/student-average-value.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { studentAverageValue } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
test('roster ingestion preserves zero and decimals, missing values and invalid nonempty provenance', () => {
  for (const raw of [false, true, {}, [], NaN, Infinity]) assert.throws(() => studentAverageValue({ gpa: raw }), /некорректный/);
  for (const raw of [null, undefined, '', '  ']) assert.equal(studentAverageValue({ gpa: raw }), undefined);
  assert.equal(studentAverageValue({ gpa: 0 }), '0');
  assert.equal(studentAverageValue({ gpa: '10,5' }), '10,5');
  assert.equal(studentAverageValue({ gpa: 'bad' }), 'bad', 'invalid numeric text remains visible to fill validation');
  assert.equal(studentAverageValue({ average: 8.5 }), '8.5');
  assert.equal(studentAverageValue({ avg_mark: '9' }), '9');
});

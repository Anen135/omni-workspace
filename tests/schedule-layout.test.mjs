import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutLessons, timeMinutes } from '../src/schedule-layout.ts';

test('time placement rejects missing/invalid times instead of inventing slot hours', () => {
  for (const value of ['', 'Пара 1', '25:00', '12:80', '12']) assert.equal(timeMinutes(value), null);
  assert.equal(timeMinutes('7:15'), 435);
  assert.equal(timeMinutes('23:30:00'), 1410);
  const lessons = [{ start: '', end: '', slot: '1' }, { start: '12:00', end: '11:00' }, { start: '7:15', end: '08:30' }];
  const result = layoutLessons(lessons);
  assert.equal(result.untimed.length, 2);
  assert.equal(result.timed[0].start, 435);
});
test('overlapping lessons get separate lanes, later clusters regain full width', () => {
  const result = layoutLessons([{ start: '09:00', end: '10:00' }, { start: '09:30', end: '11:00' }, { start: '10:00', end: '10:30' }, { start: '11:00', end: '12:00' }]);
  assert.deepEqual(result.timed.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [0, 2], [0, 1]]);
});

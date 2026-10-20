import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layoutLessons, timeMinutes, scheduleTimeBoundaries } from '../src/features/schedule/schedule-layout.ts';

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

test('shared time boundaries retain exact short intervals, early/late hours and cross-day alignment', () => {
  const a = layoutLessons([{ start: '07:15', end: '07:30' }, { start: '07:15', end: '08:00' }]);
  const b = layoutLessons([{ start: '07:15', end: '07:30' }, { start: '23:15', end: '23:45' }]);
  const boundaries = scheduleTimeBoundaries([a, b]);
  assert.equal(boundaries[0], 420);
  assert.equal(boundaries.at(-1), 1440);
  assert.ok(boundaries.includes(435) && boundaries.includes(450) && boundaries.includes(1395) && boundaries.includes(1425));
  assert.equal(boundaries.filter(value => value === 435).length, 1);
  assert.ok(boundaries.every((value, index) => !index || value > boundaries[index - 1]));
  assert.deepEqual(a.timed.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2]]);
});

test('invalid, missing and zero-duration intervals never receive invented timeline positions', () => {
  const layout = layoutLessons([{ start: '', end: '' }, { start: '09:00', end: '09:00' }, { start: '12:00', end: '11:00' }, { start: '25:00', end: '26:00' }]);
  assert.deepEqual(scheduleTimeBoundaries([layout]), []);
  assert.equal(layout.untimed.length, 4);
  assert.equal(timeMinutes('07:15:99'), null);
  assert.equal(timeMinutes('07:15:30'), 435.5);
  assert.deepEqual(scheduleTimeBoundaries([layoutLessons([{ start: '07:15:30', end: '07:15:45' }])]), [420, 435.5, 435.75, 480]);
});

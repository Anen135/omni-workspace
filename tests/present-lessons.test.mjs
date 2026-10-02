import { test } from 'node:test';
import assert from 'node:assert/strict';
import { presentLessons } from '../src/present-lessons.ts';
test('attendance lesson list keeps real collection keys, including zero and sparse slots', () => {
  assert.deepEqual(presentLessons({ 0: { id_schedule: 999, name_spec: 'Предмет', l_start: '08:00', l_end: '09:30' }, 4: 'Вторая доступная пара' }), [
    { slot: '0', title: 'Предмет', time: '08:00 – 09:30' }, { slot: '4', title: 'Вторая доступная пара', time: '' },
  ]);
  assert.deepEqual(presentLessons([null, { n_lenta: 2 }]), [{ slot: '1', title: 'Пара 2', time: '' }]);
});
test('attendance list works without students and does not invent empty lessons', () => {
  assert.equal(presentLessons({ 3: { id_schedule: 33 } })[0].slot, '3');
  for (const value of [undefined, null, [], {}, { 0: null, 1: {}, 2: [], invalid: 'bad', 3: '' }]) assert.deepEqual(presentLessons(value), []);
});

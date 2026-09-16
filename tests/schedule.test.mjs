import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleDays } from '../src/schedule.ts';

const lesson = { name_spec: 'Предмет', groups: 'Группа A', num_rooms: 'Аудитория 1', l_start: '16:30', l_end: '17:50', scheduleType: 'planned' };
const dates = { 1: '2026-09-14', 2: '2026-09-15', 3: '2026-09-16', 4: '2026-09-17', 5: '2026-09-18', 6: '2026-09-19', 7: '2026-09-20' };

test('same subject on different dates and consecutive slots remains distinct', () => {
  const days = scheduleDays({ dates, body: {
    1: { 6: { ...lesson, lenta: '1', l_start: '09:00', l_end: '10:20' } },
    2: { 6: { ...lesson, lenta: '2', l_start: '10:30', l_end: '11:50' } },
    6: { 1: lesson, 2: { ...lesson, groups: 'Группа B' }, 3: lesson },
  } });
  assert.deepEqual(days.map(day => day.lessons.length), [1, 1, 1, 0, 0, 2, 0]);
  assert.equal(new Set(days.flatMap(day => day.lessons.map(item => item.key))).size, 5);
  assert.equal(days[2].date, '2026-09-16');
  assert.equal(days[1].lessons[0].group, 'Группа B');
  assert.equal(days[5].lessons[1].start, '10:30');
});

test('actual lesson time takes priority over the standard slot time', () => {
  const days = scheduleDays({ dates, body: { 6: { 1: lesson } }, lents: { 6: { 1: { l_start: '17:40', l_end: '19:00' } } } });
  assert.equal(days[0].lessons[0].start, '16:30');
  assert.equal(days[0].lessons[0].end, '17:50');
});

test('missing time falls back to the same weekday and slot, with lessons sorted by time', () => {
  const days = scheduleDays({ dates, body: { 0: { 1: { name_spec: 'Позже' } }, 6: { 1: lesson } }, lents: [{ 1: { l_start: '18:00', l_end: '19:20' } }] });
  assert.deepEqual(days[0].lessons.map(item => item.start), ['16:30', '18:00']);
  assert.equal(days[0].lessons[1].slot, '0');
});

test('empty responses and empty cells do not create lessons', () => {
  for (const body of [null, [], {}, { 1: { 1: null, 2: {}, 3: [] } }]) {
    assert.equal(scheduleDays({ dates, body }).flatMap(day => day.lessons).length, 0);
  }
  assert.deepEqual(scheduleDays(null), []);
});

test('date and day labels come from the requested week, including named events', () => {
  const days = scheduleDays({ dates: { 2: '2026-09-22' }, days: { 2: 'Вторник' }, daysShort: { 2: 'Вт' }, body: { 3: { 2: { eventName: 'Встреча', l_start: '12:00', l_end: '13:00' } } } });
  assert.equal(days[0].date, '2026-09-22');
  assert.equal(days[0].name, 'Вторник');
  assert.equal(days[0].lessons[0].subject, 'Встреча');
});

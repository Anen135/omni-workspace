import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/features/dossier/lesson-estimate.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { lessonEstimates, currentLessonEstimate } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const schedule = { dates: { 1: '2026-10-19' }, body: { 9: { 1: { lenta: 2, groups: 'A', scheduleType: 'planned' } }, 10: { 1: { lenta: 3, groups: 'B', scheduleType: 'planned' } } } };
const config = { defaultRate: 700, masterclassRate: 650, groupRates: { A: 0, B: 1234.5 }, payday: 10, masterclassLessons: [] };
const presents = { cur_date: '2026-10-19', cur_lenta: 2, cur_group: 7, groups: [{ id_tgroups: 7, name_tgroups: 'A' }] };
test('lesson estimates reuse income rates, retaining zero and decimal amounts', () => {
  assert.deepEqual(lessonEstimates(schedule, config, true).get('2026-10-19:9'), { amount: 0, initial: true });
  assert.deepEqual(currentLessonEstimate(schedule, config, false, presents), { amount: 0, initial: false });
  assert.equal(lessonEstimates(schedule, config, false).get('2026-10-19:10').amount, 1234.5);
});
test('current lesson joins explicit slot, date and group rather than collection index', () => {
  for (const change of [{ cur_lenta: 9 }, { cur_date: '2026-10-20' }, { cur_group: 8 }, { groups: [{ id_tgroups: 7, name_tgroups: 'B' }] }]) {
    assert.equal(currentLessonEstimate(schedule, config, false, { ...presents, ...change }).amount, null);
  }
  const duplicate = structuredClone(schedule);
  duplicate.body[11] = duplicate.body[9];
  assert.equal(currentLessonEstimate(duplicate, config, false, presents).amount, null);
});
test('unknown rates and unclassified events never invent a price', () => {
  assert.equal(currentLessonEstimate(schedule, { ...config, groupRates: { A: null } }, true, presents).amount, null);
  const event = { dates: schedule.dates, body: { 2: { 1: { scheduleType: 'event', eventName: 'Other' } } } };
  assert.equal(currentLessonEstimate(event, config, true, { ...presents, groups: [], scheduleType: 'event' }).amount, null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/features/lesson/lesson-bulk.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { stageLessonBulk, stageLessonRewardTargets } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const empty = () => ({ attendance: {}, marks: {}, rewards: {} });
const roster = () => [{ id_stud: '1', id_vizit: '10', was: 1, mark2: 8, prize: 0 }, { id_stud: '2', id_vizit: '20', was: 2, mark2: 9, prize: 0 }];
test('bulk marks affect only explicit IDs, retain first baselines and stages no transport', () => {
  const rows = roster();
  const first = stageLessonBulk(rows, empty(), ['1'], { column: 'mark2', value: 12 });
  const next = stageLessonBulk(rows, first, ['1', '2'], { column: 'mark2', value: 11 });
  assert.deepEqual(Object.keys(next.marks), ['1:2', '2:2']);
  assert.deepEqual(next.marks['1:2'], { stud: '1', type: 2, mark: 11, previousMark: '8', visit: '10' });
  assert.equal(first.marks['1:2'].mark, 12);
  assert.equal(rows[0].mark2, 8);
});
test('invalid, duplicate, stale and missing targets reject the whole candidate', () => {
  const draft = empty();
  for (const ids of [['1', '1'], ['1', '99'], ['1', 'bad'], []]) assert.throws(() => stageLessonBulk(roster(), draft, ids, { column: 'mark4', value: 12 }));
  assert.throws(() => stageLessonBulk([...roster(), roster()[0]], draft, ['1'], { column: 'mark4', value: 12 }));
  assert.throws(() => stageLessonBulk(roster(), { ...draft, needsReload: true }, ['1'], { column: 'mark4', value: 12 }));
  for (const value of [0, 101, NaN, 1.2]) assert.throws(() => stageLessonBulk(roster(), draft, ['1'], { column: 'mark4', value }));
  assert.deepEqual(draft, empty());
});
test('uniform reward over budget rejects atomically including hidden rows', () => {
  const draft = empty();
  assert.throws(() => stageLessonBulk(roster(), draft, ['1', '2'], { column: 'reward', value: 3 }), /5/);
  assert.deepEqual(draft, empty());
  const rows = [...roster(), { id_stud: '3', was: 1, prize: 3 }];
  assert.throws(() => stageLessonBulk(rows, draft, ['1'], { column: 'reward', value: 3 }), /5/);
});
test('reward redistribution validates final state, not transient row order', () => {
  const rows = roster().map((row, index) => ({ ...row, prize: index ? 2 : 3 }));
  const targets = [{ id: '2', coins: 3 }, { id: '1', coins: 2 }];
  const draft = stageLessonRewardTargets(rows, empty(), targets);
  assert.equal(draft.rewards['2'].reward, 3);
  assert.equal(draft.rewards['1'].previousReward, '3');
  assert.equal(draft.rewards['1'].reward, 2);
});
test('effective attendance is used and reward0 maps to removal sentinel', () => {
  const rows = roster(); rows[0].was = 0; rows[0].prize = 1;
  assert.throws(() => stageLessonRewardTargets(rows, empty(), [{ id: '1', coins: 0 }]), /присутствующим/);
  const draft = stageLessonBulk(rows, empty(), ['1'], { column: 'attendance', value: 1 });
  assert.equal(stageLessonRewardTargets(rows, draft, [{ id: '1', coins: 0 }]).rewards['1'].reward, 4);
  rows[1].prize = 'unknown';
  assert.throws(() => stageLessonRewardTargets(rows, draft, [{ id: '2', coins: 1 }]));
});

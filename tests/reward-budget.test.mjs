import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/features/lesson/lesson-reward.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { lessonRewardBudget, lessonRewardDraftAllowed, rewardMaximum, rewardLevel, LESSON_REWARD_LIMIT } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const roster = (...levels) => levels.map((prize, index) => ({ id_stud: index + 1, prize }));
const change = level => ({ reward: level === 0 ? 4 : level });

test('local reward limit counts saved awards once and draft targets replace them', () => {
  assert.equal(LESSON_REWARD_LIMIT, 5);
  assert.deepEqual(lessonRewardBudget(roster(3, 2)), { used: 5, remaining: 0 });
  assert.deepEqual(lessonRewardBudget(roster(3, 2), { 1: change(1) }), { used: 3, remaining: 2 });
  assert.deepEqual(lessonRewardBudget(roster(3, 2), { 1: change(0) }), { used: 2, remaining: 3 });
  for (const empty of [null, undefined, '', 0, '0', 4, '4']) assert.equal(rewardLevel(empty), 0);
});

test('all students count, including another table page or a filtered-out student', () => {
  const students = roster(...Array(26).fill(0));
  students[25].prize = 3;
  const budget = lessonRewardBudget(students, { 1: change(2) });
  assert.equal(budget.used, 5);
  assert.equal(rewardMaximum(students[1].prize, budget.remaining), 0);
});

test('unknown awards and ambiguous student identities prevent increases but allow known reductions', () => {
  for (const students of [roster(2, 'mystery'), [{ id_stud: 1, prize: 2 }, { id_stud: 1, prize: 1 }], [{ id_stud: 1, prize: 2 }, { prize: 1 }]]) {
    assert.deepEqual(lessonRewardBudget(students), { used: null, remaining: null });
    assert.equal(rewardMaximum(2, null), 2);
    assert.equal(lessonRewardDraftAllowed(students, { 1: change(3) }), false);
  }
  assert.equal(lessonRewardDraftAllowed(roster(2, 'mystery'), { 1: change(1) }), true);
  assert.equal(lessonRewardDraftAllowed(roster(2, 'mystery'), { 1: change(0) }), true);
  assert.equal(lessonRewardDraftAllowed(roster(2, 'mystery'), { 2: change(0) }), false);
  assert.equal(lessonRewardDraftAllowed(roster(0), { 99: change(1) }), false);
});

test('exhaustive three-student allocations never exceed five on an increase; existing excess can be repaired', () => {
  for (let a = 0; a <= 3; a++) for (let b = 0; b <= 3; b++) for (let c = 0; c <= 3; c++) {
    const students = roster(a, b, c);
    const before = [a, b, c];
    assert.equal(lessonRewardBudget(students).remaining, Math.max(0, 5 - a - b - c));
    for (let target = 0; target <= 3; target++) for (let index = 0; index < 3; index++) {
      const expected = target <= before[index] || a + b + c - before[index] + target <= 5;
      assert.equal(lessonRewardDraftAllowed(students, { [index + 1]: change(target) }), expected, `${before}: student ${index + 1} -> ${target}`);
      assert.equal(rewardMaximum(before[index], Math.max(0, 5 - a - b - c)), Math.min(3, before[index] + Math.max(0, 5 - a - b - c)));
    }
  }
});

test('a copied or persisted reward draft cannot bypass the cap and balanced redistribution fits', () => {
  assert.equal(lessonRewardDraftAllowed(roster(0, 0), { 1: change(3), 2: change(3) }), false);
  assert.equal(lessonRewardDraftAllowed(roster(3, 2), { 1: change(2), 2: change(3) }), true);
  assert.equal(lessonRewardDraftAllowed(roster(3, 3), { 1: change(2) }), true);
  assert.equal(lessonRewardDraftAllowed(roster(3, 3), {}), true);
  assert.deepEqual(lessonRewardBudget(roster(3, 3)), { used: 6, remaining: 0 });
});

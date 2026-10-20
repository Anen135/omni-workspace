import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const { outputFiles } = await build({ entryPoints: ['src/features/lesson/reward-allocation.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createRewardAllocation: allocate, allocationScore, rewardAllocationFingerprint: fingerprint } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const roster = (...scores) => scores.map((mark4, index) => ({ id_stud: index + 1, fio_stud: `Ученик ${index + 1}`, was: 1, mark4, prize: 0 }));
const levels = result => result.rows.map(row => row.proposed);

test('integer allocation follows the agreed examples without forcing the full budget', () => {
  for (const [scores, expected, remainder] of [
    [[12, 10, 7], [3, 2, 0], 0], [[12, 11, 10], [2, 2, 1], 0],
    [[12, 8], [3, 1], 1], [[12, 12], [2, 2], 1], [[12, 12, 12], [1, 1, 1], 2],
    [[12, 12, 12, 12, 12, 12], [0, 0, 0, 0, 0, 0], 5],
  ]) {
    const result = allocate({ items: roster(...scores) });
    assert.equal(result.blockedReason, '');
    assert.deepEqual(levels(result), expected);
    assert.equal(result.unallocated, remainder);
    if (scores.length === 6) assert.match(result.rows[0].reason, /равную награду/);
  }
});

test('equal scores stay equal and allocations do not depend on roster order', () => {
  const items = roster(12, 12, 10, 9, 7);
  const expected = new Map(allocate({ items }).rows.map(row => [row.id, row.proposed]));
  for (let rotation = 0; rotation < items.length; rotation++) {
    const permuted = [...items.slice(rotation), ...items.slice(0, rotation)].reverse();
    for (const row of allocate({ items: permuted }).rows) assert.equal(row.proposed, expected.get(row.id));
  }
});

test('all small score combinations respect ties, monotonicity, medal caps and the global limit', () => {
  const scores = [6, 7, 8, 9, 10, 11, 12];
  for (const a of scores) for (const b of scores) for (const c of scores) {
    const result = allocate({ items: roster(a, b, c) });
    const rows = [...result.rows].sort((left, right) => right.score - left.score);
    assert.ok(result.allocated + result.reserved <= 5);
    for (const row of rows) assert.ok(row.proposed <= (row.score < 7 ? 0 : row.score >= 11 ? 3 : row.score >= 9 ? 2 : 1));
    for (let i = 1; i < rows.length; i++) {
      assert.ok(rows[i - 1].proposed >= rows[i].proposed);
      if (rows[i - 1].score === rows[i].score) assert.equal(rows[i - 1].proposed, rows[i].proposed);
    }
  }
});

test('only explicit in-scale numeric scores qualify; missing values never coerce to zero', () => {
  for (const value of [undefined, null, '', ' ', 0, '0', false, true, [], {}, 'NaN', Infinity, 12.01, -1, '0xA', '1e1']) assert.equal(allocationScore(value), null);
  for (const [value, expected] of [[1, 1], ['12', 12], [' 9,5 ', 9.5], ['10.25', 10.25]]) assert.equal(allocationScore(value), expected);
  const result = allocate({ items: roster(undefined, '', 0, 13, '9,5') });
  assert.deepEqual(levels(result), [0, 0, 0, 0, 2]);
  assert.deepEqual(result.rows.map(row => row.eligible), [false, false, false, false, true]);
});

test('mark2, GPA aliases and combined scores require the selected values', () => {
  const items = roster(12, 12, 12);
  Object.assign(items[0], { mark2: 8, gpa: 10 });
  Object.assign(items[1], { mark2: 9, average: '8,5' });
  Object.assign(items[2], { mark2: '', avg_mark: 6 });
  assert.deepEqual(allocate({ items, mode: 'mark2' }).rows.map(row => row.score), [8, 9, null]);
  assert.deepEqual(allocate({ items, mode: 'average' }).rows.map(row => row.score), [10, 8.5, 6]);
  assert.deepEqual(allocate({ items, mode: 'both', studentAverages: new Map([['1', '8'], ['2', '']]) }).rows.map(row => row.score), [10, null, 9]);
  items[0].mark4 = '';
  assert.equal(allocate({ items, mode: 'both' }).rows[0].score, null);
});

test('preserve existing awards and every manual reward edit, including removal sentinel', () => {
  const items = roster(12, 12, 12, 12);
  items[0].prize = 2;
  items[1].prize = 4;
  items[2].prize = 1;
  const result = allocate({ items, draftRewardIds: new Set(['2', '3']) });
  assert.deepEqual(levels(result), [2, 0, 1, 2]);
  assert.equal(result.reserved, 3);
  assert.equal(result.available, 2);
  assert.deepEqual(result.targets, [{ id: '4', coins: 2 }]);
});

test('replace changes only present or late students with valid scores and can remove below-cutoff awards', () => {
  const items = roster(12, 5, 12, '', 12);
  items.forEach(item => { item.prize = 1; });
  items[0].was = 2;
  items[2].was = 0;
  items[4].was = null;
  const result = allocate({ items, replace: true, draftRewardIds: new Set(['1', '2']) });
  assert.deepEqual(levels(result), [2, 0, 1, 1, 1]);
  assert.equal(result.reserved, 3);
  assert.deepEqual(result.targets, [{ id: '1', coins: 2 }, { id: '2', coins: 0 }]);
});

test('unknown rewards, bad/duplicate IDs and draft IDs outside the full roster block all targets', () => {
  for (const items of [[{ id_stud: 1, prize: 7 }], [{ id_stud: '01', prize: 0 }], [{ id_stud: 0 }], [{}, {}], [{ id_stud: 1 }, { id_stud: '1' }]]) {
    const result = allocate({ items });
    assert.ok(result.blockedReason);
    assert.deepEqual(result.targets, []);
  }
  assert.ok(allocate({ items: roster(12), draftRewardIds: new Set(['99']), replace: true }).blockedReason);
  const excess = roster(12, 12); excess.forEach(item => { item.prize = 3; });
  assert.ok(allocate({ items: excess }).blockedReason);
  assert.deepEqual(levels(allocate({ items: excess, replace: true })), [2, 2]);
  assert.ok(allocate({ items: [] }).blockedReason);
});

test('configurable cutoff excludes scores below it and validates the entire scale', () => {
  assert.deepEqual(levels(allocate({ items: roster(6, 5), minimum: 5 })), [1, 1]);
  assert.deepEqual(levels(allocate({ items: roster(11, 10), minimum: 11 })), [3, 0]);
  for (const minimum of [NaN, 0, 13, Infinity]) assert.ok(allocate({ items: roster(12), minimum }).blockedReason);
});

test('preview fingerprint changes synchronously with context, effective inputs, averages, draft IDs and options', () => {
  const input = { items: roster(12), studentAverages: new Map([['1', '10']]), draftRewardIds: new Set(), minimum: 7, mode: 'mark4', replace: false };
  const original = fingerprint(input, 'lesson-a');
  const variants = [
    { ...input, items: [{ ...input.items[0], mark4: 11 }] }, { ...input, items: [{ ...input.items[0], was: 0 }] },
    { ...input, items: [{ ...input.items[0], prize: 1 }] }, { ...input, studentAverages: new Map([['1', '11']]) },
    { ...input, draftRewardIds: new Set(['1']) }, { ...input, minimum: 9 }, { ...input, mode: 'both' }, { ...input, replace: true },
  ];
  for (const variant of variants) assert.notEqual(fingerprint(variant, 'lesson-a'), original);
  assert.notEqual(fingerprint(input, 'lesson-b'), original);
});

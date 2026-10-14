import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveLessonReward } from '../extension/lesson-reward.mjs';
import { validateMessage } from '../extension/policy.mjs';

const input = () => ({ accountId: '1', date: '2026-10-13', group: '10', lenta: '0', schedule: '50', stud: '101', visit: '8', reward: 2, previousReward: '1' });
function fixture(options = {}) {
  let identities = 0;
  const writes = [];
  const presents = {
    cur_date: input().date, cur_group: 10, cur_lenta: 0, cur_schedule: 50,
    students: [{ id_stud: 101, id_vizit: 8, was: 1, prize: 1 }, { id_stud: 102, id_vizit: 9, was: 2, prize: 3 }],
    ...options.presents,
  };
  return { writes, presents, deps: {
    identity: async () => ({ id: ++identities >= (options.changeAt || Infinity) ? '2' : '1' }),
    request: async (path, data) => {
      if (path === '/presents/get-presents') {
        assert.deepEqual(data, { date: input().date, group: '10', lenta: '0' });
        return structuredClone(presents);
      }
      assert.equal(path, '/presents/set-prize');
      writes.push({ path, data });
      if (options.timeout) throw new Error('Timeout');
      if (options.rejectedTransport) throw Object.assign(new Error('Limit'), { code: 'REWARD_REJECTED' });
      if (options.reject) return { error: '<b>Лимит топкойнов</b>' };
      if (!options.noSave) presents.students[0].prize = data.prizes[0].reward === 4 ? (options.removedValue === undefined ? 0 : options.removedValue) : data.prizes[0].reward;
      return { success: true, total: 10 };
    },
  } };
}

test('reward command accepts original levels/removal and rejects arbitrary values or metadata', () => {
  for (const reward of [1, 2, 3, 4]) validateMessage({ action: 'set-lesson-reward', input: { ...input(), reward } });
  for (const patch of [{ reward: 0 }, { reward: 5 }, { reward: 1.5 }, { reward: '2' }, { previousReward: '4' }, { previousReward: 1 }, { previousReward: undefined }, { visit: null }, { stud: '../1' }, { schedule: '0' }, { lenta: '-1' }, { date: '2026-02-30' }, { url: '/other' }]) assert.throws(() => validateMessage({ action: 'set-lesson-reward', input: { ...input(), ...patch } }));
});

test('reward saves only the selected current visit and confirms the selected level', async () => {
  for (const was of [1, 2]) for (const reward of [1, 2, 3]) {
    const f = fixture(); f.presents.students[0].was = was;
    const result = await saveLessonReward({ ...input(), reward }, f.deps);
    assert.equal(result.presents.students[0].prize, reward);
    assert.equal(result.presents.students[1].prize, 3);
    assert.deepEqual(f.writes, [{ path: '/presents/set-prize', data: { prizes: { 0: { id: 8, reward } } } }]);
  }
});

test('removal sends original sentinel 4 and confirms an absent reward, not an invented level', async () => {
  for (const removedValue of [0, null, 4]) {
    const f = fixture({ removedValue });
    const result = await saveLessonReward({ ...input(), reward: 4 }, f.deps);
    assert.equal(result.presents.students[0].prize, removedValue);
    assert.equal(f.writes[0].data.prizes[0].reward, 4);
  }
});

test('reward preflight rejects stale account/lesson/student/visit/prize and ineligible attendance before writing', async () => {
  for (const [options, patch, code] of [
    [{ changeAt: 1 }, {}, 'ACCOUNT_CHANGED'], [{ changeAt: 2 }, {}, 'ACCOUNT_CHANGED'],
    [{ presents: { cur_schedule: 51 } }, {}, 'LESSON_CHANGED'],
    [{}, { stud: '102', visit: '9' }, 'REWARD_CONFLICT'], [{}, { visit: '9' }, 'REWARD_CONFLICT'], [{}, { previousReward: null }, 'REWARD_CONFLICT'],
    [{ presents: { students: [{ id_stud: 101, id_vizit: 8, was: 0, prize: 1 }] } }, {}, 'REWARD_UNAVAILABLE'],
    [{ presents: { students: [{ id_stud: 101, id_vizit: 8, was: 1, prize: 0 }] } }, { reward: 4, previousReward: null }, 'REWARD_UNAVAILABLE'],
  ]) {
    const f = fixture(options);
    await assert.rejects(saveLessonReward({ ...input(), ...patch }, f.deps), { code });
    assert.equal(f.writes.length, 0);
  }
});

test('reward rejection or uncertain outcome never retries or falsely confirms', async () => {
  for (const [options, code] of [[{ reject: true }, 'REWARD_REJECTED'], [{ rejectedTransport: true }, 'REWARD_REJECTED'], [{ timeout: true }, 'REWARD_UNCONFIRMED'], [{ noSave: true }, 'REWARD_UNCONFIRMED'], [{ changeAt: 3 }, 'ACCOUNT_CHANGED']]) {
    const f = fixture(options);
    await assert.rejects(saveLessonReward(input(), f.deps), { code });
    assert.equal(f.writes.length, 1);
  }
});

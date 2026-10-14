import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [resolve('src/features/lesson/lesson-reward.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { rewardValue, rewardLevel, rewardMatches } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`,
);

test('reward display normalizes original absence/removal representations but does not accept an unknown positive level', () => {
  for (const value of [null, undefined, '', 0, '0', 4, '4']) {
    assert.equal(rewardValue(value), null);
    assert.equal(rewardLevel(value), 0);
    assert.equal(rewardMatches(value, 4), true);
    assert.equal(rewardMatches(value, 1), false);
  }
  for (const value of [1, '1', 2, '2', 3, '3']) {
    assert.equal(rewardLevel(value), Number(value));
    assert.equal(rewardMatches(value, Number(value)), true);
    assert.equal(rewardMatches(value, 4), false);
  }
  for (const value of [false, true, 5, -1, 'unknown', 1.5]) {
    assert.equal(rewardLevel(value), null, 'unknown server values need a disabled control, not a guessed award');
    assert.equal(rewardMatches(value, 4), false);
  }
});

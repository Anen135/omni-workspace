import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller, nextPollDelay, POLL_BASE_MS, POLL_MAX_MS } from '../src/app/extension/poller.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
// Runs the poller with mocked timers; each queued outcome answers one check, then 'local' forever.
async function run(outcomes, body) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const times = [];
  let now = 0;
  const queue = [...outcomes];
  const poller = createPoller(async () => { times.push(now); return queue.shift() ?? 'local'; });
  try { await body({ poller, times, advance: async ms => { now += ms; mock.timers.tick(ms); await flush(); } }); }
  finally { poller.stop(); mock.timers.reset(); }
}

test('delay doubles only after requests which found nothing, capped at the maximum', () => {
  let delay = POLL_BASE_MS; const seen = [];
  for (let i = 0; i < 7; i++) { delay = nextPollDelay(delay, 'retry'); seen.push(delay); }
  assert.deepEqual(seen, [3000, 6000, 12000, 24000, 30000, 30000, 30000]);
  assert.equal(POLL_MAX_MS, 30000);
});

test('local checks, BUSY and a mounted workspace keep the base interval', () => {
  for (const outcome of ['local', 'busy', 'mounted']) {
    assert.equal(nextPollDelay(POLL_MAX_MS, outcome), POLL_BASE_MS, outcome);
    assert.equal(nextPollDelay(POLL_BASE_MS, outcome), POLL_BASE_MS, outcome);
  }
});

test('repeated failed requests back off instead of hitting Omni every 1.5 s', async () => {
  await run(['retry', 'retry', 'retry', 'retry'], async ({ poller, times, advance }) => {
    poller.start(); await flush();
    assert.deepEqual(times, [0]);
    await advance(3000); assert.equal(times.length, 2, 'second request after 3 s');
    await advance(6000); assert.equal(times.length, 3, 'third request after another 6 s');
    await advance(12000); assert.equal(times.length, 4, 'fourth request after another 12 s');
    await advance(23999); assert.equal(times.length, 4, 'nothing is sent early');
    await advance(1); assert.equal(times.length, 5, 'next request after 24 s');
  });
});

test('local checks never slow the workspace down after a native login', async () => {
  await run(['local', 'local', 'mounted'], async ({ poller, times, advance }) => {
    poller.start(); await flush();
    await advance(1500); await advance(1500);
    assert.deepEqual(times, [0, 1500, 3000]);
    await advance(1500); assert.equal(times.length, 4, 'still polling every 1.5 s after mounting');
  });
});

test('nudge drops the backoff and checks immediately, without double scheduling', async () => {
  await run(['retry', 'retry', 'retry', 'local', 'local'], async ({ poller, times, advance }) => {
    poller.start(); await flush();
    await advance(3000); await advance(6000);
    assert.equal(poller.delay, 12000);
    poller.nudge(); await flush();
    assert.equal(times.length, 4, 'immediate check on nudge');
    assert.equal(poller.delay, POLL_BASE_MS);
    await advance(1500); assert.equal(times.length, 5);
    await advance(1500); assert.equal(times.length, 6, 'exactly one timer chain is running');
  });
});

test('a failing check backs off, and stop() ends the schedule', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const poller = createPoller(async () => { calls++; throw new Error('boom'); });
  try {
    poller.start(); await flush();
    assert.equal(poller.delay, 3000);
    poller.stop(); mock.timers.tick(60000); await flush();
    assert.equal(calls, 1);
  } finally { poller.stop(); mock.timers.reset(); }
});

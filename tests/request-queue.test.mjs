import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestQueue } from '../src/services/request-queue.ts';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('active background settles, foreground precedes queued background, no overlap', async () => {
  const queue = createRequestQueue(); const order = []; const hold = deferred();
  const first = queue.enqueue(async () => { order.push('active'); await hold.promise; order.push('settled'); }, { priority: 'background' });
  await tick();
  const background = queue.enqueue(async () => { order.push('background'); }, { priority: 'background' });
  const foreground = queue.enqueue(async () => { order.push('foreground'); });
  await tick(); assert.deepEqual(order, ['active']); hold.resolve();
  await Promise.all([first, background, foreground]); assert.deepEqual(order, ['active', 'settled', 'foreground', 'background']);
});
test('queued abort prevents dispatch; aborting active read does not release slot early', async () => {
  const queue = createRequestQueue(); const hold = deferred(); const activeSignal = new AbortController(); let dispatched = 0;
  const first = queue.enqueue(() => hold.promise, { signal: activeSignal.signal }); await tick();
  const cancel = new AbortController(); const aborted = queue.enqueue(async () => { dispatched++; }, { signal: cancel.signal });
  const rejected = assert.rejects(aborted, { name: 'AbortError' }); cancel.abort(); await rejected;
  activeSignal.abort(); const last = queue.enqueue(async () => { dispatched++; });
  await tick(); assert.equal(dispatched, 0); hold.resolve(); await first; await last; assert.equal(dispatched, 1);
});
test('session invalidation cancels queued writes, started write dispatches once and later jobs proceed', async () => {
  const queue = createRequestQueue(); const hold = deferred(); let writes = 0;
  const active = queue.enqueue(async () => { writes++; await hold.promise; }); await tick();
  const stale = queue.enqueue(async () => { writes++; }); const rejected = assert.rejects(stale, /changed/);
  queue.invalidate(new Error('session changed')); await rejected;
  const fresh = queue.enqueue(async () => 'new'); hold.resolve(); await active; assert.equal(await fresh, 'new'); assert.equal(writes, 1);
});
test('failed write is never retried and releases next queued job', async () => {
  const queue = createRequestQueue(); let writes = 0;
  const failed = queue.enqueue(async () => { writes++; throw new Error('lost response'); });
  const next = queue.enqueue(async () => 42); await assert.rejects(failed, /lost/); assert.equal(await next, 42); assert.equal(writes, 1);
});

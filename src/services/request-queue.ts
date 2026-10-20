export type RequestOptions = { priority?: 'foreground' | 'background'; signal?: AbortSignal };
type Job = { priority: 'foreground' | 'background'; start: () => Promise<void>; cancel: (reason: unknown) => void; detach: () => void };

// Serializes only this UI's transport. Started requests always settle before the
// next starts; neither cancellation nor invalidation can retry/preempt a write.
export function createRequestQueue() {
  const jobs: Job[] = [];
  let active = false;
  const schedule = () => queueMicrotask(() => { void pump(); });
  async function pump() {
    if (active || !jobs.length) return;
    const foreground = jobs.findIndex(job => job.priority === 'foreground');
    const job = jobs.splice(foreground < 0 ? 0 : foreground, 1)[0];
    active = true;
    job.detach();
    try { await job.start(); } finally { active = false; schedule(); }
  }
  return {
    enqueue<T>(run: () => Promise<T>, options: RequestOptions = {}): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (options.signal?.aborted) { reject(new DOMException('Запрос отменён.', 'AbortError')); return; }
        const cancel = () => {
          const index = jobs.indexOf(job);
          if (index < 0) return;
          jobs.splice(index, 1); job.detach(); reject(new DOMException('Запрос отменён.', 'AbortError'));
        };
        const job: Job = {
          priority: options.priority ?? 'foreground',
          start: async () => { try { resolve(await run()); } catch (error) { reject(error); } },
          cancel: reason => { job.detach(); reject(reason); },
          detach: () => options.signal?.removeEventListener('abort', cancel),
        };
        jobs.push(job);
        options.signal?.addEventListener('abort', cancel, { once: true });
        schedule();
      });
    },
    invalidate(reason: unknown) {
      // Only queued jobs are invalidated; this includes queued writes which
      // belong to the old session. Newly enqueued jobs use the new context.
      for (const job of jobs.splice(0)) job.cancel(reason);
    },
  };
}

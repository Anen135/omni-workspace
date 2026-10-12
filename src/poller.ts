// Retry scheduler for the extension's "should the workspace be mounted yet?" check.
//
// Only a check which actually sent a request to Omni and still found nothing to mount counts as a
// failure and backs off. Purely local checks (native login page, workspace already mounted, hidden
// tab, the extension being busy with another command) stay at the base interval: they send nothing,
// and the base interval is what makes the workspace appear promptly after a native login.

export const POLL_BASE_MS = 1500;
export const POLL_MAX_MS = 30000;
export type PollOutcome = 'local' | 'mounted' | 'busy' | 'retry';

export function nextPollDelay(current: number, outcome: PollOutcome): number {
  return outcome === 'retry' ? Math.min(Math.max(current, POLL_BASE_MS) * 2, POLL_MAX_MS) : POLL_BASE_MS;
}

export function createPoller(check: () => Promise<PollOutcome>) {
  let delay = POLL_BASE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;
  function schedule() {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { void tick(); }, delay);
  }
  async function tick() {
    if (running || stopped) return;
    running = true;
    try { delay = nextPollDelay(delay, await check()); }
    catch { delay = nextPollDelay(delay, 'retry'); }
    finally { running = false; schedule(); }
  }
  return {
    /** Run a check immediately. */
    start() { void tick(); },
    /** Something changed (tab shown, focus, page restored): drop any backoff and check now. */
    nudge() { if (stopped) return; delay = POLL_BASE_MS; clearTimeout(timer); void tick(); },
    stop() { stopped = true; clearTimeout(timer); },
    get delay() { return delay; },
  };
}

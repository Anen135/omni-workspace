export const connectionIntervalKey = 'omni.connection-check-seconds';
export const connectionIntervals = [15, 30, 60, 120, 300] as const;

export function readConnectionInterval(): number {
  try {
    const value = Number(localStorage.getItem(connectionIntervalKey));
    return connectionIntervals.some(interval => interval === value) ? value : 60;
  } catch { return 60; }
}

export function saveConnectionInterval(value: number) { localStorage.setItem(connectionIntervalKey, String(value)); }

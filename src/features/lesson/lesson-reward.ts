export type LessonReward = 1 | 2 | 3 | 4;
// Original reward levels 1–3 are cumulative; 4 is REMOVE_REWARD.
// Omni represents no reward with an empty value, zero or that removal sentinel.
export function rewardValue(value: unknown): string | null {
  return value === undefined || value === null || value === '' || value === 0 || value === '0' || value === 4 || value === '4' ? null : String(value);
}
export function rewardMatches(value: unknown, reward: number): boolean {
  return reward === 4 ? rewardValue(value) === null : rewardValue(value) === String(reward);
}
export function rewardLevel(value: unknown): 0 | 1 | 2 | 3 | null {
  const normalized = rewardValue(value);
  return normalized === null ? 0 : normalized === '1' ? 1 : normalized === '2' ? 2 : normalized === '3' ? 3 : null;
}

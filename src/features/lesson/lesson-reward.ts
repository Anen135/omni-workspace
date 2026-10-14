export type LessonReward = 1 | 2 | 3 | 4;
export const LESSON_REWARD_LIMIT = 5;
type RewardStudent = Record<string, unknown>;
type RewardDraft = Record<string, { reward: LessonReward }>;
const rewardStudentId = (student: RewardStudent) => /^[1-9]\d{0,11}$/.test(String(student.id_stud)) ? String(student.id_stud) : '';
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
// A draft replaces a student's saved reward; it is not another allocation.
export function lessonRewardBudget(students: RewardStudent[], rewards: RewardDraft = {}) {
  const ids = students.map(rewardStudentId);
  let knownUsed = 0;
  let unknown = false;
  for (const student of students) {
    const id = rewardStudentId(student);
    const saved = rewardLevel(student.prize);
    const value = rewardLevel(rewards[id]?.reward ?? student.prize);
    if (!id || ids.filter(candidate => candidate === id).length !== 1 || saved === null || value === null) unknown = true;
    else knownUsed += value;
  }
  if (Object.keys(rewards).some(id => !ids.includes(id))) unknown = true;
  return { used: unknown ? null : knownUsed, remaining: unknown ? null : Math.max(0, LESSON_REWARD_LIMIT - knownUsed) };
}
export function rewardMaximum(value: unknown, remaining: number | null): number {
  const level = rewardLevel(value);
  return level === null ? 0 : Math.min(3, level + (remaining ?? 0));
}
// Existing excess/unknown rewards may be reduced, never increased until the
// complete roster proves the new allocation stays within this local limit.
export function lessonRewardDraftAllowed(students: RewardStudent[], rewards: RewardDraft = {}): boolean {
  let increases = false;
  for (const [id, change] of Object.entries(rewards)) {
    const matches = students.filter(student => rewardStudentId(student) === id);
    if (matches.length !== 1 || rewardLevel(matches[0].prize) === null) return false;
    const before = rewardLevel(matches[0].prize)!;
    const after = rewardLevel(change.reward);
    if (after === null) return false;
    if (after > before) increases = true;
  }
  if (!increases) return true;
  const budget = lessonRewardBudget(students, rewards);
  return budget.used !== null && budget.used <= LESSON_REWARD_LIMIT;
}

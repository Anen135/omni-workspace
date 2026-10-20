import { attendanceStatus } from './attendance';
import { lessonRewardBudget, LESSON_REWARD_LIMIT, rewardLevel } from './lesson-reward';
import { studentId, studentRow } from '../students/students';

export type RewardAllocationMode = 'mark4' | 'mark2' | 'average' | 'both';
export type RewardCoins = 0 | 1 | 2 | 3;
export type RewardAllocationTarget = { id: string; coins: RewardCoins };
export type RewardAllocationInput = {
  items: Record<string, unknown>[];
  studentAverages?: ReadonlyMap<string, string>;
  draftRewardIds?: ReadonlySet<string>;
  mode?: RewardAllocationMode;
  minimum?: number;
  replace?: boolean;
};
export type RewardAllocationRow = {
  id: string; name: string; score: number | null; current: RewardCoins | null;
  proposed: RewardCoins | null; reason: string; eligible: boolean;
};
export type RewardAllocationProposal = {
  rows: RewardAllocationRow[]; targets: readonly RewardAllocationTarget[];
  blockedReason: string; reserved: number; available: number; allocated: number; unallocated: number;
};

// Explicit decimal parsing prevents empty values, booleans and zero from becoming scores.
export function allocationScore(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
  const score = Number(text);
  return Number.isFinite(score) && score >= 1 && score <= 12 ? score : null;
}

function scoreFor(student: Record<string, unknown>, input: RewardAllocationInput): number | null {
  const mode = input.mode ?? 'mark4';
  if (mode === 'mark4' || mode === 'mark2') return allocationScore(student[mode]);
  const average = allocationScore(input.studentAverages?.get(studentId(student)) ?? studentRow(student).values.average);
  if (mode === 'average') return average;
  const mark = allocationScore(student.mark4);
  return average === null || mark === null ? null : (average + mark) / 2;
}

type Group = { score: number; cap: number; rows: RewardAllocationRow[]; quota: number };
type Choice = { spent: number; distance: number; levels: number[] };

// The capped proportional shares are a preference. Integer awards must also keep
// equal scores equal and never reward a lower-scoring candidate more.
function chooseLevels(groups: Group[], available: number, minimum: number): number[] {
  const target = Math.min(available, groups.reduce((sum, group) => sum + group.cap * group.rows.length, 0));
  let remaining = target;
  let active = [...groups];
  while (active.length) {
    const weight = active.reduce((sum, group) => sum + (group.score - minimum + 1) ** 2 * group.rows.length, 0);
    const capped = active.filter(group => remaining * (group.score - minimum + 1) ** 2 / weight >= group.cap);
    if (!capped.length) {
      for (const group of active) group.quota = remaining * (group.score - minimum + 1) ** 2 / weight;
      break;
    }
    for (const group of capped) { group.quota = group.cap; remaining -= group.cap * group.rows.length; }
    active = active.filter(group => !capped.includes(group));
  }
  const memo = new Map<string, Choice>();
  function solve(index: number, budget: number, previous: number): Choice {
    if (index === groups.length) return { spent: 0, distance: 0, levels: [] };
    const key = `${index}:${budget}:${previous}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const group = groups[index];
    let best: Choice | undefined;
    // Descending choices make equal-objective solutions favor higher scores.
    for (let level = Math.min(previous, group.cap, Math.floor(budget / group.rows.length)); level >= 0; level--) {
      const spent = level * group.rows.length;
      const tail = solve(index + 1, budget - spent, level);
      const choice = { spent: spent + tail.spent, distance: (level - group.quota) ** 2 * group.rows.length + tail.distance, levels: [level, ...tail.levels] };
      if (!best || choice.spent > best.spent || (choice.spent === best.spent && choice.distance < best.distance - 1e-9)) best = choice;
    }
    memo.set(key, best!);
    return best!;
  }
  return solve(0, available, 3).levels;
}

export function createRewardAllocation(input: RewardAllocationInput): RewardAllocationProposal {
  const minimum = input.minimum ?? 7;
  const rows: RewardAllocationRow[] = input.items.map(student => ({
    id: studentId(student), name: studentRow(student).values.name || 'Имя не получено', score: scoreFor(student, input),
    current: rewardLevel(student.prize), proposed: rewardLevel(student.prize), reason: '', eligible: false,
  }));
  const proposal: RewardAllocationProposal = { rows, targets: [], blockedReason: '', reserved: 0, available: 0, allocated: 0, unallocated: 0 };
  const block = (reason: string) => { proposal.blockedReason = reason; return proposal; };
  const budget = lessonRewardBudget(input.items);
  if (budget.used === null) return block('Неизвестные топкойны или неполные/повторяющиеся ID учеников. Обновите полный список урока.');
  if ([...(input.draftRewardIds ?? [])].some(id => !rows.some(row => row.id === id))) return block('В черновике есть ученик вне текущего списка. Обновите урок.');
  if (!Number.isFinite(minimum) || minimum < 1 || minimum > 12) return block('Минимальный балл должен быть от 1 до 12.');
  if (input.mode !== undefined && !['mark4', 'mark2', 'average', 'both'].includes(input.mode)) return block('Выберите источник балла.');
  if (!rows.length) return block('В уроке нет учеников.');

  const groups: Group[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const was = attendanceStatus(input.items[index].was);
    const present = was === 1 || was === 2;
    const preserved = !input.replace && (row.current !== 0 || input.draftRewardIds?.has(row.id));
    if (preserved || !present || row.score === null) {
      proposal.reserved += row.current!;
      row.reason = preserved ? 'Сохранено: существующая награда или ручной черновик.' : !present ? 'Нет присутствия: награда сохранена.' : 'Нет корректного балла 1–12: награда сохранена.';
      continue;
    }
    row.eligible = true;
    row.proposed = 0;
    if (row.score < minimum) { row.reason = 'Балл ниже выбранного минимума.'; continue; }
    const cap = row.score >= 11 ? 3 : row.score >= 9 ? 2 : 1;
    let group = groups.find(candidate => candidate.score === row.score);
    if (!group) { group = { score: row.score, cap, rows: [], quota: 0 }; groups.push(group); }
    group.rows.push(row);
  }
  if (proposal.reserved > LESSON_REWARD_LIMIT) return block('Сохранённые награды превышают 5 топкойнов. Сначала исправьте их вручную.');
  proposal.available = LESSON_REWARD_LIMIT - proposal.reserved;
  groups.sort((a, b) => b.score - a.score);
  const levels = chooseLevels(groups, proposal.available, minimum);
  groups.forEach((group, index) => {
    const level = levels[index] as RewardCoins;
    for (const row of group.rows) {
      row.proposed = level;
      row.reason = level ? `По баллу; максимум ${group.cap}.` : group.rows.length > proposal.available ? 'Не хватает топкойнов на равную награду всей группе с этим баллом.' : 'Не хватает топкойнов с учётом равенства баллов и приоритета высоких баллов.';
    }
    proposal.allocated += level * group.rows.length;
  });
  proposal.unallocated = proposal.available - proposal.allocated;
  proposal.targets = rows.filter(row => row.eligible && row.proposed !== row.current).map(row => ({ id: row.id, coins: row.proposed! }));
  return proposal;
}

// Calculated during render and checked again by Apply. A changed context, draft,
// effective attendance/mark/reward or average cannot reuse an earlier preview.
export function rewardAllocationFingerprint(input: RewardAllocationInput, contextToken: string): string {
  return JSON.stringify([
    contextToken, input.mode ?? 'mark4', input.minimum ?? 7, !!input.replace,
    input.items, [...(input.studentAverages ?? [])].sort(([a], [b]) => a.localeCompare(b)), [...(input.draftRewardIds ?? [])].sort(),
  ]);
}

import { attendanceStatus, attendanceVisit, attendanceLessonInfo, type AttendanceChange, type AttendanceStatus } from './attendance';
import type { ThemeChoice } from './LessonThemeEditor';
import { rewardMatches, rewardValue, type LessonReward } from './lesson-reward';

export type MarkChange = { stud: string; type: 2 | 4; mark: number; previousMark: string | null; visit: string | null };
export type RewardChange = { stud: string; reward: LessonReward; previousReward: string | null; visit: string | null };
export type LessonDraft = { attendance: Record<string, AttendanceChange>; marks: Record<string, MarkChange>; rewards?: Record<string, RewardChange>; theme?: ThemeChoice; needsReload?: boolean };
export const emptyLessonDraft = (): LessonDraft => ({ attendance: {}, marks: {}, rewards: {} });
export const markValue = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : String(value);
export function stageAttendanceChange(draft: LessonDraft, student: Record<string, unknown>, was: AttendanceStatus): LessonDraft {
  const stud = String(student.id_stud);
  const existing = draft.attendance[stud];
  const previousWas = existing ? existing.previousWas : attendanceStatus(student.was);
  const attendance = { ...draft.attendance };
  if (was === previousWas) delete attendance[stud];
  else attendance[stud] = { stud, was, previousWas, visit: existing ? existing.visit : attendanceVisit(student.id_vizit) };
  return { ...draft, attendance };
}
export function stageMarkChange(draft: LessonDraft, student: Record<string, unknown>, type: 2 | 4, mark: number): LessonDraft {
  const stud = String(student.id_stud);
  const key = `${stud}:${type}`;
  const existing = draft.marks[key];
  const previousMark = existing ? existing.previousMark : markValue(student[`mark${type}`]);
  const marks = { ...draft.marks };
  if (String(mark) === previousMark) delete marks[key];
  else marks[key] = { stud, type, mark, previousMark, visit: existing ? existing.visit : attendanceVisit(student.id_vizit) };
  return { ...draft, marks };
}
export function stageRewardChange(draft: LessonDraft, student: Record<string, unknown>, reward: LessonReward): LessonDraft {
  const stud = String(student.id_stud);
  const existing = draft.rewards?.[stud];
  const previousReward = existing ? existing.previousReward : rewardValue(student.prize);
  const rewards = { ...draft.rewards };
  if (rewardMatches(previousReward, reward)) delete rewards[stud];
  else rewards[stud] = { stud, reward, previousReward, visit: existing ? existing.visit : attendanceVisit(student.id_vizit) };
  return { ...draft, rewards };
}
export function hasLessonChanges(draft: LessonDraft) {
  return !!draft.theme || Object.keys(draft.attendance).length > 0 || Object.keys(draft.marks).length > 0 || Object.keys(draft.rewards || {}).length > 0;
}
// A reread can confirm an uncertain write, but never replaces the original
// expected values: conflicts must not silently become permission to overwrite.
export function reconcileLessonDraft(draft: LessonDraft, presents: Record<string, unknown>): LessonDraft {
  const students = presents.students && typeof presents.students === 'object' ? Object.values(presents.students).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : [];
  const next = { ...draft, attendance: { ...draft.attendance }, marks: { ...draft.marks }, rewards: { ...draft.rewards }, needsReload: false };
  for (const [key, change] of Object.entries(next.attendance)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length === 1 && attendanceStatus(matches[0].was) === change.was) delete next.attendance[key];
  }
  for (const [key, change] of Object.entries(next.marks)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length === 1 && markValue(matches[0][`mark${change.type}`]) === String(change.mark)) delete next.marks[key];
  }
  for (const [key, change] of Object.entries(next.rewards)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length === 1 && rewardMatches(matches[0].prize, change.reward)) delete next.rewards[key];
  }
  // Theme includes material issuance choices, which cannot be inferred from a
  // title alone. Keep it until an explicit successful theme response.
  return next;
}
export function lessonDraftConflict(draft: LessonDraft, presents: Record<string, unknown>): string {
  const students = presents.students && typeof presents.students === 'object' ? Object.values(presents.students).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : [];
  if (draft.theme && String(attendanceLessonInfo(presents)?.theme || '') !== draft.theme.previousTheme) return 'Тема уже изменилась в Omni. Проверьте урок и отмените устаревший черновик.';
  for (const change of Object.values(draft.attendance)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length !== 1 || attendanceStatus(matches[0].was) !== change.previousWas || attendanceVisit(matches[0].id_vizit) !== change.visit) return 'Посещаемость или запись ученика изменилась в Omni. Проверьте урок и отмените устаревший черновик.';
  }
  for (const change of Object.values(draft.marks)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length !== 1 || markValue(matches[0][`mark${change.type}`]) !== change.previousMark || attendanceVisit(matches[0].id_vizit) !== change.visit) return 'Оценка или запись ученика изменилась в Omni. Проверьте урок и отмените устаревший черновик.';
  }
  for (const change of Object.values(draft.rewards || {})) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length !== 1 || rewardValue(matches[0].prize) !== change.previousReward || attendanceVisit(matches[0].id_vizit) !== change.visit) return 'Топкойны или запись ученика изменились в Omni. Проверьте урок и отмените устаревший черновик.';
    const was = draft.attendance[change.stud]?.was ?? attendanceStatus(matches[0].was);
    if (was !== 1 && was !== 2) return 'Топкойны доступны только присутствующим и опоздавшим ученикам. Проверьте посещаемость в черновике.';
  }
  return '';
}

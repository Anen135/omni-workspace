import { attendanceStatus, attendanceVisit, attendanceLessonInfo, type AttendanceChange } from './attendance';
import type { ThemeChoice } from './LessonThemeEditor';

export type MarkChange = { stud: string; type: 2 | 4; mark: number; previousMark: string | null; visit: string | null };
export type LessonDraft = { attendance: Record<string, AttendanceChange>; marks: Record<string, MarkChange>; theme?: ThemeChoice; needsReload?: boolean };
export const emptyLessonDraft = (): LessonDraft => ({ attendance: {}, marks: {} });
export const markValue = (value: unknown): string | null => value === null || value === undefined || value === '' ? null : String(value);
export function hasLessonChanges(draft: LessonDraft) {
  return !!draft.theme || Object.keys(draft.attendance).length > 0 || Object.keys(draft.marks).length > 0;
}
// A reread can confirm an uncertain write, but never replaces the original
// expected values: conflicts must not silently become permission to overwrite.
export function reconcileLessonDraft(draft: LessonDraft, presents: Record<string, unknown>): LessonDraft {
  const students = presents.students && typeof presents.students === 'object' ? Object.values(presents.students).filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item)) : [];
  const next = { ...draft, attendance: { ...draft.attendance }, marks: { ...draft.marks }, needsReload: false };
  for (const [key, change] of Object.entries(next.attendance)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length === 1 && attendanceStatus(matches[0].was) === change.was) delete next.attendance[key];
  }
  for (const [key, change] of Object.entries(next.marks)) {
    const matches = students.filter(student => String(student.id_stud) === change.stud);
    if (matches.length === 1 && markValue(matches[0][`mark${change.type}`]) === String(change.mark)) delete next.marks[key];
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
  return '';
}

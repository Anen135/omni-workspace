export type AttendanceStatus = 0 | 1 | 2;
export type AttendanceChange = { stud: string; was: AttendanceStatus; previousWas: AttendanceStatus | null; visit: string | null };
export const attendanceLabels = { 0: 'Отсутствует', 1: 'Присутствует', 2: 'Опоздал(а)' };
export function attendanceStatus(value: unknown): AttendanceStatus | null {
  return value === 0 || value === '0' ? 0 : value === 1 || value === '1' ? 1 : value === 2 || value === '2' ? 2 : null;
}
export function attendanceVisit(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}
export function attendanceStudents(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row));
}
// Omni's presentsCtrl chooses the last student with a visit as lesson metadata.
export function attendanceLessonInfo(presents: Record<string, unknown>) {
  const students = attendanceStudents(presents.students);
  return students.filter(row => Number(row.id_vizit) > 0).at(-1) || students[0];
}
export function attendanceHasTheme(presents: Record<string, unknown>): boolean {
  const theme = attendanceLessonInfo(presents)?.theme;
  return typeof theme === 'string' && theme.trim().length > 0;
}
export function attendanceDraftKey(account: string, branch: string, presents: Record<string, unknown>): string {
  return JSON.stringify([account, branch, presents.cur_date, String(presents.cur_group), String(presents.cur_lenta), String(presents.cur_schedule)]);
}
export function attendanceUnavailable(presents: Record<string, unknown>): string {
  if (!/^[1-9]\d{0,11}$/.test(String(presents.cur_schedule)) || !/^[1-9]\d{0,11}$/.test(String(presents.cur_group)) || !/^\d{1,12}$/.test(String(presents.cur_lenta)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(presents.cur_date))) return 'Выберите доступное занятие в Omni и загрузите урок.';
  const info = attendanceLessonInfo(presents);
  if (!info) return 'На занятии нет доступных учеников.';
  return '';
}

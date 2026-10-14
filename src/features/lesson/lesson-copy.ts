import { attendanceStatus } from './attendance';
import { markValue, stageAttendanceChange, stageMarkChange, stageRewardChange, type LessonDraft } from './lesson-draft';
import { rewardLevel } from './lesson-reward';

type Student = Record<string, unknown>;
export type CopySelection = { attendance: boolean; marks: boolean; rewards?: boolean; overwrite?: boolean };
export type PreviousLessonData = { students: Student[]; description: string; date: string; slot: string; dayLessons: { slot: string; title: string; time: string }[] };
export type CopySource = { date: string; slot?: string };
const studentId = (student: Student) => /^[1-9]\d{0,11}$/.test(String(student.id_stud)) ? String(student.id_stud) : '';

// Collection positions and old visit IDs do not identify the current student.
// Only unambiguous student IDs present in both rosters can be transferred.
export function matchingLessonStudents(target: Student[], source: Student[]): { target: Student; source: Student }[] {
  return target.flatMap(student => {
    const id = studentId(student);
    if (!id || target.filter(item => studentId(item) === id).length !== 1) return [];
    const matches = source.filter(item => studentId(item) === id);
    return matches.length === 1 ? [{ target: student, source: matches[0] }] : [];
  });
}
export function transferableMark(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const mark = Number(value);
  return Number.isInteger(mark) && mark >= 1 && mark <= 100 ? mark : null;
}
export function copyLessonDraft(draft: LessonDraft, target: Student[], source: Student[], selection: CopySelection): LessonDraft {
  let next = draft;
  for (const match of matchingLessonStudents(target, source)) {
    const was = attendanceStatus(match.source.was);
    const stud = String(match.target.id_stud);
    const currentWas = next.attendance[stud]?.was ?? attendanceStatus(match.target.was);
    if (selection.attendance && was !== null && (selection.overwrite || currentWas === null)) next = stageAttendanceChange(next, match.target, was);
    if (selection.marks) for (const type of [2, 4] as const) {
      const mark = transferableMark(match.source[`mark${type}`]);
      const currentMark = next.marks[`${stud}:${type}`]?.mark ?? markValue(match.target[`mark${type}`]);
      if (mark !== null && (selection.overwrite || currentMark === null)) next = stageMarkChange(next, match.target, type, mark);
    }
    if (selection.rewards) {
      const reward = rewardLevel(match.source.prize);
      const currentReward = rewardLevel(next.rewards?.[stud]?.reward ?? match.target.prize);
      const finalWas = next.attendance[stud]?.was ?? attendanceStatus(match.target.was);
      if (reward && currentReward !== null && (selection.overwrite || (currentReward === 0 && !next.rewards?.[stud])) && (finalWas === 1 || finalWas === 2)) next = stageRewardChange(next, match.target, reward);
    }
  }
  return next;
}

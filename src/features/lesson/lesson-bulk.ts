import { attendanceStatus, type AttendanceStatus } from './attendance';
import { emptyLessonDraft, stageAttendanceChange, stageMarkChange, stageRewardChange, type LessonDraft } from './lesson-draft';
import { lessonRewardDraftAllowed, rewardLevel, type LessonReward } from './lesson-reward';

export type LessonBulkChange =
  | { column: 'attendance'; value: AttendanceStatus }
  | { column: 'mark2' | 'mark4'; value: number }
  | { column: 'reward'; value: LessonReward };
export type RewardTarget = { id: string; coins: 0 | 1 | 2 | 3 };
type Row = Record<string, unknown>;
const idOf = (row: Row) => typeof row.id_stud === 'string' || typeof row.id_stud === 'number' ? String(row.id_stud) : '';

function resolveTargets(students: readonly Row[], ids: readonly string[]) {
  if (!ids.length || new Set(ids).size !== ids.length) throw new Error('Выберите уникальные строки учеников.');
  return ids.map(id => {
    const matches = students.filter(student => idOf(student) === id);
    if (!/^[1-9]\d{0,11}$/.test(id) || matches.length !== 1) throw new Error('Состав учеников изменился или содержит повторяющиеся ID. Загрузите урок.');
    return matches[0];
  });
}

// Build one complete candidate; callers publish it only after every check passes.
export function stageLessonBulk(students: readonly Row[], draft: LessonDraft, ids: readonly string[], change: LessonBulkChange): LessonDraft {
  if (draft.needsReload) throw new Error('Перед массовой правкой загрузите урок заново.');
  const targets = resolveTargets(students, ids);
  if (change.column === 'attendance') {
    if (![0, 1, 2].includes(change.value)) throw new Error('Недопустимый статус присутствия.');
    return targets.reduce<LessonDraft>((next, student) => stageAttendanceChange(next, student, change.value), draft);
  }
  if (change.column === 'mark2' || change.column === 'mark4') {
    if (!Number.isInteger(change.value) || change.value < 1 || change.value > 100) throw new Error('Введите целую оценку от 1 до 100.');
    const type = change.column === 'mark2' ? 2 : 4;
    return targets.reduce<LessonDraft>((next, student) => stageMarkChange(next, student, type, change.value), draft);
  }
  if (change.column !== 'reward') throw new Error('Этот столбец недоступен для массовой правки.');
  if (![1, 2, 3, 4].includes(change.value)) throw new Error('Недопустимое количество топкойнов.');
  return stageLessonRewardTargets(students, draft, targets.map(student => ({ id: idOf(student), coins: (change.value === 4 ? 0 : change.value) as 0 | 1 | 2 | 3 })));
}

export function stageLessonRewardTargets(students: readonly Row[], draft: LessonDraft = emptyLessonDraft(), targets: readonly RewardTarget[]): LessonDraft {
  if (draft.needsReload) throw new Error('Перед распределением загрузите урок заново.');
  const resolved = resolveTargets(students, targets.map(target => target.id));
  let candidate = draft;
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    const student = resolved[index];
    const was = draft.attendance[target.id]?.was ?? attendanceStatus(student.was);
    if (was !== 1 && was !== 2) throw new Error('Топкойны доступны только присутствующим и опоздавшим ученикам.');
    if (rewardLevel(student.prize) === null || !Number.isInteger(target.coins) || target.coins < 0 || target.coins > 3) throw new Error('Проверьте исходные награды и количество топкойнов.');
    candidate = stageRewardChange(candidate, student, target.coins === 0 ? 4 : target.coins);
  }
  if (!lessonRewardDraftAllowed([...students], candidate.rewards)) throw new Error('Лимит урока — 5 топкойнов. Изменения не добавлены в черновик.');
  return candidate;
}

import type { SortableColumn, TableSort } from '../../components/data/table-sort';
import { attendanceStatus } from './attendance';
import { rewardLevel } from './lesson-reward';
import { studentId, studentRow } from '../students/students';

type Row = Record<string, unknown>;
export const defaultLessonSort: readonly TableSort[] = [{ columnId: 'student', direction: 'ascending' }];

export function lessonSortNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
  const number = Number(value.trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

export function lessonSortFields(averages?: ReadonlyMap<string, string>, averageUnavailable = false): (SortableColumn<Row> & { label: string })[] {
  return [
    { id: 'student', label: 'Ученик', kind: 'data', value: row => typeof row.fio_stud === 'string' ? row.fio_stud : null },
    { id: 'attendance', label: 'Присутствие', kind: 'data', value: row => attendanceStatus(row.was) },
    { id: 'mark2', label: 'Контрольная', kind: 'data', value: row => lessonSortNumber(row.mark2) },
    { id: 'mark4', label: 'Работа на уроке', kind: 'data', value: row => lessonSortNumber(row.mark4) },
    { id: 'rewards', label: 'Топкойны', kind: 'data', value: row => rewardLevel(row.prize) },
    { id: 'average', label: 'Средняя оценка', kind: 'data', value: row => averageUnavailable ? null : lessonSortNumber(averages?.get(studentId(row)) ?? studentRow(row).values.average) },
  ];
}

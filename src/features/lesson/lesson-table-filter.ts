import { filterTableRows, type TableFilter } from '../../components/data/table-filter';
import { lessonSortFields, lessonSortNumber } from './lesson-table-sort';
import { attendanceLabels } from './attendance';

type Row = Record<string, unknown>;
export type LessonFilterField = Extract<TableFilter<Row>, { kind: 'text' | 'number' | 'select' }>;
export type LessonFilterCondition = { fieldId: string; operator: string; value: string; to: string };
export type LessonFilterGroups = readonly (readonly LessonFilterCondition[])[];
const presence = [{ id: 'empty', label: 'Пусто' }, { id: 'filled', label: 'Заполнено' }];

export function lessonFilterFields(averages?: ReadonlyMap<string, string>, averageUnavailable = false): LessonFilterField[] {
  return lessonSortFields(averages, averageUnavailable).flatMap<LessonFilterField>(column => {
    if (column.kind !== 'data') return [];
    const common = { id: column.id, label: column.label };
    if (column.id === 'student') return [{ ...common, kind: 'text', value: row => String(column.value(row) ?? '') }];
    if (column.id === 'attendance') return [{ ...common, kind: 'select', value: row => column.value(row) as number | null,
      options: ([0, 1, 2] as const).map(value => ({ value: String(value), label: attendanceLabels[value] })) }];
    return [{ ...common, kind: 'number', value: row => column.value(row) as number | null }];
  });
}

export function lessonFilterOperators(field: LessonFilterField) {
  return [...(field.kind === 'text' ? [{ id: 'contains', label: 'Содержит' }, { id: 'notContains', label: 'Не содержит' }]
    : field.kind === 'select' ? [{ id: 'eq', label: 'Равно' }, { id: 'ne', label: 'Не равно' }]
      : [{ id: 'eq', label: 'Равно' }, { id: 'ne', label: 'Не равно' }, { id: 'gt', label: 'Больше' }, { id: 'gte', label: 'Не меньше' },
        { id: 'lt', label: 'Меньше' }, { id: 'lte', label: 'Не больше' }, { id: 'between', label: 'В диапазоне' }]), ...presence];
}

export function newLessonFilter(field: LessonFilterField): LessonFilterCondition {
  return { fieldId: field.id, operator: lessonFilterOperators(field)[0].id, value: field.kind === 'select' ? field.options?.[0]?.value ?? '' : '', to: '' };
}

export function lessonFilterError(condition: LessonFilterCondition, fields: readonly LessonFilterField[]): string {
  const field = fields.find(field => field.id === condition.fieldId);
  if (!field || !lessonFilterOperators(field).some(operator => operator.id === condition.operator)) return 'Выберите доступное поле и условие.';
  if (condition.operator === 'empty' || condition.operator === 'filled') return '';
  if (field.kind === 'number') {
    const from = condition.value.trim(), to = condition.to.trim();
    if (condition.operator === 'between') {
      if (!from && !to) return 'Введите хотя бы одну границу диапазона.';
      if (from && lessonSortNumber(from) === null || to && lessonSortNumber(to) === null) return 'Введите конечные числа; допустимы точка и запятая.';
      if (from && to && lessonSortNumber(from)! > lessonSortNumber(to)!) return 'Нижняя граница должна быть не больше верхней.';
    } else if (lessonSortNumber(from) === null) return 'Введите конечное число; допустимы точка и запятая.';
  } else if (field.kind === 'select') {
    if (!field.options?.some(option => option.value === condition.value)) return 'Выберите значение из списка.';
  } else if (!condition.value.trim()) return 'Введите текст условия.';
  return '';
}

/** OR of AND groups. Invalid conditions fail closed, including in another OR branch. */
export function filterLessonRows(rows: readonly Row[], fields: readonly LessonFilterField[], groups: LessonFilterGroups): Row[] {
  if (!groups.length) return [...rows];
  if (groups.some(group => !group.length || group.some(condition => lessonFilterError(condition, fields)))) return [];
  const matches = groups.map(group => group.map(condition => {
    const field = fields.find(field => field.id === condition.fieldId)!;
    const { operator } = condition;
    const present: TableFilter<Row> = { id: field.id, label: field.label, kind: 'presence', value: field.value };
    if (operator === 'empty' || operator === 'filled') return new Set(filterTableRows(rows, [present], { [field.id]: operator }));
    const filled = filterTableRows(rows, [present], { [field.id]: 'filled' });
    if (field.kind === 'number') {
      const from = lessonSortNumber(condition.value), to = lessonSortNumber(condition.to);
      const low = operator === 'lt' || operator === 'lte' ? '' : from === null ? '' : String(from);
      const high = operator === 'gt' || operator === 'gte' ? '' : operator === 'between' ? to === null ? '' : String(to) : String(from);
      const matching = new Set(filterTableRows(filled, [field], { [field.id]: { from: low, to: high } }));
      return new Set(filled.filter(row => operator === 'ne' ? !matching.has(row)
        : matching.has(row) && (operator !== 'gt' && operator !== 'lt' || field.value(row) !== from)));
    }
    const matching = new Set(filterTableRows(filled, [field], { [field.id]: condition.value }));
    return operator === 'ne' || operator === 'notContains' ? new Set(filled.filter(row => !matching.has(row))) : matching;
  }));
  return rows.filter(row => matches.some(group => group.every(match => match.has(row))));
}

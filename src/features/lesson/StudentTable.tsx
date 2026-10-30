import { AverageGrade } from '../../components/ui/AverageGrade';
import { useEffect, useState } from 'react';
import { attendanceLabels, attendanceStatus, type AttendanceStatus } from './attendance';
import { MarkEditor } from './MarkEditor';
import { RewardEditor } from './RewardEditor';
import { lessonRewardBudget, LESSON_REWARD_LIMIT, rewardMaximum, rewardLevel, type LessonReward } from './lesson-reward';
import { HelpTip } from '../../components/ui/HelpTip';
import { studentId, studentRow } from '../students/students';
import { studentPhotoUrl } from '../students/student-photo';
import { StudentAvatar } from '../../components/ui/StudentAvatar';
import { DataTable, type TableColumn } from '../../components/data/DataTable';
import { TableBulkEditor, type BulkField } from '../../components/data/TableBulkEditor';
import { RewardAllocation } from './RewardAllocation';
import type { LessonBulkChange, RewardTarget } from './lesson-bulk';
import { LessonBulkEditor } from './LessonBulkEditor';
import type { LessonFillRequest } from './lesson-fill';
import { sortTableRowsByCriteria, type TableSort } from '../../components/data/table-sort';
import { defaultLessonSort, lessonSortFields } from './lesson-table-sort';
import { LessonTableSettings } from './LessonTableSettings';
import { filterLessonRows, lessonFilterFields, type LessonFilterGroups } from './lesson-table-filter';
import './reward-allocation.css';

type Row = Record<string, unknown>;
type Props = {
  items: Row[]; busy: boolean; onOpen: (item: Row) => void;
  attendance?: { unavailable: string; saving: boolean; onChange: (item: Row, was: AttendanceStatus) => void; onAll: () => void };
  marks?: { unavailable: string; allowDraft?: boolean; onChange: (item: Row, type: 2 | 4, mark: number) => void };
  rewards?: { unavailable: string; onChange: (item: Row, reward: LessonReward) => void };
  lessonView?: boolean; studentAverages?: ReadonlyMap<string, string>; studentPhotos?: ReadonlyMap<string, string>;
  studentAveragesLoading?: boolean; studentAveragesError?: string;
  selectionContext?: unknown; contextToken?: string; draftRewardIds?: ReadonlySet<string>;
  onBulkChange?: (students: readonly Row[], change: LessonBulkChange) => void;
  onFill?: (request: LessonFillRequest, fingerprint: string) => void;
  onRewardAllocation?: (targets: readonly RewardTarget[], replace: boolean) => void;
};

export function StudentTable({ items, busy, onOpen, attendance, marks, rewards, lessonView = false, studentAverages, studentPhotos,
  studentAveragesLoading = false, studentAveragesError, selectionContext = items, contextToken = '', draftRewardIds, onBulkChange, onFill, onRewardAllocation }: Props) {
  const [query, setQuery] = useState('');
  const [ascending, setAscending] = useState(true);
  const [sorts, setSorts] = useState<readonly TableSort[]>(defaultLessonSort);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filterGroups, setFilterGroups] = useState<LessonFilterGroups>([]);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<{ context: unknown; keys: Set<string> } | null>(null);
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  useEffect(() => { setSorts(defaultLessonSort); setFilterGroups([]); setSettingsOpen(false); setPage(0); }, [contextToken]);
  const sortFields = lessonSortFields(studentAverages, studentAveragesLoading || !!studentAveragesError)
    .filter(field => field.id !== 'rewards' || !!rewards || items.some(item => Object.hasOwn(item, 'prize')));
  const filterFields = lessonFilterFields(studentAverages, studentAveragesLoading || !!studentAveragesError)
    .filter(field => sortFields.some(sortField => sortField.id === field.id));
  const averageFilterUnavailable = filterGroups.some(group => group.some(condition => condition.fieldId === 'average'))
    && (studentAveragesLoading || !!studentAveragesError);
  const matchingFilters = lessonView ? averageFilterUnavailable ? [] : filterLessonRows(items, filterFields, filterGroups) : items;
  const matching = matchingFilters.filter(item => text(item.fio_stud).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  const filtered = lessonView ? sortTableRowsByCriteria(matching, sortFields, sorts)
    : matching.sort((a, b) => text(a.fio_stud).localeCompare(text(b.fio_stud), 'ru') * (ascending ? 1 : -1));
  function changeSorts(next: readonly TableSort[]) { setSorts(next); setPage(0); }
  function changeFilters(next: LessonFilterGroups) { setFilterGroups(next); setPage(0); setSelection(null); }
  const last = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const current = Math.min(page, last);
  const averageGrade = (student: Row) => studentAverages?.get(studentId(student)) || studentRow(student).values.average;
  const average = lessonView || items.some(item => !!averageGrade(item));
  const showRewards = !!rewards || items.some(item => Object.hasOwn(item, 'prize'));
  const rewardBudget = lessonRewardBudget(items);
  const validRow = (row: Row) => !!studentId(row) && items.filter(item => studentId(item) === studentId(row)).length === 1;
  const eligibleKeys = new Set(filtered.filter(validRow).map(studentId));
  const selectedKeys = new Set(selection && selection.context === selectionContext ? [...selection.keys].filter(key => eligibleKeys.has(key)) : []);
  const eligibleSignature = JSON.stringify([...eligibleKeys].sort());
  useEffect(() => {
    // A local edit can hide a selected row. It must not become selected again later.
    const available = new Set<string>(JSON.parse(eligibleSignature));
    setSelection(current => {
      if (!current || current.context !== selectionContext) return null;
      const keys = new Set([...current.keys].filter(key => available.has(key)));
      return keys.size === current.keys.size ? current : { ...current, keys };
    });
  }, [eligibleSignature, selectionContext]);
  useEffect(() => { setPage(page => Math.min(page, last)); }, [last]);
  const selected = filtered.filter(row => validRow(row) && selectedKeys.has(studentId(row)));
  const canBulk = !!onBulkChange && !!(attendance || marks || rewards);
  const reason = (row: Row, unavailable: string | undefined) => !validRow(row) ? 'У строки нет уникального ID ученика.' : unavailable || '';
  const numberValid = (value: string) => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 100 ? '' : 'Введите целую оценку от 1 до 100.';
  const fields: BulkField<Row>[] = [];
  if (marks) for (const [id, label] of [['mark4', 'Работа на уроке'], ['mark2', 'Контрольная']]) fields.push({ id, label,
    input: { kind: 'number', min: 1, max: 100, step: 1 }, validate: numberValid,
    unavailableReason: row => reason(row, marks.unavailable) || (!marks.allowDraft && !(Number(row.id_vizit) > 0) ? 'Сначала сохраните тему и посещаемость.' : ''),
  });
  if (attendance) fields.push({ id: 'attendance', label: 'Присутствие', input: { kind: 'select', options: [1, 2, 0].map(value => ({ value: String(value), label: attendanceLabels[value as AttendanceStatus] })) },
    validate: value => ['0', '1', '2'].includes(value) ? '' : 'Выберите статус присутствия.', unavailableReason: row => reason(row, attendance.unavailable) });
  if (rewards) fields.push({ id: 'reward', label: 'Топкойны', input: { kind: 'select', options: [0, 1, 2, 3].map(value => ({ value: String(value), label: String(value) })) },
    validate: value => ['0', '1', '2', '3'].includes(value) ? '' : 'Выберите от 0 до 3 топкойнов.',
    unavailableReason: row => reason(row, rewards.unavailable) || (rewardLevel(row.prize) === null ? 'Неизвестна текущая награда.' : ![1, 2].includes(attendanceStatus(row.was) ?? -1) ? 'Топкойны доступны присутствующим и опоздавшим.' : ''),
  });
  const columns: TableColumn<Row>[] = [
    { id: 'student', heading: <button className="text-button" onClick={() => setAscending(!ascending)}>Ученик {ascending ? '↑' : '↓'}</button>, ariaSort: ascending ? 'ascending' : 'descending', cell: student => {
      const id = studentId(student);
      const photo = studentPhotoUrl(id ? studentPhotos?.get(id) : undefined) || student.photo_pas;
      return <button className="student-name" disabled={busy || !validRow(student)} onClick={() => onOpen(student)}><StudentAvatar name={text(student.fio_stud)} photo={photo}/>{text(student.fio_stud) || 'Имя не получено'}</button>;
    } },
    { id: 'attendance', heading: 'Присутствие', cell: student => {
      const was = attendanceStatus(student.was);
      return attendance ? <select className={`attendance-select attendance-${was ?? 'unknown'}`} aria-label={`Присутствие: ${text(student.fio_stud)}`} value={was ?? ''} disabled={busy || !!attendance.unavailable || !validRow(student)} onChange={event => attendance.onChange(student, Number(event.target.value) as AttendanceStatus)}>
        <option value="" disabled>Не отмечено</option>{([1, 2, 0] as const).map(value => <option key={value} value={value}>{attendanceLabels[value]}</option>)}
      </select> : was === null ? 'Не отмечено' : attendanceLabels[was];
    } },
    ...([2, 4] as const).map(type => ({ id: 'mark' + type, heading: type === 2 ? 'Контрольная' : 'Работа на уроке', cell: (student: Row) => marks ?
      <MarkEditor key={`${text(student.id_vizit)}:${text(student[`mark${type}`])}`} value={student[`mark${type}`]} label={`${type === 2 ? 'Контрольная' : 'Работа на уроке'}: ${text(student.fio_stud)}`} disabled={busy || !validRow(student) || !!marks.unavailable || (!marks.allowDraft && !(Number(student.id_vizit) > 0))} reason={marks.unavailable || (!marks.allowDraft && !(Number(student.id_vizit) > 0) ? 'Сначала сохраните тему и посещаемость этого урока.' : '')} onSave={mark => marks.onChange(student, type, mark)}/> : text(student[`mark${type}`]) || '—' })),
  ];
  if (showRewards) columns.push({ id: 'rewards', heading: 'Топкойны', cell: student => {
    const was = attendanceStatus(student.was);
    return rewards ? <RewardEditor value={student.prize} maximum={rewardMaximum(student.prize, rewardBudget.remaining)} label={`Топкойны: ${text(student.fio_stud)}`} disabled={busy || !validRow(student) || !!rewards.unavailable || (was !== 1 && was !== 2)} reason={rewards.unavailable || (was !== 1 && was !== 2 ? 'Топкойны доступны присутствующим и опоздавшим ученикам. Сначала отметьте посещаемость.' : '')} onChange={reward => rewards.onChange(student, reward)}/> : rewardLevel(student.prize) || '—';
  } });
  if (average) columns.push({ id: 'average', heading: 'Средняя оценка', cell: student => <AverageGrade value={averageGrade(student)} loading={studentAveragesLoading} error={studentAveragesError}/> });
  const displayColumns = lessonView ? columns.map(column => {
    const field = sortFields.find(field => field.id === column.id);
    if (!field) return column;
    const priority = sorts.findIndex(sort => sort.columnId === column.id);
    const active = sorts[priority];
    return { ...column, ariaSort: priority === 0 ? active.direction : undefined,
      heading: <button type="button" className="data-table-sort" onClick={() => changeSorts([
        { columnId: column.id, direction: active?.direction === 'ascending' ? 'descending' : 'ascending' },
        ...sorts.filter(sort => sort.columnId !== column.id),
      ])}>{field.label}<span className="data-table-sort-indicator" aria-hidden="true">{active ? `${active.direction === 'ascending' ? '↑' : '↓'} ${priority + 1}` : '↕'}</span>
        {active && <span className="data-table-sr-only">, приоритет {priority + 1}, {active.direction === 'ascending' ? 'по возрастанию' : 'по убыванию'}</span>}
      </button> };
  }) : columns;
  const customSort = sorts.length !== 1 || sorts[0].columnId !== 'student' || sorts[0].direction !== 'ascending';
  function applyBulk(students: readonly Row[], column: string, value: string) {
    const number = Number(value);
    if (!['attendance', 'reward', 'mark2', 'mark4'].includes(column)) throw new Error('Этот столбец недоступен для массовой правки.');
    const change: LessonBulkChange = column === 'attendance' ? { column, value: number as AttendanceStatus } : column === 'reward' ? { column, value: (number === 0 ? 4 : number) as LessonReward } : { column: column === 'mark2' ? 'mark2' : 'mark4', value: number };
    onBulkChange!(students, change);
  }
  return <>
    <div className="workspace-table-tools lesson-table-toolbar">
      <div className="lesson-table-view-tools"><input type="search" aria-label="Поиск ученика" placeholder="Поиск ученика" value={query} onChange={event => { setQuery(event.target.value); setPage(0); setSelection(null); }}/>{(query || filterGroups.length > 0) && <span role="status">Найдено: {filtered.length}</span>}{selected.length > 0 && <span>Выбрано: {selected.length}</span>}
      {lessonView && <button type="button" className="button secondary" aria-haspopup="dialog" onClick={() => setSettingsOpen(true)}>Настройки таблицы{customSort ? ` · сортировок: ${sorts.length}` : ''}{filterGroups.length ? ` · фильтров: ${filterGroups.flat().length}` : ''}</button>}
      {lessonView && customSort && <button type="button" className="text-button" onClick={() => changeSorts(defaultLessonSort)}>Сбросить сортировку</button>}
      {lessonView && filterGroups.length > 0 && <button type="button" className="text-button" onClick={() => changeFilters([])}>Сбросить фильтры</button>}
      </div><div className="lesson-table-actions">
      {attendance && <button className="button secondary" title={attendance.unavailable || 'Вся группа, включая скрытых поиском учеников'} disabled={busy || !!attendance.unavailable || items.every(row => attendanceStatus(row.was) === 1)} onClick={attendance.onAll}>Все присутствуют</button>}
      {rewards && <span className="reward-budget"><span role="status">Топкойны: {rewardBudget.used === null ? '?' : rewardBudget.used} / {LESSON_REWARD_LIMIT}</span><HelpTip label="О бюджете топкойнов">Бюджет всего урока, включая скрытых учеников и черновик. {rewardBudget.used === null ? 'Количество неизвестно; увеличение недоступно.' : `Осталось: ${rewardBudget.remaining}.`}</HelpTip></span>}
      {rewards && onRewardAllocation && <RewardAllocation items={items} studentAverages={studentAverages} studentAveragesLoading={studentAveragesLoading} studentAveragesError={studentAveragesError} draftRewardIds={draftRewardIds} contextToken={contextToken} disabled={busy || !!rewards.unavailable} reason={rewards.unavailable} onApply={onRewardAllocation}/>}
      </div>
    </div>
    {lessonView && averageFilterUnavailable && <p className="table-bulk-help" role="status">Фильтр средней оценки недоступен: {studentAveragesLoading ? 'дождитесь загрузки средних оценок.' : studentAveragesError}</p>}
    {canBulk && <details className="lesson-bulk-disclosure"><summary>Массовое редактирование</summary>{(lessonView && onFill ? <LessonBulkEditor fields={fields} items={items} filteredRows={filtered} selectedRows={selected} locked={busy || !!attendance?.saving}
      contextKey={selectionContext} contextToken={contextToken} averages={studentAverages} averageUnavailable={studentAveragesLoading ? 'Дождитесь загрузки средних оценок.' : studentAveragesError}
      onBulkApply={applyBulk} onFill={onFill}/> : <TableBulkEditor contextKey={selectionContext} fields={fields} filteredRows={filtered} selectedRows={selected} locked={busy || !!attendance?.saving}
      defaultField={marks ? 'mark4' : fields[0]?.id} defaultValue={marks ? '12' : ''} valueLabel="Значение / расчёт" applyLabel="Заполнить столбец" maxTargets={Math.max(100, items.length)}
      onApply={applyBulk}/>)}</details>}
    {attendance?.unavailable && <div className="attendance-help">{attendance.unavailable === 'Выберите доступное занятие в Omni и загрузите урок.' ? <HelpTip label="Как выбрать доступное занятие">{attendance.unavailable}</HelpTip> : attendance.unavailable}</div>}
    {attendance?.saving && <p className="attendance-help" role="status">Сохраняю изменения и проверяю ответ Omni…</p>}
    <div className="table-scroll" tabIndex={lessonView ? 0 : undefined} role={lessonView ? 'region' : undefined} aria-label={lessonView ? 'Таблица учеников' : undefined}>
      <DataTable rows={filtered.slice(current * 25, (current + 1) * 25)} columns={displayColumns} className={canBulk ? 'lesson-selectable' : ''} getRowKey={(student, index) => validRow(student) ? studentId(student) : text(student.id_stud) + ':' + index}
        selection={canBulk ? { selectedKeys, eligibleKeys, getKey: studentId, locked: busy, allLabel: 'Выбрать всех учеников по фильтрам, на всех страницах', rowLabel: student => `Выбрать ученика: ${text(student.fio_stud)}`,
          onToggle: (student, checked) => { const keys = new Set(selectedKeys); if (checked) keys.add(studentId(student)); else keys.delete(studentId(student)); setSelection({ context: selectionContext, keys }); },
          onToggleAll: checked => setSelection({ context: selectionContext, keys: new Set(checked ? eligibleKeys : []) }),
        } : undefined}/>
    </div>
    {!filtered.length && <div className="empty">Ученики не найдены</div>}
    {last > 0 && <div className="workspace-table-tools"><button className="button secondary" disabled={!current} onClick={() => setPage(current - 1)}>Назад</button><span>{current + 1} / {last + 1}</span><button className="button secondary" disabled={current === last} onClick={() => setPage(current + 1)}>Далее</button></div>}
    {lessonView && settingsOpen && <LessonTableSettings fields={sortFields} sorts={sorts} onChange={changeSorts} onReset={() => changeSorts(defaultLessonSort)} onClose={() => setSettingsOpen(false)}
      filterFields={filterFields} filterGroups={filterGroups} onFiltersChange={changeFilters} matchingCount={filtered.length} totalCount={items.length}/>}
  </>;
}

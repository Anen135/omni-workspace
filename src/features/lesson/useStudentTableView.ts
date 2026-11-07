import { useEffect, useState } from 'react';
import { studentId } from '../students/students';
import { sortTableRowsByCriteria, type TableSort } from '../../components/data/table-sort';
import { defaultLessonSort, lessonSortFields } from './lesson-table-sort';
import { filterLessonRows, lessonFilterFields, type LessonFilterGroups } from './lesson-table-filter';
type Row = Record<string, unknown>;
export function useStudentTableView({ items, lessonView, showRewards, studentAverages, studentAveragesLoading, studentAveragesError, selectionContext, contextToken }: { items: Row[]; lessonView: boolean; showRewards: boolean; studentAverages?: ReadonlyMap<string,string>; studentAveragesLoading: boolean; studentAveragesError?: string; selectionContext: unknown; contextToken: string }) {
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
    .filter(field => field.id !== 'rewards' || showRewards || items.some(item => Object.hasOwn(item, 'prize')));
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
return { query, setQuery, ascending, setAscending, sorts, settingsOpen, setSettingsOpen, filterGroups, setPage, setSelection, sortFields, filterFields, averageFilterUnavailable, filtered, changeSorts, changeFilters, last, current, validRow, eligibleKeys, selectedKeys, selected };
}

import { Fragment, useEffect, useRef, useState, type AriaAttributes, type ReactNode } from 'react';
import { sortTableRows, type SortableColumn, type TableSort } from './table-sort';
import { filterTableRows, type TableFilter, type TableFilterState } from './table-filter';
import { TableFilters } from './TableFilters';
export { sortTableRows, type SortableColumn, type SortValue, type TableSort } from './table-sort';
export { filterTableRows, type TableFilter, type TableFilterState } from './table-filter';
import './table.css';

export type TableColumn<Row> = SortableColumn<Row> & {
  id: string;
  heading: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  className?: string;
  ariaSort?: AriaAttributes['aria-sort'];
  control?: 'picker' | 'slider' | 'button';
};

export type TableSelection<Row> = {
  selectedKeys: ReadonlySet<string>;
  eligibleKeys: ReadonlySet<string>;
  getKey: (row: Row) => string;
  locked: boolean;
  onToggle: (row: Row, checked: boolean) => void;
  onToggleAll: (checked: boolean, filteredRows: readonly Row[]) => void;
  rowLabel?: (row: Row, index: number) => string;
  allLabel?: string;
  className?: string;
  selectedClassName?: string;
  unavailableLabel?: string;
};

export type DataTableProps<Row> = {
  rows: readonly Row[];
  columns: readonly TableColumn<Row>[];
  getRowKey: (row: Row, index: number) => string;
  selection?: TableSelection<Row>;
  renderAfterRow?: (row: Row, index: number) => ReactNode;
  className?: string;
  caption?: ReactNode;
  label?: string;
  sort?: TableSort | null;
  onSortChange?: (next: TableSort) => void;
  sortingDisabled?: boolean;
  defaultSort?: TableSort | null;
  filters?: readonly TableFilter<Row>[];
  filterState?: TableFilterState;
  onFiltersChange?: (next: TableFilterState) => void;
  pagination?: { pageSize?: number; pageSizeOptions?: readonly number[] };
  emptyMessage?: ReactNode;
};

const noFilters: TableFilterState = {};
const validPageSize = (value: number | undefined) => Number.isSafeInteger(value) && value! > 0;

function SelectionHeading({ checked, mixed, disabled, label, onChange }: {
  checked: boolean; mixed: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <input ref={input} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/>;
}

/** Optional filters/pagination consume the full dataset. Legacy adapters may still provide a page. */
export function DataTable<Row>({ rows, columns, getRowKey, selection, renderAfterRow, className = '', caption, label,
  sort, onSortChange, sortingDisabled = false, defaultSort = null, filters, filterState, onFiltersChange,
  pagination, emptyMessage = 'Нет данных по выбранным условиям.' }: DataTableProps<Row>) {
  const [internalSort, setInternalSort] = useState<TableSort | null>(defaultSort);
  const [internalFilters, setInternalFilters] = useState<TableFilterState>({});
  const [page, setPage] = useState(1);
  const initialPageSize = validPageSize(pagination?.pageSize) ? pagination!.pageSize! : 25;
  const [pageSize, setPageSize] = useState(initialPageSize);
  const activeSort = onSortChange ? (sort ?? null) : internalSort;
  const activeFilters = onFiltersChange ? filterState ?? noFilters : internalFilters;
  const filterSignature = JSON.stringify(activeFilters);
  useEffect(() => { setPage(1); }, [filterSignature, activeSort?.columnId, activeSort?.direction]);
  useEffect(() => { setPageSize(initialPageSize); setPage(1); }, [initialPageSize]);
  const entries = rows.map((row, index) => ({ row, index }));
  const matching = new Set(filters ? filterTableRows(rows, filters, activeFilters) : rows);
  const filteredEntries = entries.filter(entry => matching.has(entry.row));
  const entryColumns: SortableColumn<(typeof entries)[number]>[] = columns.map(column => column.kind === 'data'
    ? { id: column.id, kind: 'data', value: entry => column.value(entry.row), compare: column.compare }
    : { id: column.id, kind: column.kind });
  const sortedEntries = onSortChange ? filteredEntries : sortTableRows(filteredEntries, entryColumns, activeSort);
  const pageCount = pagination ? Math.max(1, Math.ceil(sortedEntries.length / pageSize)) : 1;
  const currentPage = Math.min(page, pageCount);
  const displayedEntries = pagination ? sortedEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize) : sortedEntries;
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const eligibleKeys = selection && (filters !== undefined || pagination)
    ? new Set(filteredEntries.map(entry => selection.getKey(entry.row)).filter(key => selection.eligibleKeys.has(key)))
    : selection?.eligibleKeys;
  const eligibleRows = selection ? filteredEntries.map(entry => entry.row).filter(row => selection.eligibleKeys.has(selection.getKey(row))) : [];
  const pageSizes = [...new Set([...(pagination?.pageSizeOptions ?? [10, 25, 50, 100]), initialPageSize].filter(validPageSize))].sort((a, b) => a - b);
  function toggleSort(columnId: string) {
    const next: TableSort = { columnId, direction: activeSort?.columnId === columnId && activeSort.direction === 'ascending'
      ? 'descending' : 'ascending' };
    if (onSortChange) onSortChange(next);
    else setInternalSort(next);
  }
  function changeFilters(next: TableFilterState) {
    setPage(1);
    if (onFiltersChange) onFiltersChange(next);
    else setInternalFilters(next);
  }
  const selectedCount = selection ? [...eligibleKeys!].filter(key => selection.selectedKeys.has(key)).length : 0;
  const table = <table className={'data-table ' + className} aria-label={label}>
    {caption && <caption className="data-table-sr-only">{caption}</caption>}
    <thead><tr>
      {selection && <th scope="col" className={'data-table-selection ' + (selection.className ?? '')}>
        <SelectionHeading checked={eligibleKeys!.size > 0 && selectedCount === eligibleKeys!.size}
          mixed={selectedCount > 0 && selectedCount < eligibleKeys!.size} disabled={selection.locked || !eligibleKeys!.size}
          label={selection.allLabel ?? 'Выбрать все доступные строки по фильтрам, на всех страницах'} onChange={checked => selection.onToggleAll(checked, eligibleRows)}/>
      </th>}
      {columns.map(column => {
        const direction = activeSort?.columnId === column.id ? activeSort.direction : undefined;
        return <th key={column.id} scope="col" aria-sort={column.kind === 'data' ? direction ?? 'none' : column.kind === 'action' ? undefined : column.ariaSort}>
          {column.kind === 'data' ? <button type="button" className="data-table-sort" disabled={sortingDisabled}
            onClick={() => toggleSort(column.id)}>{column.heading}<span aria-hidden="true" className="data-table-sort-indicator">{direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}</span></button> : column.heading}
        </th>;
      })}
    </tr></thead>
    <tbody>{displayedEntries.map(({ row, index }) => {
      const key = selection?.getKey(row);
      const eligible = key !== undefined && !!selection?.eligibleKeys.has(key);
      const selected = eligible && !!selection?.selectedKeys.has(key!);
      return <Fragment key={getRowKey(row, index)}>
        <tr className={selected ? 'data-table-selected ' + (selection?.selectedClassName ?? '') : undefined}>
          {selection && <td className={'data-table-selection ' + (selection.className ?? '')}>
            {eligible ? <input type="checkbox" aria-label={selection.rowLabel?.(row, index) ?? 'Выбрать строку ' + (index + 1)} checked={selected}
              disabled={selection.locked} onChange={event => selection.onToggle(row, event.target.checked)}/>
              : <span className="data-table-muted" title={selection.unavailableLabel ?? 'Редактирование этой строки недоступно'}>—</span>}
          </td>}
          {columns.map(column => <td key={column.id} className={column.className}>{column.cell(row, index)}</td>)}
        </tr>
        {renderAfterRow?.(row, index)}
      </Fragment>;
    })}</tbody>
  </table>;
  if (filters === undefined && !pagination) return table;
  return <div className="data-table-view">
    {!!filters?.length && <TableFilters rows={rows} filters={filters} value={activeFilters} onChange={changeFilters} disabled={sortingDisabled}/>}
    <p className="table-bulk-help data-table-summary" role="status">Найдено: {sortedEntries.length} из {rows.length}{selection && ` · Выбрано по фильтру: ${selectedCount}`}</p>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={label ? `${label}: прокрутка` : 'Таблица с прокруткой'}>{table}</div>
    {!sortedEntries.length && <p className="empty" role="status">{emptyMessage}</p>}
    {pagination && <div className="table-bulk-editor table-bulk-controls" role="group" aria-label="Пагинация таблицы">
      <button className="button secondary" type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button>
      <span>Страница {currentPage} из {pageCount}</span>
      <button className="button secondary" type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button>
      <label>Строк на странице<select aria-label="Строк на странице" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
        {pageSizes.map(size => <option key={size} value={size}>{size}</option>)}
      </select></label>
    </div>}
  </div>;
}

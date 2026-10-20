import { Fragment, useEffect, useRef, type AriaAttributes, type ReactNode } from 'react';
import './table.css';

export type TableColumn<Row> = {
  id: string;
  heading: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  className?: string;
  ariaSort?: AriaAttributes['aria-sort'];
};

export type TableSelection<Row> = {
  selectedKeys: ReadonlySet<string>;
  eligibleKeys: ReadonlySet<string>;
  getKey: (row: Row) => string;
  locked: boolean;
  onToggle: (row: Row, checked: boolean) => void;
  onToggleAll: (checked: boolean) => void;
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
};

function SelectionHeading({ checked, mixed, disabled, label, onChange }: {
  checked: boolean; mixed: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (input.current) input.current.indeterminate = mixed; }, [mixed]);
  return <input ref={input} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/>;
}

/** The adapter owns filtering, paging and selection validity; rows contains the current page. */
export function DataTable<Row>({ rows, columns, getRowKey, selection, renderAfterRow, className = '', caption, label }: DataTableProps<Row>) {
  const selectedCount = selection ? [...selection.eligibleKeys].filter(key => selection.selectedKeys.has(key)).length : 0;
  return <table className={'data-table ' + className} aria-label={label}>
    {caption && <caption className="data-table-sr-only">{caption}</caption>}
    <thead><tr>
      {selection && <th scope="col" className={'data-table-selection ' + (selection.className ?? '')}>
        <SelectionHeading checked={selection.eligibleKeys.size > 0 && selectedCount === selection.eligibleKeys.size}
          mixed={selectedCount > 0 && selectedCount < selection.eligibleKeys.size} disabled={selection.locked || !selection.eligibleKeys.size}
          label={selection.allLabel ?? 'Выбрать все доступные строки по фильтрам, на всех страницах'} onChange={selection.onToggleAll}/>
      </th>}
      {columns.map(column => <th key={column.id} scope="col" aria-sort={column.ariaSort}>{column.heading}</th>)}
    </tr></thead>
    <tbody>{rows.map((row, index) => {
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
}

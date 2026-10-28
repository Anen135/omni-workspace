export type TableSort = { columnId: string; direction: 'ascending' | 'descending' };
export type SortValue = string | number | boolean | Date | null | undefined;

export type SortableColumn<Row> = { id: string } & (
  | { kind?: undefined }
  | { kind: 'action' }
  | { kind: 'data'; value: (row: Row) => SortValue; compare?: (a: SortValue, b: SortValue) => number }
);

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

function empty(value: SortValue): boolean {
  return value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))
    || (value instanceof Date && !Number.isFinite(value.getTime()));
}

function rank(value: SortValue): number {
  if (typeof value === 'number') return 0;
  if (value instanceof Date) return 1;
  if (typeof value === 'boolean') return 2;
  return 3;
}

function compareValues(a: SortValue, b: SortValue): number {
  const typeOrder = rank(a) - rank(b);
  if (typeOrder) return typeOrder;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/** Stable, non-mutating sorting. Missing values stay last in either direction. */
export function sortTableRows<Row>(rows: readonly Row[], columns: readonly SortableColumn<Row>[], sort: TableSort | null): Row[] {
  const column = sort && columns.find(candidate => candidate.id === sort.columnId);
  if (!sort || !column || column.kind !== 'data') return [...rows];
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return rows.map((row, index) => ({ row, index, value: column.value(row) }))
    .sort((a, b) => {
      const aEmpty = empty(a.value);
      const bEmpty = empty(b.value);
      if (aEmpty || bEmpty) return Number(aEmpty) - Number(bEmpty) || a.index - b.index;
      const result = (column.compare ?? compareValues)(a.value, b.value);
      return (Number.isNaN(result) ? 0 : result * direction) || a.index - b.index;
    }).map(item => item.row);
}

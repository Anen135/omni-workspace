import type { SortValue } from './table-sort';

export type TableFilter<Row> = { id: string; label: string } & (
  | { kind: 'text'; value: (row: Row) => string | null | undefined }
  | { kind: 'select'; value: (row: Row) => string | number | boolean | null | undefined; options?: readonly { value: string; label: string }[] }
  | { kind: 'number'; value: (row: Row) => number | null | undefined }
  | { kind: 'date'; value: (row: Row) => Date | string | null | undefined }
  | { kind: 'boolean'; value: (row: Row) => boolean | null | undefined }
  | { kind: 'presence'; value: (row: Row) => SortValue }
);

export type FilterInput = string | { from: string; to: string };
export type TableFilterState = Readonly<Record<string, FilterInput>>;

function empty(value: SortValue): boolean {
  return value == null || value === '' || (typeof value === 'number' && !Number.isFinite(value))
    || (value instanceof Date && !Number.isFinite(value.getTime()));
}

function calendarDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

function dateDay(value: Date | string | null | undefined): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? calendarDay(value.toISOString().slice(0, 10)) : NaN;
  if (typeof value !== 'string') return NaN;
  const day = calendarDay(value.slice(0, 10));
  if (!Number.isFinite(day)) return NaN;
  if (value.length === 10) return day;
  // Timestamp strings retain their written calendar day; Date objects use their UTC day.
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)) ? day : NaN;
}

function numericBound(value: string): number {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) ? Number(value) : NaN;
}

/** Stable AND filtering over declared accessors. Empty inputs and unknown state IDs are inactive. */
export function filterTableRows<Row>(rows: readonly Row[], filters: readonly TableFilter<Row>[], state: TableFilterState): Row[] {
  const predicates: ((row: Row) => boolean)[] = [];
  for (const filter of filters) {
    const input = Object.hasOwn(state, filter.id) ? state[filter.id] : undefined;
    if (filter.kind === 'number' || filter.kind === 'date') {
      if (!input || typeof input === 'string') continue;
      const from = input.from.trim();
      const to = input.to.trim();
      if (!from && !to) continue;
      const parse = filter.kind === 'date' ? calendarDay : numericBound;
      const low = from ? parse(from) : -Infinity;
      const high = to ? parse(to) : Infinity;
      if ((from && !Number.isFinite(low)) || (to && !Number.isFinite(high)) || low > high) return [];
      predicates.push(row => {
        const raw = filter.value(row);
        const value = filter.kind === 'date' ? dateDay(raw as Date | string | null | undefined)
          : typeof raw === 'number' ? raw : NaN;
        return Number.isFinite(value) && value >= low && value <= high;
      });
      continue;
    }
    if (typeof input !== 'string') continue;
    if (filter.kind === 'text') {
      const query = input.trim().toLocaleLowerCase('ru');
      if (query) predicates.push(row => (filter.value(row) ?? '').toLocaleLowerCase('ru').includes(query));
    } else if (input !== '') {
      if (filter.kind === 'select') predicates.push(row => {
        const value = filter.value(row);
        return !empty(value) && String(value) === input;
      });
      else if (filter.kind === 'boolean') predicates.push(row =>
        (input === 'true' || input === 'false') && filter.value(row) === (input === 'true'));
      else predicates.push(row => input === 'empty' ? empty(filter.value(row)) : input === 'filled' && !empty(filter.value(row)));
    }
  }
  return rows.filter(row => predicates.every(predicate => predicate(row)));
}

/** Options come from the complete input collection, independently of current filter state. */
export function getTableFilterOptions<Row>(rows: readonly Row[], filter: Extract<TableFilter<Row>, { kind: 'select' }>): readonly { value: string; label: string }[] {
  if (filter.options) return filter.options;
  const values = new Set<string>();
  for (const row of rows) {
    const value = filter.value(row);
    if (!empty(value)) values.add(String(value));
  }
  return [...values].map(value => ({ value, label: value }));
}

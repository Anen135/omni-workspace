import { getTableFilterOptions, type FilterInput, type TableFilter, type TableFilterState } from './table-filter';
import './table.css';

export type TableFiltersProps<Row> = {
  rows: readonly Row[];
  filters: readonly TableFilter<Row>[];
  value: TableFilterState;
  onChange: (next: TableFilterState) => void;
  disabled?: boolean;
};

/** Controlled inputs only emit filter state; DataTable owns filtering, sorting and paging. */
export function TableFilters<Row>({ rows, filters, value, onChange, disabled = false }: TableFiltersProps<Row>) {
  function update(id: string, input: FilterInput) {
    onChange({ ...value, [id]: input });
  }
  return <div className="table-bulk-editor"><div className="table-bulk-controls">
    {filters.map(filter => {
      const input = Object.hasOwn(value, filter.id) ? value[filter.id] : undefined;
      if (filter.kind === 'number' || filter.kind === 'date') {
        const range = typeof input === 'object' ? input : { from: '', to: '' };
        return <div key={filter.id} className="table-bulk-controls">
          <label className="field">{filter.label}: от<input type={filter.kind === 'date' ? 'date' : 'number'} step={filter.kind === 'number' ? 'any' : undefined}
            aria-label={`${filter.label}: от`} value={range.from} disabled={disabled}
            onChange={event => update(filter.id, { ...range, from: event.target.value })}/></label>
          <label className="field">{filter.label}: до<input type={filter.kind === 'date' ? 'date' : 'number'} step={filter.kind === 'number' ? 'any' : undefined}
            aria-label={`${filter.label}: до`} value={range.to} disabled={disabled}
            onChange={event => update(filter.id, { ...range, to: event.target.value })}/></label>
        </div>;
      }
      const text = typeof input === 'string' ? input : '';
      if (filter.kind === 'text') return <label key={filter.id} className="field">{filter.label}<input type="text"
        aria-label={filter.label} value={text} disabled={disabled} onChange={event => update(filter.id, event.target.value)}/></label>;
      const options = filter.kind === 'select' ? getTableFilterOptions(rows, filter)
        : filter.kind === 'boolean' ? [{ value: 'true', label: 'Да' }, { value: 'false', label: 'Нет' }]
          : [{ value: 'empty', label: 'Пусто' }, { value: 'filled', label: 'Заполнено' }];
      return <label key={filter.id} className="field">{filter.label}<select aria-label={filter.label} value={text} disabled={disabled}
        onChange={event => update(filter.id, event.target.value)}>
        {filter.kind === 'select' && text !== '' && !options.some(option => option.value === text)
          && <option value={text}>{text} (нет в данных)</option>}
        <option value="">Все</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>;
    })}
    <button type="button" className="button" disabled={disabled} onClick={() => onChange({})}>Сбросить фильтры</button>
  </div></div>;
}

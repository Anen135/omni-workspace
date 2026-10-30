import { useId } from 'react';
import { lessonFilterError, lessonFilterOperators, newLessonFilter, type LessonFilterCondition, type LessonFilterField, type LessonFilterGroups } from './lesson-table-filter';

export function LessonTableFilters({ fields, groups, onChange }: {
  fields: readonly LessonFilterField[]; groups: LessonFilterGroups; onChange: (groups: LessonFilterGroups) => void;
}) {
  const id = useId();
  function update(group: number, index: number, condition: LessonFilterCondition) {
    onChange(groups.map((items, g) => g === group ? items.map((item, i) => i === index ? condition : item) : items));
  }
  return <section className="lesson-table-filters" aria-label="Фильтры таблицы">
    <h3>Фильтры</h3>
    <p className="table-bulk-help">Внутри группы должны выполняться все условия (И). Достаточно любой группы (ИЛИ). Поиск по имени применяется дополнительно. Изменение фильтров очищает выбор учеников.</p>
    {groups.map((group, g) => <fieldset key={g} className="lesson-filter-group"><legend>{g > 0 ? 'ИЛИ · ' : ''}Группа {g + 1} · И</legend>
      {group.map((condition, i) => {
        const field = fields.find(field => field.id === condition.fieldId);
        const error = lessonFilterError(condition, fields);
        const label = `${g + 1}.${i + 1}`;
        const help = `${id}-${g}-${i}`;
        const hasValue = !['empty', 'filled'].includes(condition.operator);
        return <div key={i} className="lesson-filter-condition">
          <div className="table-bulk-controls">
            <label>Поле<select aria-label={`Поле фильтра ${label}`} value={condition.fieldId} onChange={event => {
              const next = fields.find(field => field.id === event.target.value);
              if (next) update(g, i, newLessonFilter(next));
            }}>{fields.map(field => <option key={field.id} value={field.id}>{field.label}</option>)}</select></label>
            <label>Условие<select aria-label={`Условие фильтра ${label}`} value={condition.operator} onChange={event => update(g, i, { ...condition, operator: event.target.value })}>
              {field && lessonFilterOperators(field).map(operator => <option key={operator.id} value={operator.id}>{operator.label}</option>)}
            </select></label>
            {hasValue && (field?.kind === 'select' ? <label>Значение<select aria-label={`Значение фильтра ${label}`} value={condition.value} onChange={event => update(g, i, { ...condition, value: event.target.value })}>
              {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label> : <>
              <label>{condition.operator === 'between' ? 'От' : 'Значение'}<input type="text" inputMode={field?.kind === 'number' ? 'decimal' : 'text'} aria-label={`Значение фильтра ${label}`} aria-invalid={!!error} aria-describedby={error ? help : undefined} value={condition.value} onChange={event => update(g, i, { ...condition, value: event.target.value })}/></label>
              {condition.operator === 'between' && <label>До<input type="text" inputMode="decimal" aria-label={`Верхняя граница фильтра ${label}`} aria-invalid={!!error} aria-describedby={error ? help : undefined} value={condition.to} onChange={event => update(g, i, { ...condition, to: event.target.value })}/></label>}
            </>)}
            <button type="button" className="button secondary" aria-label={`Удалить условие ${label}`} onClick={() => onChange(groups.map((items, index) => index === g ? items.filter((_, index) => index !== i) : items).filter(items => items.length))}>Удалить</button>
          </div>
          {error && <p id={help} className="table-bulk-help" role="alert">{error}</p>}
        </div>;
      })}
      <div className="table-bulk-controls">
        <button type="button" className="button secondary" aria-label={`Добавить условие в группу ${g + 1}`} onClick={() => onChange(groups.map((items, index) => index === g ? [...items, newLessonFilter(fields[0])] : items))}>Добавить условие · И</button>
        <button type="button" className="text-button" onClick={() => onChange(groups.filter((_, index) => index !== g))}>Удалить группу {g + 1}</button>
      </div>
    </fieldset>)}
    <div className="table-bulk-controls">
      <button type="button" className="button secondary" onClick={() => onChange([...groups, [newLessonFilter(fields[0])]])}>{groups.length ? 'Добавить группу · ИЛИ' : 'Добавить фильтр'}</button>
      <button type="button" className="button secondary" disabled={!groups.length} onClick={() => onChange([])}>Сбросить фильтры</button>
    </div>
  </section>;
}

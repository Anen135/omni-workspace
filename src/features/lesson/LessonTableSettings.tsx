import { HelpTip } from '../../components/ui/HelpTip';
import { useEffect, useId, useRef } from 'react';
import type { TableSort } from '../../components/data/table-sort';
import { LessonTableFilters } from './LessonTableFilters';
import type { LessonFilterField, LessonFilterGroups } from './lesson-table-filter';

export function LessonTableSettings({ fields, sorts, onChange, onReset, onClose, filterFields, filterGroups, onFiltersChange, matchingCount, totalCount }: {
  fields: readonly { id: string; label: string }[];
  sorts: readonly TableSort[];
  onChange: (sorts: readonly TableSort[]) => void;
  onReset: () => void;
  onClose: () => void;
  filterFields: readonly LessonFilterField[];
  filterGroups: LessonFilterGroups;
  onFiltersChange: (groups: LessonFilterGroups) => void;
  matchingCount: number;
  totalCount: number;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const opener = dialog.current?.getRootNode() instanceof ShadowRoot
      ? (dialog.current.getRootNode() as ShadowRoot).activeElement : document.activeElement;
    dialog.current?.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  function move(index: number, offset: number) {
    const next = [...sorts];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return <dialog ref={dialog} className="lesson-table-settings" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      // Chromium's native dialog traversal can leave a modal inside a shadow root.
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)')];
      const root = event.currentTarget.getRootNode();
      const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      const index = controls.findIndex(control => control === active);
      const next = (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      event.preventDefault();
      controls[next]?.focus();
    }}>
    <div className="lesson-table-settings-heading"><h2 id={title}>Настройки таблицы</h2><button type="button" className="button secondary" onClick={onClose} autoFocus>Закрыть</button></div>
    <p className="table-bulk-help" role="status">По фильтрам и поиску: {matchingCount} из {totalCount}.</p>
    <LessonTableFilters fields={filterFields} groups={filterGroups} onChange={onFiltersChange}/>
    <div className="help-heading"><h3>Сортировка</h3><HelpTip label="О порядке сортировки">Критерии применяются сверху вниз, на всех страницах. Пустые значения — в конце. Присутствие: отсутствует → присутствует → опоздал. Заголовок столбца делает его первым критерием, сохраняя остальные.</HelpTip></div>
    <ol className="lesson-sort-list">
      {sorts.map((sort, index) => <li key={index} className="table-bulk-controls">
        <label>Поле {index + 1}<select aria-label={`Поле сортировки ${index + 1}`} value={sort.columnId} onChange={event => onChange(sorts.map((item, i) => i === index ? { ...item, columnId: event.target.value } : item))}>
          {fields.filter(field => field.id === sort.columnId || !sorts.some(item => item.columnId === field.id)).map(field => <option key={field.id} value={field.id}>{field.label}</option>)}
        </select></label>
        <label>Направление<select aria-label={`Направление сортировки ${index + 1}`} value={sort.direction} onChange={event => onChange(sorts.map((item, i) => i === index ? { ...item, direction: event.target.value as TableSort['direction'] } : item))}>
          <option value="ascending">По возрастанию</option><option value="descending">По убыванию</option>
        </select></label>
        <button type="button" className="button secondary" aria-label={`Поднять критерий ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
        <button type="button" className="button secondary" aria-label={`Опустить критерий ${index + 1}`} disabled={index === sorts.length - 1} onClick={() => move(index, 1)}>↓</button>
        <button type="button" className="button secondary" aria-label={`Удалить критерий ${index + 1}`} onClick={() => onChange(sorts.filter((_, i) => i !== index))}>Удалить</button>
      </li>)}
    </ol>
    {!sorts.length && <p role="status">Исходный порядок учеников, без сортировки.</p>}
    <div className="table-bulk-controls">
      <button type="button" className="button secondary" disabled={sorts.length >= fields.length} onClick={() => {
        const field = fields.find(field => !sorts.some(sort => sort.columnId === field.id));
        if (field) onChange([...sorts, { columnId: field.id, direction: 'ascending' }]);
      }}>Добавить критерий</button>
      <button type="button" className="button secondary" onClick={onReset}>Сбросить сортировку</button>
    </div>
    <p className="table-bulk-help">Изменения применяются сразу.</p>
  </dialog>;
}

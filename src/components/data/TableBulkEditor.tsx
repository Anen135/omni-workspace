import { useId, useRef, useState } from 'react';
import './table.css';

export type BulkField<Row> = {
  id: string;
  label: string;
  input: { kind: 'number'; min?: number; max?: number; step?: number } | { kind: 'select'; options: readonly { value: string; label: string }[] };
  validate: (value: string) => string;
  unavailableReason: (row: Row) => string;
};

export type TableBulkEditorProps<Row> = {
  fields: readonly BulkField<Row>[];
  filteredRows: readonly Row[];
  selectedRows: readonly Row[];
  locked: boolean;
  applyLabel: string;
  onApply: (rows: Row[], fieldId: string, value: string) => Promise<unknown> | void;
  contextKey?: unknown;
  maxTargets?: number;
  defaultField?: string;
  defaultValue?: string;
  onFieldChange?: (fieldId: string) => void;
  className?: string;
  valueLabel?: string;
  valueAriaLabel?: string;
};

export function TableBulkEditor<Row>({ fields, filteredRows, selectedRows, locked, applyLabel, onApply, maxTargets = 100,
  contextKey, defaultField, defaultValue = '', onFieldChange, className = '', valueLabel = 'Значение', valueAriaLabel }: TableBulkEditorProps<Row>) {
  const [fieldId, setFieldId] = useState(defaultField ?? fields[0]?.id ?? '');
  const [value, setValue] = useState(defaultValue);
  const [scope, setScope] = useState('selected');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ contextKey: unknown; message: string } | null>(null);
  const submitting = useRef(false);
  const helpId = useId();
  const field = fields.find(candidate => candidate.id === fieldId);
  const targets = scope === 'filtered' ? filteredRows : selectedRows;
  const reasons = field ? targets.map(row => field.unavailableReason(row)).filter(Boolean) : [];
  const invalid = field?.validate(value) ?? 'Выберите столбец для редактирования.';
  const oversized = targets.length > maxTargets;
  const busy = locked || pending;
  const blocked = busy || !targets.length || !field || !!invalid || reasons.length > 0 || oversized;

  async function apply() {
    if (blocked || submitting.current || !field) return;
    submitting.current = true;
    setPending(true); setFailure(null);
    try { await onApply([...targets], field.id, value); }
    catch (reason) { setFailure({ contextKey, message: reason instanceof Error ? reason.message : 'Не удалось сохранить изменения. Проверьте данные перед повторной отправкой.' }); }
    finally { submitting.current = false; setPending(false); }
  }

  return <div className={'table-bulk-editor ' + className} aria-busy={busy}>
    <div className="table-bulk-controls">
      <span>Найдено: <strong>{filteredRows.length}</strong></span>
      <span>Выбрано: <strong>{selectedRows.length}</strong></span>
      <label>Столбец<select aria-label="Столбец для массового редактирования" value={fieldId} disabled={busy || !fields.length} onChange={event => {
        const next = fields.find(candidate => candidate.id === event.target.value);
        setFieldId(event.target.value); setValue(next?.input.kind === 'select' ? next.input.options[0]?.value ?? '' : '');
        setFailure(null); onFieldChange?.(event.target.value);
      }}>{fields.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}</select></label>
      <label>{valueLabel}{field?.input.kind === 'select'
        ? <select aria-label={valueAriaLabel ?? valueLabel} value={value} disabled={busy} onChange={event => { setValue(event.target.value); setFailure(null); }}>
          <option value="" disabled>Выберите значение</option>{field.input.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        : <input type="number" aria-label={valueAriaLabel ?? valueLabel} min={field?.input.min} max={field?.input.max} step={field?.input.step}
          value={value} disabled={busy || !field} onChange={event => { setValue(event.target.value); setFailure(null); }}/>}</label>
      <label>Применить к<select aria-label="Область массового редактирования" value={scope} disabled={busy} onChange={event => { setScope(event.target.value); setFailure(null); }}>
        <option value="selected">Выбранным строкам ({selectedRows.length})</option>
        <option value="filtered">Всем по фильтрам ({filteredRows.length})</option>
      </select></label>
      <button type="button" className="button primary" aria-describedby={helpId} disabled={blocked} onClick={() => void apply()}>{busy ? 'Сохранение…' : applyLabel + (targets.length ? ' (' + targets.length + ')' : '')}</button>
    </div>
    <p id={helpId} className="table-bulk-help">На всех страницах: {targets.length}. Недоступно: {reasons.length}.{reasons.length > 0 && ' ' + [...new Set(reasons)].join(' ')}</p>
    {invalid && <p className="warning" role="alert">{invalid}</p>}
    {oversized && <p className="warning" role="alert">За один раз можно изменить не более {maxTargets} строк. Уменьшите выбор или уточните фильтры.</p>}
    {failure && failure.contextKey === contextKey && <p className="warning" role="alert">{failure.message}</p>}
  </div>;
}

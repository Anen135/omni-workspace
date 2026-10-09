import { useState } from 'react';
export function MarkEditor({ value, label, disabled, reason, onSave }: { value: unknown; label: string; disabled: boolean; reason: string; onSave: (mark: number) => void }) {
  const current = value === null || value === undefined || value === '' ? '' : String(value);
  const [editing, setEditing] = useState(false);
  const [mark, setMark] = useState(current);
  if (!editing) return <button className="text-button" disabled={disabled} title={reason || 'Изменить оценку'} aria-label={label} onClick={() => { setMark(current); setEditing(true); }}>{current || '—'}</button>;
  return <form className="mark-editor" onSubmit={event => { event.preventDefault(); const next = Number(mark); if (!Number.isInteger(next) || next < 1 || next > 100) return; onSave(next); setEditing(false); }}>
    <input aria-label={label} type="number" min={1} max={100} step={1} required value={mark} disabled={disabled} onChange={event => setMark(event.target.value)} autoFocus/>
    <button type="submit" className="text-button" disabled={disabled}>Сохранить</button><button type="button" className="text-button" onClick={() => setEditing(false)}>Отмена</button>
  </form>;
}

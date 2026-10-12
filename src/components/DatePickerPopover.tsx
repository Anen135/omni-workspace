import { useState } from 'react';
import { DismissiblePopover } from './DismissiblePopover';

export function DatePickerPopover({ today, value, busy, onPick, unrestricted = false }: { today: string; value: string; busy: boolean; unrestricted?: boolean; onPick: (date: string) => void }) {
  return <DismissiblePopover label="Выбрать дату">{close => <CalendarPicker unrestricted={unrestricted} key={value} today={today} value={value} busy={busy} onPick={date => { onPick(date); close(); }}/>}</DismissiblePopover>;
}

function CalendarPicker({ today, value, busy, onPick, unrestricted }: { today: string; value: string; busy: boolean; unrestricted?: boolean; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(() => new Date(`${value || today}T12:00:00Z`));
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const weekStart = (date: Date) => { const result = new Date(date); result.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); return result.getTime(); };
  const currentWeek = weekStart(new Date(`${today}T12:00:00Z`));
  const days = Array.from({ length: 42 }, (_, index) => new Date(first.getTime() + (index - offset) * 86400000));
  const changeMonth = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1, 12)));
  return <><div className="workspace-calendar-heading"><button className="icon" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>←</button><strong>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button className="icon" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>→</button></div><div className="workspace-calendar">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span key={day}>{day}</span>)}{days.map(date => {
    const iso = date.toISOString().slice(0, 10);
    return <button key={iso} className={date.getUTCMonth() === month.getUTCMonth() ? '' : 'muted'} aria-label={iso} aria-current={iso === today ? 'date' : undefined} aria-pressed={iso === value} disabled={busy || !unrestricted && Math.abs((weekStart(date) - currentWeek) / 604800000) > 52} onClick={() => onPick(iso)}>{date.getUTCDate()}</button>;
  })}</div><button className="text-button" disabled={busy} onClick={() => onPick(today)}>Перейти к сегодняшнему дню</button></>;
}

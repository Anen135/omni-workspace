import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, X, Zap } from 'lucide-react';

export function DismissiblePopover({ label, children, drawer = false }: { label: string; children: ReactNode | ((close: () => void) => ReactNode); drawer?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className={drawer ? 'workspace-quick' : 'workspace-popover'} onMouseEnter={() => { if (drawer) setOpen(true); }} onMouseLeave={() => { if (drawer && !root.current?.contains(document.activeElement)) setOpen(false); }}>
    <button ref={trigger} className={drawer ? 'workspace-handle' : 'button secondary'} aria-label={label} aria-expanded={open} onClick={() => setOpen(drawer || !open)}>{drawer ? <Zap size={17}/> : <CalendarDays size={17}/>}</button>
    {open && <div className={drawer ? 'workspace-drawer' : 'workspace-popover-body'} role="region" aria-label={label}><div className="workspace-popover-heading"><strong>{label}</strong><button className="icon" aria-label={`Закрыть: ${label}`} onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16}/></button></div>{typeof children === 'function' ? children(() => { setOpen(false); trigger.current?.focus(); }) : children}</div>}
  </div>;
}

export function DatePickerPopover({ today, value, busy, onPick }: { today: string; value: string; busy: boolean; onPick: (date: string) => void }) {
  return <DismissiblePopover label="Выбрать дату">{close => <CalendarPicker key={value} today={today} value={value} busy={busy} onPick={date => { onPick(date); close(); }}/>}</DismissiblePopover>;
}
function CalendarPicker({ today, value, busy, onPick }: { today: string; value: string; busy: boolean; onPick: (date: string) => void }) {
  const [month, setMonth] = useState(() => new Date(`${value || today}T12:00:00Z`));
  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1, 12));
  const offset = (first.getUTCDay() + 6) % 7;
  const weekStart = (date: Date) => { const result = new Date(date); result.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7); return result.getTime(); };
  const currentWeek = weekStart(new Date(`${today}T12:00:00Z`));
  const days = Array.from({ length: 42 }, (_, index) => new Date(first.getTime() + (index - offset) * 86400000));
  const changeMonth = (delta: number) => setMonth(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1, 12)));
  return <><div className="workspace-calendar-heading"><button className="icon" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>←</button><strong>{month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button className="icon" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>→</button></div><div className="workspace-calendar">{['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => <span key={day}>{day}</span>)}{days.map(date => {
    const iso = date.toISOString().slice(0, 10);
    return <button key={iso} className={date.getUTCMonth() === month.getUTCMonth() ? '' : 'muted'} aria-label={iso} aria-current={iso === today ? 'date' : undefined} aria-pressed={iso === value} disabled={busy || Math.abs((weekStart(date) - currentWeek) / 604800000) > 52} onClick={() => onPick(iso)}>{date.getUTCDate()}</button>;
  })}</div><button className="text-button" disabled={busy} onClick={() => onPick(today)}>Перейти к сегодняшнему дню</button></>;
}

export function StudentTable({ items, busy, onOpen }: { items: Record<string, unknown>[]; busy: boolean; onOpen: (item: Record<string, unknown>) => void }) {
  const [query, setQuery] = useState('');
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const filtered = items.filter(item => text(item.fio_stud).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))).sort((a, b) => text(a.fio_stud).localeCompare(text(b.fio_stud), 'ru') * (ascending ? 1 : -1));
  const last = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const current = Math.min(page, last);
  const average = items.some(item => item.average !== undefined || item.avg_mark !== undefined);
  return <><div className="workspace-table-tools"><input type="search" aria-label="Поиск ученика" placeholder="Поиск ученика" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/><span>{filtered.length} из {items.length}</span></div><div className="table-scroll"><table><thead><tr><th aria-sort={ascending ? 'ascending' : 'descending'}><button className="text-button" onClick={() => setAscending(!ascending)}>Ученик {ascending ? '↑' : '↓'}</button></th><th>Присутствие</th><th>Контрольная</th><th>Работа на уроке</th>{average && <th>Средняя оценка</th>}</tr></thead><tbody>{filtered.slice(current * 25, (current + 1) * 25).map((student, index) => <tr key={text(student.id_stud) || index}><td><button className="student-name" disabled={busy || !student.id_stud} onClick={() => onOpen(student)}><span className="avatar purple" aria-hidden="true">{text(student.fio_stud).split(' ').slice(0, 2).map(word => word[0]).join('')}</span>{text(student.fio_stud) || 'Имя не получено'}</button></td><td>{({ '0': 'Отсутствует', '1': 'Присутствует', '2': 'Опоздал(а)' } as Record<string, string>)[text(student.was)] || 'Не отмечено'}</td><td>{text(student.mark2) || '—'}</td><td>{text(student.mark4) || '—'}</td>{average && <td>{text(student.average ?? student.avg_mark) || '—'}</td>}</tr>)}</tbody></table></div>{!filtered.length && <div className="empty">Ученики не найдены</div>}{last > 0 && <div className="workspace-table-tools"><button className="button secondary" disabled={!current} onClick={() => setPage(current - 1)}>Назад</button><span>{current + 1} / {last + 1}</span><button className="button secondary" disabled={current === last} onClick={() => setPage(current + 1)}>Далее</button></div>}</>;
}

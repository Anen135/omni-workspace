import { BookOpen } from 'lucide-react';
import { DatePickerPopover } from '../../components/DatePickerPopover';
import { label, rows, type Account, type RemoteRecord } from '../../services/omni-client';
import type { LessonDraft } from '../../features/lesson/lesson-draft';
import type { presentLessons } from '../../features/lesson/present-lessons';

export function LessonBanner({ account, fetchedAt, date, students, theme, draft }: {
  account: Account; fetchedAt: string; date: string; students: RemoteRecord[]; theme: string; draft?: LessonDraft;
}) {
  return <section className="lesson-banner"><span className="lesson-icon"><BookOpen size={25}/></span><div className="lesson-description"><div className="lesson-meta"><span>РЕАЛЬНЫЕ ДАННЫЕ</span><span>{date}</span></div><h2>{draft?.theme?.theme || theme || (students.length ? 'Текущее занятие' : 'Omni не вернул текущую пару')}</h2><div className="lesson-time">Обновлено {new Date(fetchedAt).toLocaleTimeString('ru-RU')} · {account.branch}{draft?.theme && ' · тема в черновике'}</div></div></section>;
}

export function LessonSaveBar({ busy, saving, draft, hasTheme, hasDrafts, unavailable, onSave, onDiscard }: {
  busy: boolean; saving: boolean; draft?: LessonDraft; hasTheme: boolean; hasDrafts: boolean; unavailable: string;
  onSave: () => void; onDiscard: () => void;
}) {
  return <div className="lesson-save-bar">
    <div role="status">{draft ? `Черновик: ${Object.keys(draft.attendance).length} отметок посещаемости · ${Object.keys(draft.marks).length} оценок · ${Object.keys(draft.rewards || {}).length} наград${draft.theme ? ' · тема урока' : ''}. В Omni ещё не сохранён.` : 'Посещаемость, оценки, топкойны и тема накапливаются в черновике до нажатия «Сохранить».'}
      {!hasTheme && !draft?.theme && <span> Добавьте тему в черновик, чтобы сохранить урок.</span>}
      {hasDrafts && <small> Черновики хранятся до закрытия или перезагрузки страницы.</small>}
    </div>
    <button className="button primary" disabled={busy || !draft || !!unavailable || (!hasTheme && !draft.theme)} onClick={onSave}>{saving ? 'Сохраняю…' : 'Сохранить'}</button>
    {draft && <button className="text-button" disabled={busy} onClick={onDiscard}>Отменить черновик</button>}
  </div>;
}

export function LessonSelectors({ date, today, presents, dayLessons, busy, onDatePick, onSchedule, onSlotPick }: {
  date: string; today: string; presents: RemoteRecord; dayLessons: ReturnType<typeof presentLessons>; busy: boolean;
  onDatePick: (date: string) => void; onSchedule: () => void; onSlotPick: (slot: string) => void;
}) {
  const currentSlot = label(presents.cur_lenta);
  const group = rows(presents.groups).find(item => label(item.id_tgroups) === label(presents.cur_group));
  return <>
    <div className="workspace-table-tools"><strong>Дата урока: {date || 'не выбрана'}</strong><DatePickerPopover unrestricted today={today} value={date || today} busy={busy} onPick={onDatePick}/><button className="button secondary" disabled={busy} onClick={onSchedule}>Выбрать пару в расписании</button><span>Группа: {label(group?.name_tgroups) || label(presents.cur_group) || '—'}</span><span>Пара: {label(presents.cur_lenta_number) || currentSlot || '—'}</span></div>
    {dayLessons.length > 0 && <div className="workspace-table-tools" role="group" aria-label="Пары выбранного дня"><label>Пара <select aria-label="Пара выбранного дня" disabled={busy} value={dayLessons.some(item => item.slot === currentSlot) ? currentSlot : ''} onChange={event => onSlotPick(event.target.value)}><option value="" disabled>Выберите пару</option>{dayLessons.map(item => <option key={item.slot} value={item.slot}>{item.title}{item.time ? ` · ${item.time}` : ''}</option>)}</select></label><span>{dayLessons.length} пар · список из раздела «Присутствующие» Omni</span></div>}
  </>;
}

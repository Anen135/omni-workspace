import { BookOpen, Save } from 'lucide-react';
import type { ReactNode } from 'react';
import { DatePickerPopover } from '../../components/DatePickerPopover';
import { label, rows, type Account, type RemoteRecord } from '../../services/omni-client';
import type { LessonDraft } from '../../features/lesson/lesson-draft';
import type { presentLessons } from '../../features/lesson/present-lessons';
import { HelpTip } from '../../components/ui/HelpTip';
import '../../features/lesson/lesson-materials.css';

export function LessonBanner({ account, fetchedAt, date, students, theme, draft, children, estimate }: {
  account: Account; fetchedAt: string; date: string; students: RemoteRecord[]; theme: string; draft?: LessonDraft;
  children?: ReactNode; estimate?: { amount: number | null; initial: boolean };
}) {
  return <section className="lesson-banner lesson-overview"><span className="lesson-icon"><BookOpen size={25}/></span><div className="lesson-description"><div className="lesson-meta"><span>РЕАЛЬНЫЕ ДАННЫЕ</span><span>{date}</span></div><h2>{draft?.theme?.theme || theme || (students.length ? 'Текущее занятие' : 'Omni не вернул текущую пару')}</h2><div className="lesson-time">Обновлено {new Date(fetchedAt).toLocaleTimeString('ru-RU')} · {account.branch}{draft?.theme && ' · тема в черновике'}</div></div>{estimate && <aside className="lesson-estimate" title={(estimate.initial ? 'Расчёт по начальным ставкам. ' : 'Расчёт по сохранённым ставкам. ') + 'Измените ставки в разделе «Доход». Это приблизительная оценка, а не подтверждённая выплата Omni.'}><span>{estimate.initial ? 'Начальные ставки' : 'Оценка за занятие'}</span><strong>{estimate.amount === null || !Number.isFinite(estimate.amount) ? 'Нет данных' : '≈ ' + new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(estimate.amount)}</strong></aside>}{children && <div className="lesson-overview-controls">{children}</div>}</section>;
}

export function LessonSaveBar({ busy, saving, draft, hasTheme, unavailable, onSave, onDiscard }: {
  busy: boolean; saving: boolean; draft?: LessonDraft; hasTheme: boolean; unavailable: string;
  onSave: () => void; onDiscard: () => void;
}) {
  if (!draft) return null;
  const canSave = !busy && !saving && !unavailable && (hasTheme || !!draft.theme);
  const needsLesson = unavailable === 'Выберите доступное занятие в Omni и загрузите урок.';
  return <div className="lesson-save-bar has-draft">
    <div className="lesson-save-status">
      <span role="status">{saving ? 'Сохраняю изменения и проверяю ответ Omni…' : `Черновик: ${Object.keys(draft.attendance).length} отметок посещаемости · ${Object.keys(draft.marks).length} оценок · ${Object.keys(draft.rewards || {}).length} наград${draft.theme ? ' · тема урока' : ''}. В Omni ещё не сохранён.`}</span>
      {!hasTheme && !draft.theme && <HelpTip label="Почему урок не готов к сохранению">Добавьте тему в черновик, чтобы сохранить урок.</HelpTip>}
      {needsLesson ? <HelpTip label="Как выбрать доступное занятие">{unavailable}</HelpTip> : unavailable && <span className="lesson-save-reason">{unavailable}</span>}
      <button className="text-button lesson-discard" disabled={busy} onClick={onDiscard}>Отменить черновик</button>
    </div>
    <div className="lesson-save-actions"><button className="button primary lesson-save-icon" aria-label="Сохранить" title={saving ? 'Сохранение урока…' : unavailable || (!hasTheme && !draft.theme ? 'Добавьте тему в черновик, чтобы сохранить урок.' : 'Сохранить')} disabled={!canSave} onClick={onSave}><Save size={20} aria-hidden="true"/></button></div>
  </div>;
}

export function LessonSelectors({ date, today, presents, dayLessons, busy, onDatePick, onSchedule, onSlotPick }: {
  date: string; today: string; presents: RemoteRecord; dayLessons: ReturnType<typeof presentLessons>; busy: boolean;
  onDatePick: (date: string) => void; onSchedule: () => void; onSlotPick: (slot: string) => void;
}) {
  const currentSlot = label(presents.cur_lenta);
  const group = rows(presents.groups).find(item => label(item.id_tgroups) === label(presents.cur_group));
  return <section className="lesson-context panel" aria-label="Выбор урока">
    <div className="lesson-context-row">
      <div className="lesson-context-date"><span>Дата урока</span><div><DatePickerPopover unrestricted today={today} value={date || today} busy={busy} onPick={onDatePick}/><strong>{date || 'не выбрана'}</strong></div></div>
      {dayLessons.length > 0 && <div className="lesson-context-slot" role="group" aria-label="Пары выбранного дня"><label>Пара<select aria-label="Пара выбранного дня" disabled={busy} value={dayLessons.some(item => item.slot === currentSlot) ? currentSlot : ''} onChange={event => onSlotPick(event.target.value)}><option value="" disabled>Выберите пару</option>{dayLessons.map(item => <option key={item.slot} value={item.slot}>{item.title}{item.time ? ` · ${item.time}` : ''}</option>)}</select></label></div>}
      <div className="lesson-context-current"><span>Группа: <strong>{label(group?.name_tgroups) || label(presents.cur_group) || '—'}</strong></span><span>Пара: <strong>{label(presents.cur_lenta_number) || currentSlot || '—'}</strong></span></div>
      <button className="button secondary" disabled={busy} onClick={onSchedule}>Выбрать пару в расписании</button>
    </div>
    {dayLessons.length > 0 && <div className="lesson-context-source help-heading"><span>{dayLessons.length} пар</span><HelpTip label="Об источнике списка пар">Список получен из раздела «Присутствующие» Omni.</HelpTip></div>}
  </section>;
}

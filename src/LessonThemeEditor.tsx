import { useState } from 'react';
import { label, record, type RemoteRecord } from './omni-client';
import { attendanceLessonInfo } from './attendance';

export type ThemeChoice = { theme: string; publicWeekId: string | null; issueHomework: boolean; issueLabwork: boolean; previousTheme: string };
export type ThemeData = { presents: RemoteRecord; themes: RemoteRecord[] };
export function LessonThemeEditor({ busy, unavailable, onLoad, onSave }: {
  busy: boolean; unavailable: string; onLoad: () => Promise<ThemeData>; onSave: (choice: ThemeChoice) => Promise<void>;
}) {
  const [data, setData] = useState<ThemeData | null>(null);
  const [selection, setSelection] = useState('manual');
  const [manual, setManual] = useState('');
  const [homework, setHomework] = useState(false);
  const [labwork, setLabwork] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const selected = data?.themes.find(item => String(item.public_week_id) === selection);
  const isEvent = data?.presents.scheduleType === 'event';
  const permission = data?.presents.can_set_theme;
  const denied = permission === false || permission === 0 || permission === '0';
  const theme = selected ? label(selected.theme) : manual;
  async function load() {
    try {
      const next = await onLoad();
      const info = attendanceLessonInfo(next.presents);
      const saved = next.themes.find(item => String(item.public_week_id) === String(info?.public_week_id));
      setData(next); setSelection(saved ? String(saved.public_week_id) : 'manual');
      setManual(label(next.presents.scheduleType === 'event' ? record(next.presents.scheduleData).theme : info?.theme));
      setHomework(!!saved && !!record(next.presents.homework).public_material_id);
      setLabwork(!!saved && !!record(next.presents.labwork).public_material_id);
      setBlocked(false);
    } catch { setBlocked(true); }
  }
  async function save() {
    if (!data || blocked || busy || !theme.trim()) return;
    if (selected && !window.confirm('Сохранить тему и применить выбранные параметры выдачи ДЗ и практической работы? Выданные материалы могут измениться.')) return;
    try {
      await onSave({ theme, publicWeekId: selected ? String(selected.public_week_id) : null, issueHomework: homework, issueLabwork: labwork, previousTheme: label(attendanceLessonInfo(data.presents)?.theme) });
      setData(null);
    } catch { setBlocked(true); }
  }
  return <section className="panel lesson-theme-editor" aria-label="Тема урока">
    <div className="panel-heading"><div><h2>Тема урока</h2><p>Выберите тему методпакета или укажите свою</p></div><button className="button secondary" disabled={busy || !!unavailable} onClick={() => void load()}>{data ? 'Обновить список тем' : 'Выбрать тему'}</button></div>
    {unavailable && <p className="attendance-help">{unavailable}</p>}
    {data && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {denied && <p role="status">Omni не разрешает изменять тему этого занятия.</p>}
      <fieldset disabled={busy || !!denied}>
        {!isEvent && <label>Тема из методпакета<select aria-label="Тема из методпакета" value={selection} onChange={event => { setSelection(event.target.value); setHomework(false); setLabwork(false); }}><option value="manual">Своя тема</option>{data.themes.map(item => <option key={String(item.public_week_id)} value={String(item.public_week_id)}>{label(item.theme)}</option>)}</select></label>}
        {!selected && <label>{isEvent ? 'Тема мероприятия' : 'Своя тема'}<input aria-label="Своя тема" value={manual} readOnly={isEvent} maxLength={2000} required onChange={event => setManual(event.target.value)}/></label>}
        {selected && <div className="theme-issue-options">
          {!!selected.has_homework && <label><input type="checkbox" checked={homework} onChange={event => setHomework(event.target.checked)}/>Выдать ДЗ из методпакета</label>}
          {!!selected.has_labwork && <label><input type="checkbox" checked={labwork} onChange={event => setLabwork(event.target.checked)}/>Выдать практическую работу</label>}
        </div>}
        {blocked && <p role="status">Перечитайте список тем и проверьте результат перед повторной отправкой.</p>}
        <button className="button primary" type="submit" disabled={blocked || !theme.trim()}>Сохранить тему</button>
      </fieldset>
    </form>}
  </section>;
}

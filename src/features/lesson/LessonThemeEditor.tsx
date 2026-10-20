import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { label, record, type RemoteRecord } from '../../services/omni-client';
import { attendanceLessonInfo } from './attendance';
import { HelpTip } from '../../components/ui/HelpTip';
import './lesson-materials.css';

export type ThemeChoice = { theme: string; publicWeekId: string | null; issueHomework: boolean; issueLabwork: boolean; previousTheme: string };
export type ThemeData = { presents: RemoteRecord; themes: RemoteRecord[] };
export function LessonThemeEditor({ busy, unavailable, currentTheme, draft, onLoad, onSave, embedded = false, onPreviewTheme, contextKey }: {
  busy: boolean; unavailable: string; currentTheme: string; draft?: ThemeChoice; onLoad: () => Promise<ThemeData>; onSave: (choice: ThemeChoice) => Promise<void>;
  embedded?: boolean; onPreviewTheme?: (theme: RemoteRecord) => void; contextKey?: unknown;
}) {
  const context = useMemo(() => ({}), [contextKey]);
  const activeContext = useRef<object | null>(context);
  activeContext.current = context;
  useEffect(() => {
    activeContext.current = context;
    return () => { if (activeContext.current === context) activeContext.current = null; };
  }, [context]);
  const [loaded, setLoaded] = useState<{ context: object; data: ThemeData } | null>(null);
  const data = loaded?.context === context ? loaded.data : null;
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
  const needsLesson = unavailable === 'Выберите доступное занятие в Omni и загрузите урок.';
  async function load() {
    try {
      const next = await onLoad();
      if (activeContext.current !== context) return;
      const info = attendanceLessonInfo(next.presents);
      const saved = next.themes.find(item => String(item.public_week_id) === String(info?.public_week_id));
      setLoaded({ context, data: next }); setSelection(draft ? (draft.publicWeekId || 'manual') : (saved ? String(saved.public_week_id) : 'manual'));
      setManual(draft?.theme || label(next.presents.scheduleType === 'event' ? record(next.presents.scheduleData).theme : info?.theme));
      setHomework(draft ? draft.issueHomework : !!saved && !!record(next.presents.homework).public_material_id);
      setLabwork(draft ? draft.issueLabwork : !!saved && !!record(next.presents.labwork).public_material_id);
      setBlocked(false);
    } catch { if (activeContext.current === context) setBlocked(true); }
  }
  async function save() {
    if (!data || blocked || busy || unavailable || denied || !theme.trim()) return;
    try {
      await onSave({ theme, publicWeekId: selected ? String(selected.public_week_id) : null, issueHomework: homework, issueLabwork: labwork, previousTheme: label(attendanceLessonInfo(data.presents)?.theme) });
      if (activeContext.current === context) setLoaded(null);
    } catch { if (activeContext.current === context) setBlocked(true); }
  }
  return <section className={(embedded ? 'lesson-theme-embedded' : 'panel') + ' lesson-theme-editor'} aria-label="Тема урока">
    <div className={embedded ? "lesson-theme-toolbar" : "panel-heading"}><div className="help-heading">{!embedded && <h2>Тема урока</h2>}<HelpTip label="О разделе «Тема урока»" icon={!currentTheme && !draft ? <CircleAlert size={16} aria-hidden="true"/> : undefined}>{!currentTheme && !draft && <>Тема ещё не сохранена. </>}{needsLesson ? unavailable : 'Выберите тему и добавьте её в черновик. Отправка в Omni — по кнопке «Сохранить».'}</HelpTip></div><button className="button secondary" disabled={busy || !!unavailable} onClick={() => void load()}>{data ? 'Обновить список тем' : 'Выбрать тему'}</button></div>
    {!embedded && !data && (draft || currentTheme) && <p className="attendance-help">{draft ? `Тема в черновике: ${draft.theme}` : `Текущая тема: ${currentTheme}`}</p>}
    {unavailable && !needsLesson && <p className="attendance-help">{unavailable}</p>}
    {data && <form onSubmit={event => { event.preventDefault(); void save(); }}>
      {denied && <p role="status">Omni не разрешает изменять тему этого занятия.</p>}
      <fieldset disabled={busy || !!unavailable || !!denied}>
        {!isEvent && <label>Тема из методпакета<select aria-label="Тема из методпакета" value={selection} onChange={event => { setSelection(event.target.value); setHomework(false); setLabwork(false); }}><option value="manual">Своя тема</option>{data.themes.map(item => <option key={String(item.public_week_id)} value={String(item.public_week_id)}>{label(item.theme)}</option>)}</select></label>}
        {!selected && <label>{isEvent ? 'Тема мероприятия' : 'Своя тема'}<input aria-label="Своя тема" value={manual} readOnly={isEvent} maxLength={2000} required onChange={event => setManual(event.target.value)}/></label>}
        {selected && <div className="theme-issue-options">
          {!!selected.has_homework && <label><input type="checkbox" checked={homework} onChange={event => setHomework(event.target.checked)}/>Выдать ДЗ из методпакета</label>}
          {!!selected.has_labwork && <label><input type="checkbox" checked={labwork} onChange={event => setLabwork(event.target.checked)}/>Выдать практическую работу</label>}
        </div>}
        {blocked && <p role="status">Перечитайте список тем и проверьте результат перед повторной отправкой.</p>}
        {selected && onPreviewTheme && <button className="button secondary" type="button" onClick={() => onPreviewTheme(selected)}>Материалы выбранной темы</button>}
        <button className="button primary" type="submit" disabled={blocked || !theme.trim()}>В черновик</button>
      </fieldset>
    </form>}
  </section>;
}

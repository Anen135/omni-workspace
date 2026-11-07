import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { LessonAccessData, LessonAccessTarget } from './lesson-access';

type Props = {
  target: LessonAccessTarget; busy: boolean; blockedDates: string[]; canSend: boolean;
  onLoad: () => Promise<LessonAccessData>;
  onSend: (date: string, message: string) => Promise<LessonAccessData & { message?: string }>;
  onOpen: (date: string) => void; onClose: () => void;
};
const displayDate = (date: string) => date.split('-').reverse().join('.');

export function LessonAccessDialog({ target, busy, blockedDates, canSend, onLoad, onSend, onOpen, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  const active = useRef(true), loading = useRef(false);
  const [data, setData] = useState<LessonAccessData | null>(null);
  const [date, setDate] = useState(target.date || '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sending, setSending] = useState(false);
  async function load() {
    if (loading.current) return;
    loading.current = true; setError('');
    try {
      const result = await onLoad();
      if (!active.current) return;
      setData(result);
      setDate(current => result.dates.includes(current) ? current : target.date ? '' : result.dates[0] || '');
    } catch (reason) { if (active.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Не удалось загрузить запросы.'); } }
    finally { loading.current = false; }
  }
  useEffect(() => {
    active.current = true;
    const tree = dialog.current?.getRootNode();
    const opener = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
    dialog.current?.showModal();
    void load();
    return () => { active.current = false; if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
    // The parent mounts this dialog for one captured account and date selection.
  }, []);
  const existing = data?.requests.some(row => row.date === date);
  const blocked = blockedDates.includes(date);
  async function send() {
    if (!data || busy || !canSend || blocked || existing || !data.dates.includes(date) || !message.trim()) return;
    setError(''); setNotice(''); setSending(true);
    try {
      const result = await onSend(date, message);
      if (active.current) { setData(result); setMessage(''); setNotice(result.message || 'Запрос отправлен. Проверьте статус в истории.'); }
    } catch (reason) {
      if (active.current) { setData(null); setError(reason instanceof Error ? reason.message : 'Не удалось подтвердить отправку запроса.'); }
    } finally { if (active.current) setSending(false); }
  }
  return <dialog ref={dialog} className="lesson-table-settings lesson-access-dialog" aria-labelledby={title}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      const tree = event.currentTarget.getRootNode();
      const focused = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
      const index = controls.findIndex(control => control === focused);
      event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
    }}
    onCancel={event => { event.preventDefault(); if (!sending) onClose(); }}
    onClick={event => { if (event.target === event.currentTarget && !sending) onClose(); }}>
    <div className="lesson-table-settings-heading"><h2 id={title}>Доступ к уроку за прошлый день</h2><button type="button" className="button secondary" autoFocus disabled={sending} onClick={onClose}><X size={15}/>Закрыть</button></div>
    {target.date && <p>Выбрана дата: <strong>{displayDate(target.date)}</strong>. Открыть урок можно после одобрения запроса.</p>}
    <div className="workspace-table-tools"><button type="button" className="button secondary" disabled={busy} onClick={() => void load()}>Обновить историю</button></div>
    {busy && <p role="status">{sending ? 'Отправляю запрос…' : 'Загружаю данные Omni…'}</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <fieldset disabled={busy || !canSend}>
          <label>Дата запроса<select aria-label="Дата запроса" value={date} onChange={event => { setDate(event.target.value); setNotice(''); }}>
            {!!data.dates.length && <option value="" disabled>Выберите дату</option>}
            {!data.dates.length && <option value="">Нет доступных дат</option>}
            {data.dates.map(value => <option key={value} value={value}>{displayDate(value)}</option>)}
          </select></label>
          <label>Причина запроса<textarea aria-label="Причина запроса" required maxLength={2000} rows={4} value={message} onChange={event => setMessage(event.target.value)}/></label>
          {target.date && !data.dates.includes(target.date) && !data.requests.some(row => row.date === target.date) && <p role="status">Omni не предоставил выбранную дату для запроса.</p>}
          {existing && <p role="status">Для этой даты уже есть запрос. Проверьте историю ниже.</p>}
          {blocked && <p role="alert">Отправка этой даты не подтверждена. Проверьте запрос в оригинальном Omni перед повторной отправкой.</p>}
          <button className="button primary" type="submit" disabled={!date || !message.trim() || !!existing || blocked}>Отправить запрос</button>
        </fieldset>
      </form>
      {!canSend && <p>Отправка запросов доступна через расширение браузера.</p>}
      <h3>История запросов</h3>
      {data.requests.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label="История запросов доступа"><table><thead><tr><th>Дата урока</th><th>Статус</th><th>Кто одобрил</th><th>Действие</th></tr></thead><tbody>{data.requests.map((row, index) => <tr key={`${row.date}:${index}`}><td>{displayDate(row.date)}</td><td>{row.status || 'Статус не получен'}</td><td>{row.approver || '—'}</td><td>{row.canOpen && <button type="button" className="button secondary" disabled={busy} onClick={() => onOpen(row.date)}>Открыть урок {displayDate(row.date)}</button>}</td></tr>)}</tbody></table></div> : <p>Запросов пока нет.</p>}
    </>}
  </dialog>;
}

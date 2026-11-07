import { useEffect, useId, useRef, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { attendanceLabels, attendanceStatus } from './attendance';
import { matchingLessonStudents, transferableMark, type CopySelection, type CopySource, type PreviousLessonData } from './lesson-copy';
import { rewardLevel } from './lesson-reward';
import { HelpTip } from '../../components/ui/HelpTip';

const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function PreviousLessonCopy({ busy, unavailable, students, date, slot, dayLessons, onLoad, onCopy }: {
  busy: boolean; unavailable: string; students: Record<string, unknown>[];
  date: string; slot: string; dayLessons: PreviousLessonData['dayLessons'];
  onLoad: (source: CopySource) => Promise<PreviousLessonData>; onCopy: (data: PreviousLessonData, selection: CopySelection) => void;
}) {
  const [open, setOpen] = useState(false);
  return <><button type="button" className="button secondary" disabled={busy || !!unavailable} title={unavailable} aria-label="Скопировать с прошлой пары" aria-haspopup="dialog" onClick={() => setOpen(true)}><Copy size={15}/><span className="lesson-copy-label">Скопировать с прошлой пары</span><span className="lesson-copy-label-short" aria-hidden="true">С прошлой пары</span></button>
    {open && <PreviousLessonCopyDialog busy={busy} unavailable={unavailable} students={students} date={date} slot={slot} dayLessons={dayLessons} onLoad={onLoad} onCopy={onCopy} onClose={() => setOpen(false)}/>}</>;
}

function PreviousLessonCopyDialog({ busy, unavailable, students, date, slot, dayLessons, onLoad, onCopy, onClose }: Parameters<typeof PreviousLessonCopy>[0] & { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const tree = dialog.current?.getRootNode();
    const opener = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
    dialog.current?.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  const earlier = dayLessons.filter(item => Number(item.slot) < Number(slot)).sort((a, b) => Number(a.slot) - Number(b.slot)).at(-1);
  const [sourceDate, setSourceDate] = useState(date);
  const [sourceSlot, setSourceSlot] = useState(earlier?.slot || '');
  const [data, setData] = useState<PreviousLessonData | null>(null);
  const [error, setError] = useState('');
  const [selection, setSelection] = useState<CopySelection>({ attendance: true, marks: true, rewards: true, overwrite: false });
  const matched = data ? matchingLessonStudents(students, data.students) : [];
  const sourceSlots = (data?.date === sourceDate ? data.dayLessons : sourceDate === date ? dayLessons : []).filter(item => sourceDate < date || Number(item.slot) < Number(slot));
  const selectedLoaded = !!data && data.date === sourceDate && data.slot === sourceSlot;
  async function load() {
    setError(''); setData(null);
    try { const result = await onLoad({ date: sourceDate, ...(sourceSlot ? { slot: sourceSlot } : {}) }); setData(result); setSourceSlot(result.slot); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось загрузить предыдущую пару.'); }
  }
  return <dialog ref={dialog} className="lesson-table-settings lesson-copy" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]')];
    const tree = event.currentTarget.getRootNode();
    const active = tree instanceof ShadowRoot ? tree.activeElement : document.activeElement;
    const index = controls.findIndex(control => control === active);
    event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
  }}>
    <div className="lesson-table-settings-heading"><h2 id={title}>Скопировать с прошлой пары</h2><button type="button" className="button secondary" autoFocus onClick={onClose}><X size={15}/>Закрыть</button></div>
    <div className="workspace-table-tools"><label>Дата прошлой пары<input type="date" aria-label="Дата прошлой пары" max={date} value={sourceDate} disabled={busy} onChange={event => { setSourceDate(event.target.value); setSourceSlot(''); }}/></label>
      {!!sourceSlots.length && <label>Пара<select aria-label="Прошлая пара" value={sourceSlot} disabled={busy} onChange={event => setSourceSlot(event.target.value)}><option value="" disabled>Выберите пару</option>{sourceSlots.map(item => <option key={item.slot} value={item.slot}>{item.title}{item.time ? ` · ${item.time}` : ''}</option>)}</select></label>}
      <button className="button secondary" disabled={busy || !!unavailable || !sourceDate || sourceDate > date || (sourceDate === date && !sourceSlot)} onClick={() => void load()}>Загрузить прошлую пару</button>
      {!earlier && sourceDate === date && <span>На этой дате более ранних пар нет. Выберите дату предыдущего занятия.</span>}
    </div>
    {error && <div className="attendance-help">{error === 'Выберите доступное занятие в Omni и загрузите урок.' ? <HelpTip label="Как выбрать доступное занятие">{error}</HelpTip> : <p role="alert">{error}</p>}</div>}
    {data && <>
      <div className="workspace-table-tools"><strong>{data.description}</strong><span>Совпали ученики: {matched.length} из {students.length}</span></div>
      {!selectedLoaded && <p className="attendance-help" role="status">Загрузите выбранную пару перед переносом.</p>}
      <div className="workspace-table-tools"><label><input type="checkbox" checked={selection.attendance} disabled={busy} onChange={event => setSelection(current => ({ ...current, attendance: event.target.checked }))}/>Посещаемость</label><label><input type="checkbox" checked={selection.marks} disabled={busy} onChange={event => setSelection(current => ({ ...current, marks: event.target.checked }))}/>Оценки</label></div>
      <div className="workspace-table-tools"><label><input type="checkbox" checked={!!selection.rewards} disabled={busy} onChange={event => setSelection(current => ({ ...current, rewards: event.target.checked }))}/>Топкойны</label></div>
      <div className="workspace-table-tools"><label><input type="checkbox" checked={!!selection.overwrite} disabled={busy} onChange={event => setSelection(current => ({ ...current, overwrite: event.target.checked }))}/>Заменить заполненные значения</label></div>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Предпросмотр копирования"><table><thead><tr><th>Ученик</th>{selection.attendance && <th>Присутствие</th>}{selection.marks && <><th>Контрольная</th><th>Работа на уроке</th></>}{selection.rewards && <th>Топкойны</th>}</tr></thead><tbody>{matched.map(match => <tr key={text(match.target.id_stud)}><td>{text(match.target.fio_stud) || 'Имя не получено'}</td>{selection.attendance && <td>{attendanceStatus(match.source.was) === null ? '—' : attendanceLabels[attendanceStatus(match.source.was)!]}</td>}{selection.marks && <>{([2, 4] as const).map(type => <td key={type}>{transferableMark(match.source[`mark${type}`]) ?? '—'}</td>)}</>}{selection.rewards && <td>{rewardLevel(match.source.prize) || '—'}</td>}</tr>)}</tbody></table></div>
      {!matched.length && <p className="attendance-help">На прошлой паре нет учеников, которых можно однозначно сопоставить с этой группой.</p>}
      <div className="workspace-table-tools"><button className="button primary" disabled={busy || !!unavailable || !selectedLoaded || !matched.length || (!selection.attendance && !selection.marks && !selection.rewards)} onClick={() => { onCopy(data, selection); }}>В черновик</button><span>{selection.overwrite ? 'Заполненные значения будут заменены, включая черновик.' : 'Будут заполнены только пустые значения.'}</span></div>
    </>}
  </dialog>;
}

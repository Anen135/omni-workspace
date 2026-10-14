import { useState } from 'react';
import { Copy, X } from 'lucide-react';
import { attendanceLabels, attendanceStatus } from './attendance';
import { matchingLessonStudents, transferableMark, type CopySelection, type CopySource, type PreviousLessonData } from './lesson-copy';
import { rewardLevel } from './lesson-reward';

const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
export function PreviousLessonCopy({ busy, unavailable, students, date, slot, dayLessons, onLoad, onCopy }: {
  busy: boolean; unavailable: string; students: Record<string, unknown>[];
  date: string; slot: string; dayLessons: PreviousLessonData['dayLessons'];
  onLoad: (source: CopySource) => Promise<PreviousLessonData>; onCopy: (data: PreviousLessonData, selection: CopySelection) => void;
}) {
  const earlier = dayLessons.filter(item => Number(item.slot) < Number(slot)).sort((a, b) => Number(a.slot) - Number(b.slot)).at(-1);
  const [open, setOpen] = useState(false);
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
  return <section className="panel lesson-copy" aria-label="Перенос с прошлой пары">
    <div className="panel-heading"><div><h2>С прошлой пары</h2><p>Перенос в черновик этого урока · отправка по кнопке «Сохранить»</p></div>
      <button className="button secondary" disabled={busy || !!unavailable} title={unavailable} aria-expanded={open} onClick={() => setOpen(!open)}><Copy size={15}/>Перенести с прошлой пары</button>
    </div>
    {open && <div className="workspace-table-tools"><label>Дата прошлой пары<input type="date" aria-label="Дата прошлой пары" max={date} value={sourceDate} disabled={busy} onChange={event => { setSourceDate(event.target.value); setSourceSlot(''); }}/></label>
      {!!sourceSlots.length && <label>Пара<select aria-label="Прошлая пара" value={sourceSlot} disabled={busy} onChange={event => setSourceSlot(event.target.value)}><option value="" disabled>Выберите пару</option>{sourceSlots.map(item => <option key={item.slot} value={item.slot}>{item.title}{item.time ? ` · ${item.time}` : ''}</option>)}</select></label>}
      <button className="button secondary" disabled={busy || !!unavailable || !sourceDate || sourceDate > date || (sourceDate === date && !sourceSlot)} onClick={() => void load()}>Загрузить прошлую пару</button>
      {!earlier && sourceDate === date && <span>На этой дате более ранних пар нет. Выберите дату предыдущего занятия.</span>}
    </div>}
    {error && <p className="attendance-help" role="alert">{error}</p>}
    {open && data && <>
      <div className="workspace-table-tools"><strong>{data.description}</strong><span>Совпали ученики: {matched.length} из {students.length}</span><button className="text-button" disabled={busy} aria-label="Закрыть перенос с прошлой пары" onClick={() => { setData(null); setOpen(false); }}><X size={15}/>Закрыть</button></div>
      {!selectedLoaded && <p className="attendance-help" role="status">Загрузите выбранную пару перед переносом.</p>}
      <div className="workspace-table-tools"><label><input type="checkbox" checked={selection.attendance} disabled={busy} onChange={event => setSelection(current => ({ ...current, attendance: event.target.checked }))}/>Посещаемость</label><label><input type="checkbox" checked={selection.marks} disabled={busy} onChange={event => setSelection(current => ({ ...current, marks: event.target.checked }))}/>Оценки</label></div>
      <div className="workspace-table-tools"><label><input type="checkbox" checked={!!selection.rewards} disabled={busy} onChange={event => setSelection(current => ({ ...current, rewards: event.target.checked }))}/>Топкойны</label><span>Награды переносятся только присутствующим и опоздавшим ученикам.</span></div>
      <div className="workspace-table-tools"><label><input type="checkbox" checked={!!selection.overwrite} disabled={busy} onChange={event => setSelection(current => ({ ...current, overwrite: event.target.checked }))}/>Заменить заполненные значения</label><span>Включая текущие значения в черновике.</span></div>
      <div className="table-scroll"><table><thead><tr><th>Ученик</th>{selection.attendance && <th>Присутствие</th>}{selection.marks && <><th>Контрольная</th><th>Работа на уроке</th></>}{selection.rewards && <th>Топкойны</th>}</tr></thead><tbody>{matched.map(match => <tr key={text(match.target.id_stud)}><td>{text(match.target.fio_stud) || 'Имя не получено'}</td>{selection.attendance && <td>{attendanceStatus(match.source.was) === null ? '—' : attendanceLabels[attendanceStatus(match.source.was)!]}</td>}{selection.marks && <>{([2, 4] as const).map(type => <td key={type}>{transferableMark(match.source[`mark${type}`]) ?? '—'}</td>)}</>}{selection.rewards && <td>{rewardLevel(match.source.prize) || '—'}</td>}</tr>)}</tbody></table></div>
      {!matched.length && <p className="attendance-help">На прошлой паре нет учеников, которых можно однозначно сопоставить с этой группой.</p>}
      <div className="workspace-table-tools"><button className="button primary" disabled={busy || !!unavailable || !selectedLoaded || !matched.length || (!selection.attendance && !selection.marks && !selection.rewards)} onClick={() => { onCopy(data, selection); }}>В черновик</button><span>{selection.overwrite ? 'Заполненные значения будут заменены.' : 'Будут заполнены только пустые значения.'} Пустые оценки и снятые награды не переносятся.</span></div>
    </>}
  </section>;
}

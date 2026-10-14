import { useState } from 'react';
import { attendanceLabels, attendanceStatus, type AttendanceStatus } from './attendance';
import { MarkEditor } from './MarkEditor';
import { RewardEditor } from './RewardEditor';
import { lessonRewardBudget, LESSON_REWARD_LIMIT, rewardMaximum, rewardLevel, type LessonReward } from './lesson-reward';

export function StudentTable({ items, busy, onOpen, attendance, marks, rewards }: { items: Record<string, unknown>[]; busy: boolean; onOpen: (item: Record<string, unknown>) => void; attendance?: { unavailable: string; saving: boolean; onChange: (item: Record<string, unknown>, was: AttendanceStatus) => void; onAll: () => void }; marks?: { unavailable: string; allowDraft?: boolean; onChange: (item: Record<string, unknown>, type: 2 | 4, mark: number) => void }; rewards?: { unavailable: string; onChange: (item: Record<string, unknown>, reward: LessonReward) => void } }) {
  const [query, setQuery] = useState('');
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const filtered = items.filter(item => text(item.fio_stud).toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))).sort((a, b) => text(a.fio_stud).localeCompare(text(b.fio_stud), 'ru') * (ascending ? 1 : -1));
  const last = Math.max(0, Math.ceil(filtered.length / 25) - 1);
  const current = Math.min(page, last);
  const average = items.some(item => item.average !== undefined || item.avg_mark !== undefined);
  const showRewards = !!rewards || items.some(item => Object.hasOwn(item, 'prize'));
  const rewardBudget = lessonRewardBudget(items);
  return <>
    <div className="workspace-table-tools">
      <input type="search" aria-label="Поиск ученика" placeholder="Поиск ученика" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/><span>{filtered.length} из {items.length}</span>
      {attendance && <button className="button secondary" title={attendance.unavailable || 'Вся группа, включая скрытых поиском учеников'} disabled={busy || !!attendance.unavailable || items.every(row => attendanceStatus(row.was) === 1)} onClick={attendance.onAll}>Все присутствуют</button>}
      {rewards && <span className="reward-budget" role="status" title="Локальный лимит на весь выбранный урок, включая учеников вне поиска и текущей страницы. Учитывает черновик.">{rewardBudget.used === null ? 'Топкойны: количество неизвестно · увеличение недоступно' : `Топкойны: ${rewardBudget.used} из ${LESSON_REWARD_LIMIT} · Осталось: ${rewardBudget.remaining}`}</span>}
    </div>
    {attendance?.unavailable && <p className="attendance-help">{attendance.unavailable}</p>}
    {attendance?.saving && <p className="attendance-help" role="status">Сохраняю изменения и проверяю ответ Omni…</p>}
    <div className="table-scroll"><table><thead><tr><th aria-sort={ascending ? 'ascending' : 'descending'}><button className="text-button" onClick={() => setAscending(!ascending)}>Ученик {ascending ? '↑' : '↓'}</button></th><th>Присутствие</th><th>Контрольная</th><th>Работа на уроке</th>{showRewards && <th>Топкойны</th>}{average && <th>Средняя оценка</th>}</tr></thead><tbody>{filtered.slice(current * 25, (current + 1) * 25).map((student, index) => {
      const was = attendanceStatus(student.was);
      return <tr key={text(student.id_stud) || index}>
        <td><button className="student-name" disabled={busy || !student.id_stud} onClick={() => onOpen(student)}><span className="avatar purple" aria-hidden="true">{text(student.fio_stud).split(' ').slice(0, 2).map(word => word[0]).join('')}</span>{text(student.fio_stud) || 'Имя не получено'}</button></td>
        <td>{attendance ? <select className={`attendance-select attendance-${was ?? 'unknown'}`} aria-label={`Присутствие: ${text(student.fio_stud)}`} value={was ?? ''} disabled={busy || !!attendance.unavailable || !student.id_stud} onChange={event => attendance.onChange(student, Number(event.target.value) as AttendanceStatus)}>
          <option value="" disabled>Не отмечено</option>
          {([1, 2, 0] as const).map(value => <option key={value} value={value}>{attendanceLabels[value]}</option>)}
        </select> : was === null ? 'Не отмечено' : attendanceLabels[was]}</td>
        {([2, 4] as const).map(type => <td key={type}>{marks ? <MarkEditor key={`${text(student.id_vizit)}:${text(student[`mark${type}`])}`} value={student[`mark${type}`]} label={`${type === 2 ? 'Контрольная' : 'Работа на уроке'}: ${text(student.fio_stud)}`} disabled={busy || !!marks.unavailable || (!marks.allowDraft && !(Number(student.id_vizit) > 0))} reason={marks.unavailable || (!marks.allowDraft && !(Number(student.id_vizit) > 0) ? 'Сначала сохраните тему и посещаемость этого урока.' : '')} onSave={mark => marks.onChange(student, type, mark)}/> : text(student[`mark${type}`]) || '—'}</td>)}
        {showRewards && <td>{rewards ? <RewardEditor value={student.prize} maximum={rewardMaximum(student.prize, rewardBudget.remaining)} label={`Топкойны: ${text(student.fio_stud)}`} disabled={busy || !!rewards.unavailable || !student.id_stud || (was !== 1 && was !== 2)} reason={rewards.unavailable || (was !== 1 && was !== 2 ? 'Топкойны доступны присутствующим и опоздавшим ученикам. Сначала отметьте посещаемость.' : '')} onChange={reward => rewards.onChange(student, reward)}/> : rewardLevel(student.prize) || '—'}</td>}
        {average && <td>{text(student.average ?? student.avg_mark) || '—'}</td>}
      </tr>;
    })}</tbody></table></div>
    {!filtered.length && <div className="empty">Ученики не найдены</div>}
    {last > 0 && <div className="workspace-table-tools"><button className="button secondary" disabled={!current} onClick={() => setPage(current - 1)}>Назад</button><span>{current + 1} / {last + 1}</span><button className="button secondary" disabled={current === last} onClick={() => setPage(current + 1)}>Далее</button></div>}
  </>;
}

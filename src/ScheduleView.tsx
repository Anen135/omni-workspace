import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { scheduleDays, type ScheduleLesson } from './schedule';
import { layoutLessons } from './schedule-layout';
import './schedule.css';

function displayDate(date: string) { const parts = date.split('-'); return parts.length === 3 ? `${parts[2]}.${parts[1]}` : date; }
function LessonContent({ lesson }: { lesson: ScheduleLesson }) {
  return <><span className="schedule-card-time">{lesson.start || 'Время не указано'}{lesson.end ? ` – ${lesson.end}` : ''}</span><strong>{lesson.subject}</strong>{lesson.group && <span>{lesson.group}</span>}{lesson.room && <span>Ауд. {lesson.room}</span>}{lesson.planned && <span>Запланировано</span>}</>;
}
export function ScheduleView({ data, today }: { data: unknown; today: string }) {
  const [mode, setMode] = useState<'week' | 'list'>('week');
  const days = scheduleDays(data);
  const layouts = days.map(day => layoutLessons(day.lessons));
  const all = layouts.flatMap(layout => layout.timed);
  const firstHour = Math.floor(Math.min(480, ...all.map(item => item.start)) / 60);
  const lastHour = Math.ceil(Math.max(1260, ...all.map(item => item.end)) / 60);
  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  if (!days.some(day => day.lessons.length)) return <div className="schedule-empty"><BookOpen size={28}/><h3>На эту неделю занятий нет</h3><p>Расписание успешно загружено из Omni.</p></div>;
  return <><div className="workspace-table-tools" aria-label="Вид расписания"><button className="button secondary" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Неделя</button><button className="button secondary" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>Список</button></div>{mode === 'list' ? <div className="schedule-list">{days.map(day => <section key={day.key}><h3>{day.name} · {displayDate(day.date)}</h3>{day.lessons.length ? day.lessons.map(lesson => <article key={lesson.key}><LessonContent lesson={lesson}/></article>) : <p>Нет занятий</p>}</section>)}</div> : <div className="schedule-grid-wrap"><div className="schedule-grid" style={{ gridTemplateColumns: `58px repeat(${days.length}, minmax(130px, 1fr))` }}>
    <div className="schedule-corner">Время</div>
    {days.map(day => <div key={day.key} className={`schedule-day-label ${day.date === today ? 'today' : ''}`}><strong>{day.shortName || day.name}</strong><time dateTime={day.date}>{displayDate(day.date)}</time></div>)}
    <div className="schedule-hours">{hours.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
    {days.map((day, index) => <div className={`schedule-column ${day.date === today ? 'today' : ''}`} style={{ height: hours.length * 72 }} key={day.key}>{layouts[index].timed.map(({ lesson, start, end, lane, lanes }) => <article tabIndex={0} title={[`${lesson.start} – ${lesson.end}`, lesson.subject, lesson.group, lesson.room && `Ауд. ${lesson.room}`, lesson.planned && 'Запланировано'].filter(Boolean).join(' · ')} className="schedule-card" key={lesson.key} style={{ top: (start - firstHour * 60) * 1.2, height: (end - start) * 1.2, left: `calc(${lane / lanes * 100}% + 3px)`, width: `calc(${100 / lanes}% - 6px)` }}><LessonContent lesson={lesson}/></article>)}</div>)}
    {layouts.some(layout => layout.untimed.length) && <><div className="schedule-corner">Без сетки</div>{layouts.map((layout, index) => <div className="schedule-unscheduled" key={days[index].key}>{layout.untimed.map(lesson => <article key={lesson.key}><LessonContent lesson={lesson}/><small>Полный интервал времени не получен</small></article>)}</div>)}</>}
  </div></div>}</>;
}

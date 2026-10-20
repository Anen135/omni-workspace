import { useId, useState } from 'react';
import { BookOpen, CalendarDays, List } from 'lucide-react';
import { scheduleDays, type ScheduleLesson } from './schedule';
import { layoutLessons, scheduleTimeBoundaries } from './schedule-layout';
import './schedule.css';

export type LessonEstimate = { amount: number | null; initial: boolean };
type Props = {
  data: unknown; today: string; onOpen?: (date: string, slot: string) => void; busy?: boolean;
  lessonEstimate?: (lesson: ScheduleLesson) => LessonEstimate;
};

function displayDate(date: string) { const parts = date.split('-'); return parts.length === 3 ? `${parts[2]}.${parts[1]}` : date; }
function boundaryTime(minutes: number) {
  const seconds = Math.round(minutes * 60);
  const time = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}`;
  return seconds % 60 ? `${time}:${String(seconds % 60).padStart(2, '0')}` : time;
}

function LessonContent({ lesson, onOpen, busy, estimate }: { lesson: ScheduleLesson; onOpen?: () => void; busy?: boolean; estimate?: LessonEstimate }) {
  const subjectId = useId();
  const amount = estimate?.amount;
  const estimateLabel = typeof amount === 'number' && Number.isFinite(amount) ? `≈ ${amount.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽` : '';
  const estimateHelp = `Предварительный расчёт по ${estimate?.initial ? 'начальным настройкам' : 'настройкам дохода'}. Это оценка занятия, а не начисленная зарплата.`;
  return <>
    <div className="schedule-card-meta"><span className="schedule-card-time">{lesson.start || 'Время не указано'}{lesson.end ? ` – ${lesson.end}` : ''}</span>{lesson.planned && <span className="schedule-planned">План</span>}</div>
    <strong className="schedule-card-subject" id={subjectId}>{lesson.subject}</strong>
    <div className="schedule-card-context">{lesson.group && <span>{lesson.group}</span>}{lesson.room && <span>Ауд. {lesson.room}</span>}</div>
    <div className="schedule-card-footer">{estimateLabel && <span className="schedule-card-estimate" tabIndex={0} title={estimateHelp} aria-label={`${estimateLabel}. ${estimateHelp}`}>{estimateLabel}</span>}{onOpen && <button className="text-button" aria-describedby={subjectId} disabled={busy} onClick={onOpen}>Открыть урок</button>}</div>
  </>;
}

export function ScheduleView({ data, today, onOpen, busy, lessonEstimate }: Props) {
  const [mode, setMode] = useState<'week' | 'list'>('week');
  const days = scheduleDays(data);
  const layouts = days.map(day => layoutLessons(day.lessons));
  const boundaries = scheduleTimeBoundaries(layouts);
  const intervals = boundaries.slice(0, -1);
  const hasUntimed = layouts.some(layout => layout.untimed.length);
  const dayWidths = layouts.map(layout => Math.max(1, ...layout.timed.map(item => item.lanes)) * 190);
  const content = (lesson: ScheduleLesson, date: string) => <LessonContent lesson={lesson} busy={busy} estimate={lessonEstimate?.(lesson)} onOpen={onOpen ? () => onOpen(date, lesson.slot) : undefined}/>;
  if (!days.some(day => day.lessons.length)) return <div className="schedule-empty"><BookOpen size={28}/><h3>На эту неделю занятий нет</h3><p>Расписание успешно загружено из Omni.</p></div>;

  return <div className="schedule-view">
    <div className="schedule-toolbar">
      <div><strong>План недели</strong><span>{days.reduce((count, day) => count + day.lessons.length, 0)} занятий · {days.length} дней</span></div>
      <div className="schedule-view-switch" role="group" aria-label="Вид расписания"><button className="button secondary" aria-pressed={mode === 'week'} onClick={() => setMode('week')}><CalendarDays size={15} aria-hidden="true"/>Неделя</button><button className="button secondary" aria-pressed={mode === 'list'} onClick={() => setMode('list')}><List size={15} aria-hidden="true"/>Список</button></div>
    </div>
    {mode === 'list' ? <div className="schedule-list">{days.map((day, index) => <section key={day.key} className={day.date === today ? 'schedule-agenda-today' : undefined}>
      <h3><time dateTime={day.date}>{displayDate(day.date)}</time><span>{day.name || day.shortName}</span><small>{day.lessons.length ? `${day.lessons.length} занятий` : 'Свободный день'}</small>{day.date === today && <span className="schedule-today-badge">Сегодня</span>}</h3>
      <div className="schedule-agenda-lessons">{day.lessons.length ? [...layouts[index].timed.map(item => item.lesson), ...layouts[index].untimed].map(lesson => <article key={lesson.key}>{content(lesson, day.date)}{layouts[index].untimed.includes(lesson) && <small className="schedule-time-warning">Точный интервал времени не определён</small>}</article>) : <p className="schedule-free-day">Нет занятий</p>}</div>
    </section>)}</div> : <>
      <p className="schedule-grid-help">Точное время указано в карточках. Интервалы могут растягиваться, чтобы показать занятие полностью. Прокрутите сетку по горизонтали или выберите «Список».</p>
      <div className="schedule-grid-wrap" tabIndex={0} role="region" aria-label="Недельная сетка расписания"><div className="schedule-grid" style={{
        gridTemplateColumns: `64px ${dayWidths.map(width => `minmax(${width}px, 1fr)`).join(' ')}`,
        gridTemplateRows: `64px ${intervals.map(() => 'minmax(28px, auto)').join(' ')}${hasUntimed ? ' auto' : ''}`,
        minWidth: 64 + dayWidths.reduce((sum, width) => sum + width, 0),
      }}>
        <div className="schedule-corner">Время</div>
        {days.map(day => <div key={day.key} className={`schedule-day-label ${day.date === today ? 'today' : ''}`}><strong>{day.shortName || day.name}</strong><time dateTime={day.date}>{displayDate(day.date)}</time>{day.date === today && <span className="schedule-today-badge">Сегодня</span>}</div>)}
        {!!intervals.length && <>
          <div className="schedule-hours" style={{ gridColumn: 1, gridRow: `2 / span ${intervals.length}` }}>{intervals.map((minute, index) => <time key={minute} data-minute={minute} className={minute % 60 === 0 ? 'schedule-whole-hour' : undefined} style={{ gridRow: index + 1 }}>{boundaryTime(minute)}</time>)}</div>
          {days.map((day, index) => <div className={`schedule-column ${day.date === today ? 'today' : ''}`} style={{ gridColumn: index + 2, gridRow: `2 / span ${intervals.length}` }} key={day.key}>
            {intervals.map((minute, row) => <div key={minute} data-minute={minute} className={`schedule-time-line ${minute % 60 === 0 ? 'schedule-whole-hour' : ''}`} style={{ gridRow: row + 1 }} aria-hidden="true"/>)}
            {layouts[index].timed.map(({ lesson, start, end, lane, lanes }) => <article tabIndex={0} className="schedule-card" key={lesson.key} data-lesson-key={lesson.key} data-start={start} data-end={end} style={{
              gridRow: `${boundaries.indexOf(start) + 1} / ${boundaries.indexOf(end) + 1}`,
              marginLeft: `calc(${lane / lanes * 100}% + 5px)`, width: `calc(${100 / lanes}% - 10px)`,
            }}>{content(lesson, day.date)}</article>)}
          </div>)}
        </>}
        {hasUntimed && <><div className="schedule-corner schedule-untimed-label" style={{ gridRow: intervals.length + 2 }}>Без времени</div>{layouts.map((layout, index) => <div className="schedule-unscheduled" style={{ gridColumn: index + 2, gridRow: intervals.length + 2 }} key={days[index].key}>{layout.untimed.map(lesson => <article key={lesson.key}>{content(lesson, days[index].date)}<small className="schedule-time-warning">Точный интервал времени не определён</small></article>)}</div>)}</>}
      </div></div>
    </>}
  </div>;
}

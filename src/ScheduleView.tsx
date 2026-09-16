import { BookOpen } from 'lucide-react';
import { scheduleDays } from './schedule';
import './schedule.css';

function displayDate(date: string) {
  const parts = date.split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : date;
}

export function ScheduleView({ data, today }: { data: unknown; today: string }) {
  const days = scheduleDays(data);
  const hasLessons = days.some(day => day.lessons.length);
  return <>
    <div className="live-calendar">{days.map(day => <div key={day.key} className={day.date === today ? 'today' : ''}><span>{day.shortName || day.name}</span><strong>{day.date.slice(8)}</strong></div>)}</div>
    {hasLessons ? <div className="schedule-days">{days.map(day => <section className={`schedule-day ${day.date === today ? 'schedule-today' : ''}`} key={day.key} aria-label={`${day.name} ${displayDate(day.date)}`}>
      <div className="schedule-day-heading"><h3>{day.name || day.shortName}<time dateTime={day.date}>{displayDate(day.date)}</time></h3>{day.date === today && <span>Сегодня</span>}</div>
      {day.lessons.length ? <ol className="schedule-lessons">{day.lessons.map(lesson => <li className="schedule-lesson" key={lesson.key}>
        <div className="schedule-time"><strong>{lesson.start || '—'} – {lesson.end || '—'}</strong><span>Пара {lesson.slot}</span></div>
        <div className="schedule-description"><h4>{lesson.subject}</h4><div>{lesson.group && <span>Группа: {lesson.group}</span>}{lesson.room && <span>{lesson.room}</span>}</div></div>
        {lesson.planned && <span className="schedule-planned">Запланировано</span>}
      </li>)}</ol> : <p className="schedule-empty-day">Нет занятий</p>}
    </section>)}</div> : <div className="empty"><BookOpen size={30}/><h3>На эту неделю занятий нет</h3><p>Расписание успешно загружено с сервера академии.</p></div>}
  </>;
}

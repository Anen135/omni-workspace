import { BookOpen, Clock3, MapPin, Users } from 'lucide-react';
import { scheduleDays } from './schedule';
import './schedule.css';

function displayDate(date: string) { const parts = date.split('-'); return parts.length === 3 ? `${parts[2]}.${parts[1]}` : date; }

export function ScheduleView({ data, today }: { data: unknown; today: string }) {
  const days = scheduleDays(data);
  const hasLessons = days.some(day => day.lessons.length);
  if (!hasLessons) return <div className="schedule-empty"><BookOpen size={28}/><h3>На эту неделю занятий нет</h3><p>Расписание успешно загружено из Omni.</p></div>;
  const hours = Array.from({ length: 14 }, (_, index) => index + 8);
  const position = (value: string, fallback: number) => { const match = value.match(/(\d{1,2})(?::(\d{2}))?/); const minutes = match ? Number(match[1]) * 60 + Number(match[2] || 0) : fallback * 60; return Math.max(0, Math.min((minutes - 8 * 60) / 60, 14)); };
  return <div className="schedule-grid-wrap"><div className="schedule-grid">
    <div className="schedule-corner">ВРЕМЯ</div>
    {days.map(day => <div key={day.key} className={`schedule-day-label ${day.date === today ? 'today' : ''}`}><strong>{day.shortName || day.name}</strong><time>{displayDate(day.date)}</time></div>)}
    <div className="schedule-hours">{hours.map(hour => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>
    {days.map(day => <div className={`schedule-column ${day.date === today ? 'today' : ''}`} key={day.key}>{hours.map(hour => <i key={hour} aria-hidden="true"/>)}{day.lessons.map(lesson => <article className="schedule-card" key={lesson.key} style={{ top: `${position(lesson.start, Number(lesson.slot) + 7) * 64}px`, minHeight: `${Math.max(58, (position(lesson.end, Number(lesson.slot) + 8) - position(lesson.start, Number(lesson.slot) + 7)) * 64)}px` }}><strong>{lesson.subject}</strong><span className="schedule-card-time"><Clock3 size={12}/>{lesson.start || 'Время не указано'}{lesson.end ? ` – ${lesson.end}` : ''}</span>{lesson.group && <span><Users size={12}/>{lesson.group}</span>}{lesson.room && <span><MapPin size={12}/>{lesson.room}</span>}</article>)}</div>)}
  </div></div>;
}

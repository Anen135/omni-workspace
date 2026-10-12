import { DatePickerPopover } from '../../components/DatePickerPopover';

export function ScheduleToolbar({ today, date, range, week, busy, onWeekChange, onDatePick }: {
  today: string; date: string; range: string; week: number; busy: boolean;
  onWeekChange: (week: number) => void; onDatePick: (date: string) => void;
}) {
  return <div className="schedule-tools">
    <button className="button secondary" aria-label="Предыдущая неделя" disabled={busy || week <= -52} onClick={() => onWeekChange(week - 1)}>←</button>
    <span>{range || 'Неделя без расписания'}</span>
    <button className="button secondary" aria-label="Следующая неделя" disabled={busy || week >= 52} onClick={() => onWeekChange(week + 1)}>→</button>
    <button className="button secondary" disabled={busy} onClick={() => onWeekChange(0)}>Сегодня</button>
    <DatePickerPopover today={today} value={date} busy={busy} onPick={onDatePick}/>
  </div>;
}

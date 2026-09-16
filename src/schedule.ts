type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' ? value as RecordValue : {};
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

export type ScheduleLesson = {
  key: string; slot: string; subject: string; group: string; room: string;
  start: string; end: string; planned: boolean;
};
export type ScheduleDay = { key: string; date: string; name: string; shortName: string; lessons: ScheduleLesson[] };

export function scheduleDays(value: unknown): ScheduleDay[] {
  const schedule = object(value);
  const names = object(schedule.days);
  const shortNames = object(schedule.daysShort);
  const body = object(schedule.body);
  return Object.entries(object(schedule.dates))
    .sort(([, a], [, b]) => text(a).localeCompare(text(b)))
    .map(([day, date]) => {
      const lessons: ScheduleLesson[] = [];
      // Omni indexes the timetable by slot first, then by weekday.
      for (const [slot, weekdays] of Object.entries(body)) {
        const lesson = object(object(weekdays)[day]);
        if (!Object.keys(lesson).length) continue;
        const time = object(object(object(schedule.lents)[slot])[day]);
        lessons.push({
          key: `${text(date)}:${slot}`,
          slot: text(lesson.lenta) || slot,
          subject: text(lesson.name_spec) || text(lesson.eventName) || 'Занятие',
          group: text(lesson.groups), room: text(lesson.num_rooms),
          // Actual lesson times can differ from the standard slot timetable.
          start: text(lesson.l_start) || text(time.l_start),
          end: text(lesson.l_end) || text(time.l_end),
          planned: lesson.scheduleType === 'planned',
        });
      }
      lessons.sort((a, b) => a.start.localeCompare(b.start) || Number(a.slot) - Number(b.slot));
      return { key: day, date: text(date), name: text(names[day]), shortName: text(shortNames[day]), lessons };
    });
}

import type { ScheduleLesson } from './schedule';
export function timeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] ?? 0) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]) + Number(match[3] ?? 0) / 60;
}
export function layoutLessons(lessons: ScheduleLesson[]) {
  const timed = lessons.flatMap(lesson => {
    const start = timeMinutes(lesson.start), end = timeMinutes(lesson.end);
    return start !== null && end !== null && end > start ? [{ lesson, start, end, lane: 0, lanes: 1 }] : [];
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster: typeof timed = [];
  let ends: number[] = [];
  const finish = () => { cluster.forEach(item => { item.lanes = ends.length; }); cluster = []; ends = []; };
  for (const item of timed) {
    if (cluster.length && ends.every(end => end <= item.start)) finish();
    let lane = ends.findIndex(end => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end; item.lane = lane; cluster.push(item);
  }
  finish();
  const placed = new Set(timed.map(item => item.lesson));
  return { timed, untimed: lessons.filter(lesson => !placed.has(lesson)) };
}

// A shared row can grow for full card content without moving another day's
// matching timestamp. Exact event boundaries stay aligned with the time rail.
export function scheduleTimeBoundaries(layouts: readonly ReturnType<typeof layoutLessons>[]): number[] {
  const timed = layouts.flatMap(layout => layout.timed);
  if (!timed.length) return [];
  const start = Math.floor(Math.min(...timed.map(item => item.start)) / 60) * 60;
  const end = Math.ceil(Math.max(...timed.map(item => item.end)) / 60) * 60;
  const boundaries = new Set<number>(timed.flatMap(item => [item.start, item.end]));
  for (let minute = start; minute <= end; minute += 60) boundaries.add(minute);
  return [...boundaries].sort((a, b) => a - b);
}

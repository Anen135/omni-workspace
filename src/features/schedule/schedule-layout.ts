import type { ScheduleLesson } from './schedule';
export function timeMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
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

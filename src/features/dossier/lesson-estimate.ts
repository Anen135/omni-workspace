import { incomeSummary, type IncomeConfig } from './income';
import { label, rows, type RemoteRecord } from '../../services/omni-client';

export type LessonEstimate = { amount: number | null; initial: boolean };
export function lessonEstimates(schedule: unknown, config: IncomeConfig, initial: boolean) {
  return new Map(incomeSummary(schedule, config).lessons.map(lesson => [lesson.key, { amount: lesson.amount, initial }]));
}
/** Collection keys and public slot numbers can differ: join on the explicit slot and group. */
export function currentLessonEstimate(schedule: unknown, config: IncomeConfig, initial: boolean, presents: RemoteRecord): LessonEstimate {
  const date = label(presents.cur_date || presents.today);
  const slot = label(presents.cur_lenta);
  const group = rows(presents.groups).find(row => label(row.id_tgroups) === label(presents.cur_group));
  const name = label(group?.name_tgroups).trim();
  const candidates = incomeSummary(schedule, config).lessons.filter(lesson => lesson.date === date && lesson.slot === slot
    && (name ? lesson.group === name : presents.scheduleType === 'event' && !lesson.group));
  return { amount: candidates.length === 1 ? candidates[0].amount : null, initial };
}

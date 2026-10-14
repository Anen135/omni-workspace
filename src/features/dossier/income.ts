import { scheduleDays } from '../schedule/schedule';
import type { Section } from '../../services/omni-client';

export type IncomeConfig = {
  defaultRate: number | null;
  masterclassRate: number | null;
  groupRates: Record<string, number | null>;
  payday: number;
  masterclassLessons: string[];
};
export type IncomeLesson = {
  key: string; date: string; slot: string; group: string; subject: string;
  event: string; masterclass: boolean; ambiguous: boolean; amount: number | null;
};
export const MAX_RATE = 1_000_000;
export const defaultIncomeConfig = (): IncomeConfig => ({ defaultRate: 700, masterclassRate: 650, groupRates: { 'П411': 1000 }, payday: 10, masterclassLessons: [] });
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export function parseRate(value: unknown): number | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const raw = String(value).trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return undefined;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate >= 0 && rate <= MAX_RATE ? rate : undefined;
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function nextPayday(today: string, payday: number): string | null {
  if (!validDate(today) || !Number.isInteger(payday) || payday < 1 || payday > 28) return null;
  const current = new Date(`${today}T00:00:00Z`);
  const next = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), payday));
  if (next < current) next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 10);
}

export function isMasterclassLabel(value: unknown): boolean {
  return text(value).toLocaleLowerCase('ru-RU').replace(/[\s\-–—‑]/g, '') === 'мастеркласс';
}

export function incomeSummary(schedule: unknown, config: IncomeConfig) {
  const source = object(schedule);
  const body = source.body && typeof source.body === 'object' ? Object.fromEntries(Object.entries(source.body)) : {};
  const lessons: IncomeLesson[] = [];
  const seen = new Set<string>();
  for (const day of scheduleDays(source)) {
    if (!validDate(day.date)) continue;
    for (const lesson of day.lessons) {
      if (seen.has(lesson.key)) continue;
      seen.add(lesson.key);
      const slotBody = body[lesson.key.slice(day.date.length + 1)];
      const weekdays = slotBody && typeof slotBody === 'object' ? Object.fromEntries(Object.entries(slotBody)) : {};
      const raw = object(weekdays[day.key]);
      const explicitMasterclass = isMasterclassLabel(raw.eventName) || isMasterclassLabel(raw.eventSubtypeName);
      const ambiguous = !explicitMasterclass && (!lesson.planned || !lesson.group.trim());
      const masterclass = explicitMasterclass || (ambiguous && config.masterclassLessons.includes(lesson.key));
      const group = lesson.group.trim();
      const amount = masterclass ? config.masterclassRate : ambiguous ? null
        : Object.hasOwn(config.groupRates, group) ? config.groupRates[group] : config.defaultRate;
      lessons.push({ key: lesson.key, date: day.date, slot: lesson.slot, group, subject: lesson.subject,
        event: text(raw.eventName) || text(raw.eventSubtypeName), masterclass, ambiguous, amount });
    }
  }
  const byGroup = new Map<string, { group: string; count: number; total: number; unpriced: number }>();
  let cents = 0;
  for (const lesson of lessons) {
    const key = lesson.masterclass ? `Мастер-классы${lesson.group ? ` · ${lesson.group}` : ''}` : lesson.group || 'Без группы';
    const row = byGroup.get(key) || { group: key, count: 0, total: 0, unpriced: 0 };
    row.count += 1;
    if (lesson.amount === null) row.unpriced += 1;
    else { cents += Math.round(lesson.amount * 100); row.total = (Math.round(row.total * 100) + Math.round(lesson.amount * 100)) / 100; }
    byGroup.set(key, row);
  }
  const dates = scheduleDays(source).map(day => day.date).filter(validDate).sort();
  return { lessons, total: cents / 100, count: lessons.length, unpriced: lessons.filter(lesson => lesson.amount === null).length,
    groups: [...new Set(lessons.map(lesson => lesson.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    byGroup: [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group, 'ru')),
    start: dates[0] || null, end: dates.at(-1) || null };
}

const DAY_MS = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (date: string) => new Date(`${date}T00:00:00Z`);
export const addIncomeDays = (date: string, days: number) => iso(new Date(dateAt(date).getTime() + days * DAY_MS));
export function incomeWeekStart(date: string): string {
  const day = dateAt(date).getUTCDay();
  return addIncomeDays(date, -(day || 7) + 1);
}
function monthStart(date: string, offset = 0) {
  const value = dateAt(date);
  return iso(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + offset, 1)));
}
export function addIncomeMonth(date: string): string {
  const value = dateAt(date);
  const lastDay = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 2, 0)).getUTCDate();
  return iso(new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, Math.min(value.getUTCDate(), lastDay))));
}
export type IncomePeriod = { start: string; end: string };
export type IncomeHistoryWeek = { week: number; schedule: Section };
export type IncomePeriodSummary = { total: number | null; knownTotal: number; count: number; unpriced: number; missingDays: number; complete: boolean };

/** Ranges use UTC calendar dates and an exclusive end. Today is not a completed day. */
export function incomePeriods(today: string, payday: number) {
  const payEnd = nextPayday(today, payday);
  if (!payEnd) throw new Error('Некорректная дата или день выплаты.');
  const value = dateAt(today);
  const pay = dateAt(payEnd);
  const payStart = iso(new Date(Date.UTC(pay.getUTCFullYear(), pay.getUTCMonth() - 1, payday)));
  const month = monthStart(today);
  const nextMonth = monthStart(today, 1);
  const ranges = {
    yearEarned: { start: `${value.getUTCFullYear()}-01-01`, end: today },
    previousMonth: { start: monthStart(today, -1), end: month },
    previousPayCycle: { start: iso(new Date(Date.UTC(pay.getUTCFullYear(), pay.getUTCMonth() - 2, payday))), end: payStart },
    monthEarned: { start: month, end: today },
    monthRemaining: { start: today, end: nextMonth },
    monthPlan: { start: month, end: nextMonth },
    nextMonth: { start: nextMonth, end: monthStart(today, 2) },
    rollingMonth: { start: today, end: addIncomeMonth(today) },
    payEarned: { start: payStart, end: today },
    payRemaining: { start: today, end: payEnd },
    payPlan: { start: payStart, end: payEnd },
  } satisfies Record<string, IncomePeriod>;
  const start = Object.values(ranges).map(range => range.start).sort()[0];
  const end = Object.values(ranges).map(range => range.end).sort().at(-1)!;
  const currentMonday = dateAt(incomeWeekStart(today)).getTime();
  const first = Math.round((dateAt(incomeWeekStart(start)).getTime() - currentMonday) / (DAY_MS * 7));
  const last = Math.round((dateAt(incomeWeekStart(addIncomeDays(end, -1))).getTime() - currentMonday) / (DAY_MS * 7));
  const weeks = Array.from({ length: last - first + 1 }, (_, index) => first + index).filter(week => week >= -52 && week <= 52);
  return { ranges, start, end, weeks, payday: payEnd, payStart, daysUntilPayday: Math.round((pay.getTime() - value.getTime()) / DAY_MS) };
}

export function incomeHistoryModel(history: IncomeHistoryWeek[], config: IncomeConfig, today: string) {
  const periods = incomePeriods(today, config.payday);
  const covered = new Set<string>();
  const byKey = new Map<string, IncomeLesson>();
  const currentMonday = incomeWeekStart(today);
  const seenWeeks = new Set<number>();
  for (const entry of history) {
    if (!Number.isInteger(entry.week) || !periods.weeks.includes(entry.week) || seenWeeks.has(entry.week) || entry.schedule.error) continue;
    seenWeeks.add(entry.week);
    const start = addIncomeDays(currentMonday, entry.week * 7);
    const end = addIncomeDays(start, 7);
    const data = object(entry.schedule.data);
    // A dated schedule is required. Never multiply a weekly template into other weeks.
    // PHP JSON responses encode empty collections as []; this is a valid
    // dated empty week, not a failed request or missing history.
    if (!data.body || typeof data.body !== 'object') continue;
    const dates = data.dates && typeof data.dates === 'object' ? Object.values(data.dates) : [];
    if (!dates.length || dates.some(date => typeof date !== 'string' || !validDate(date) || date < start || date >= end)) continue;
    for (const date of dates as string[]) covered.add(date);
    for (const lesson of incomeSummary(data, config).lessons) {
      if (lesson.date >= periods.start && lesson.date < periods.end && !byKey.has(lesson.key)) byKey.set(lesson.key, lesson);
    }
  }
  const lessons = [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || Number(a.slot) - Number(b.slot));
  function summarize(range: IncomePeriod): IncomePeriodSummary {
    const selected = lessons.filter(lesson => lesson.date >= range.start && lesson.date < range.end);
    const unpriced = selected.filter(lesson => lesson.amount === null).length;
    const knownTotal = selected.reduce((sum, lesson) => sum + (lesson.amount === null ? 0 : Math.round(lesson.amount * 100)), 0) / 100;
    let missingDays = 0;
    for (let date = range.start; date < range.end; date = addIncomeDays(date, 1)) if (!covered.has(date)) missingDays++;
    const complete = missingDays === 0 && unpriced === 0;
    return { total: complete ? knownTotal : null, knownTotal, count: selected.length, unpriced, missingDays, complete };
  }
  const metrics = Object.fromEntries(Object.entries(periods.ranges).map(([key, range]) => [key, summarize(range)])) as Record<keyof typeof periods.ranges, IncomePeriodSummary>;
  const monthLessons = lessons.filter(lesson => lesson.date >= periods.ranges.monthPlan.start && lesson.date < periods.ranges.monthPlan.end);
  const byGroup = new Map<string, { group: string; count: number; earned: number; remaining: number; total: number; unpriced: number }>();
  for (const lesson of monthLessons) {
    const group = lesson.masterclass ? `Мастер-классы${lesson.group ? ` · ${lesson.group}` : ''}` : lesson.group || 'Без группы';
    const row = byGroup.get(group) || { group, count: 0, earned: 0, remaining: 0, total: 0, unpriced: 0 };
    row.count++;
    if (lesson.amount === null) row.unpriced++;
    else {
      const field = lesson.date < today ? 'earned' : 'remaining';
      row[field] = (Math.round(row[field] * 100) + Math.round(lesson.amount * 100)) / 100;
      row.total = (Math.round(row.total * 100) + Math.round(lesson.amount * 100)) / 100;
    }
    byGroup.set(group, row);
  }
  const target = metrics.payPlan.total;
  const earned = metrics.payEarned.total;
  const payProgress = target !== null && earned !== null && target > 0 ? Math.min(100, earned / target * 100) : null;
  return { periods, metrics, lessons, groups: [...new Set(lessons.map(lesson => lesson.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')),
    byGroup: [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group, 'ru')), payProgress };
}

type IncomeStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const incomeStorageKey = (accountId: string, branch = '') => `omni-income-v1:${JSON.stringify([accountId, branch])}`;

export function readIncomeConfig(storage: IncomeStorage | null, accountId: string, branch = ''): { config: IncomeConfig; error: string | null } {
  const defaults = defaultIncomeConfig();
  try {
    const raw = storage?.getItem(incomeStorageKey(accountId, branch));
    if (!raw) return { config: defaults, error: storage ? null : 'Локальное хранилище недоступно.' };
    const value = object(JSON.parse(raw));
    const defaultRate = parseRate(value.defaultRate);
    const masterclassRate = parseRate(value.masterclassRate);
    const payday = value.payday;
    if (defaultRate === undefined || masterclassRate === undefined || typeof payday !== 'number' || !Number.isInteger(payday) || payday < 1 || payday > 28) throw new Error('Invalid configuration');
    const groupRates: IncomeConfig['groupRates'] = {};
    for (const [group, rate] of Object.entries(object(value.groupRates))) {
      const parsed = parseRate(rate);
      if (!group.trim() || group.length > 100 || parsed === undefined || group === '__proto__') throw new Error('Invalid rate');
      Object.defineProperty(groupRates, group, { value: parsed, enumerable: true, writable: true, configurable: true });
    }
    const masterclassLessons = Array.isArray(value.masterclassLessons) ? value.masterclassLessons.filter((key): key is string => typeof key === 'string' && key.length <= 100) : [];
    return { config: { defaultRate, masterclassRate, payday, groupRates, masterclassLessons }, error: null };
  } catch { return { config: defaults, error: 'Не удалось прочитать настройки дохода. Используются начальные ставки.' }; }
}

export function saveIncomeConfig(storage: IncomeStorage | null, accountId: string, branch: string, config: IncomeConfig): string | null {
  try {
    if (!storage) throw new Error('Unavailable storage');
    storage.setItem(incomeStorageKey(accountId, branch), JSON.stringify(config));
    return null;
  } catch { return 'Не удалось сохранить настройки. Проверьте доступ к локальному хранилищу.'; }
}

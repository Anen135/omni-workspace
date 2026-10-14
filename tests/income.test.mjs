import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/features/dossier/income.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { defaultIncomeConfig, incomeSummary, parseRate, nextPayday, readIncomeConfig, saveIncomeConfig, incomeStorageKey, isMasterclassLabel,
  incomePeriods, incomeHistoryModel, incomeWeekStart, addIncomeDays, addIncomeMonth } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const lesson = (group, extra = {}) => ({ groups: group, scheduleType: 'planned', name_spec: 'Тестовый предмет', lessons_count: '9', ...extra });
const schedule = body => ({ dates: { '1': '2026-10-12', '2': '2026-10-13' }, body });

test('income prices the supplied 20-pair week as 16 ordinary and 4 П411 pairs: 15200 rubles', () => {
  const groupsBySlot = {
    '1': { '6': 'С2411' },
    '2': { '6': 'С2411', '7': 'В4511' },
    '3': { '7': 'В4511' },
    '4': { '6': 'С2412' },
    '5': { '6': 'С2412', '7': 'В2413' },
    '6': { '1': '1411', '2': '3611', '3': '1411', '4': '3611', '5': '3411', '6': 'С4411', '7': 'В2413' },
    '7': { '2': 'П411', '4': 'П411', '5': '3411', '6': 'С4411' },
    '8': { '2': 'П411', '4': 'П411' },
  };
  const body = Object.fromEntries(Object.entries(groupsBySlot).map(([slot, weekdays]) => [slot,
    Object.fromEntries(Object.entries(weekdays).map(([day, group]) => [day, lesson(group, { lessons_count: /^[0-9]/.test(group) ? '8' : '9', eventName: group === 'П411' ? 'Отработка' : null })])),
  ]));
  const dates = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index + 1), `2026-10-${index + 12}`]));
  const result = incomeSummary({ dates, body }, defaultIncomeConfig());
  assert.equal(result.count, 20);
  assert.equal(result.total, 15200);
  assert.equal(result.unpriced, 0);
  assert.equal(result.byGroup.find(item => item.group === 'П411').count, 4);
});

test('income counts one actual date/slot pair, never lessons_count; prices planned П411 make-up lessons', () => {
  const result = incomeSummary(schedule({
    '1': { '1': lesson('С2411'), '2': lesson('С2411') },
    '2': { '1': lesson('П411', { eventName: 'Отработка' }) },
    '3': { '1': lesson('П411', { eventName: 'Мастер-класс' }) },
  }), defaultIncomeConfig());
  assert.equal(result.count, 4);
  assert.equal(result.total, 3050);
  assert.equal(result.unpriced, 0);
  assert.equal(result.lessons.filter(item => item.masterclass).length, 1);
  assert.equal(result.lessons.find(item => item.slot === '2').amount, 1000);
  assert.equal(result.start, '2026-10-12');
  assert.equal(result.end, '2026-10-13');
  assert.deepEqual(result.byGroup.find(item => item.group === 'С2411'), { group: 'С2411', count: 2, total: 1400, unpriced: 0 });
});

test('income does not infer event prices from activity/entity IDs; explicit local classification applies only to ambiguous events', () => {
  const data = schedule({
    '1': { '1': lesson('П411', { scheduleType: 'event', eventName: 'Событие', activity_type_id: '3', entity_id: '5' }) },
    '2': { '1': lesson('', { eventSubtypeName: 'Мастер – класс' }) },
    '3': { '1': lesson('', { eventName: 'Другое событие' }) },
    '4': { '1': lesson('С2411') },
  });
  const config = defaultIncomeConfig();
  assert.equal(incomeSummary(data, config).unpriced, 2);
  config.masterclassLessons = ['2026-10-12:1', '2026-10-12:4'];
  const result = incomeSummary(data, config);
  assert.equal(result.total, 2000);
  assert.equal(result.unpriced, 1);
  assert.equal(result.lessons.find(item => item.slot === '1').amount, 650);
  assert.equal(result.lessons.find(item => item.slot === '4').amount, 700);
  assert.equal(isMasterclassLabel(' МАСТЕР‑КЛАСС '), true);
  assert.equal(isMasterclassLabel('Мастер-класс / другое'), false);
});

test('income preserves zero vs missing rates, adds decimal amounts in cents and ignores invalid dates', () => {
  const config = { ...defaultIncomeConfig(), defaultRate: null, groupRates: { 'П411': 0, 'С2411': 0.1 }, masterclassRate: 0.2 };
  const result = incomeSummary(schedule({
    '1': { '1': lesson('П411'), '2': lesson('С2411') },
    '2': { '1': lesson('Другая группа') },
    '3': { '1': lesson('', { eventName: 'Мастер-класс' }) },
  }), config);
  assert.equal(result.total, 0.3);
  assert.equal(result.unpriced, 1);
  assert.equal(result.lessons[0].amount, 0);
  assert.equal(incomeSummary({ dates: { '1': '2026-02-30' }, body: { '1': { '1': lesson('С2411') } } }, config).count, 0);
  assert.equal(incomeSummary(null, config).count, 0);
  assert.equal(incomeSummary({ body: { '1': { '1': lesson('С2411') } } }, config).count, 0);
});

test('income rates validate bounded decimal money without converting missing to zero', () => {
  assert.equal(parseRate(''), null);
  assert.equal(parseRate(null), null);
  assert.equal(parseRate('0'), 0);
  assert.equal(parseRate('700,25'), 700.25);
  assert.equal(parseRate('1000000'), 1_000_000);
  for (const value of [undefined, true, {}, -1, Infinity, '1e3', '1 000', '5.001', '1000000.01', 'words']) assert.equal(parseRate(value), undefined, String(value));
});

test('income payday is inclusive today, rolls across year, bounds day and rejects impossible dates', () => {
  assert.equal(nextPayday('2026-10-09', 10), '2026-10-10');
  assert.equal(nextPayday('2026-10-10', 10), '2026-10-10');
  assert.equal(nextPayday('2026-12-11', 10), '2027-01-10');
  assert.equal(nextPayday('2026-10-14', 20), '2026-10-20');
  assert.equal(nextPayday('2026-02-30', 10), null);
  assert.equal(nextPayday('2026-10-14', 29), null);
  assert.equal(nextPayday('2026-10-14', 0), null);
});

test('income local configuration is isolated by account and branch, reads safely and reports storage failure', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const custom = { ...defaultIncomeConfig(), defaultRate: 0, groupRates: { 'П411': null }, payday: 20, masterclassLessons: ['2026-10-12:1'] };
  assert.equal(saveIncomeConfig(storage, 'teacher-a', 'branch-a', custom), null);
  assert.deepEqual(readIncomeConfig(storage, 'teacher-a', 'branch-a').config, custom);
  assert.deepEqual(readIncomeConfig(storage, 'teacher-b', 'branch-a').config, defaultIncomeConfig());
  assert.deepEqual(readIncomeConfig(storage, 'teacher-a', 'branch-b').config, defaultIncomeConfig());
  assert.notEqual(incomeStorageKey('a:b', 'c'), incomeStorageKey('a', 'b:c'));
  values.set(incomeStorageKey('bad', ''), '{bad');
  assert.ok(readIncomeConfig(storage, 'bad').error);
  values.set(incomeStorageKey('bad', ''), JSON.stringify({ ...custom, defaultRate: -1 }));
  assert.ok(readIncomeConfig(storage, 'bad').error);
  const failed = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(readIncomeConfig(failed, 'a').config, defaultIncomeConfig());
  assert.ok(saveIncomeConfig(failed, 'a', '', custom));
  assert.ok(saveIncomeConfig(null, 'a', '', custom));
});

const historyFor = (today, entries = {}, config = defaultIncomeConfig()) => incomePeriods(today, config.payday).weeks.map(week => {
  const monday = addIncomeDays(incomeWeekStart(today), week * 7);
  const dates = Object.fromEntries(Array.from({ length: 7 }, (_, index) => [String(index + 1), addIncomeDays(monday, index)]));
  const body = {};
  for (const [weekday, date] of Object.entries(dates)) {
    for (const [slot, value] of Object.entries(entries[date] || {})) {
      body[slot] ||= {};
      body[slot][weekday] = value;
    }
  }
  return { week, schedule: { data: { dates, body }, error: null } };
});

test('income accepts PHP empty-array weeks and keeps September and the closed October payday cycle', () => {
  const today = '2026-10-14';
  const history = historyFor(today, {
    '2026-09-01': { 1: lesson('С2411') },
    '2026-09-20': { 1: lesson('П411') },
    '2026-10-09': { 1: lesson('С2411') },
    '2026-10-10': { 1: lesson('П411') },
  }).map(entry => Object.keys(entry.schedule.data.body).length ? entry : {
    ...entry, schedule: { data: { ...entry.schedule.data, body: [] }, error: null },
  });
  const model = incomeHistoryModel(history, defaultIncomeConfig(), today);
  assert.equal(model.metrics.previousMonth.total, 1700);
  assert.equal(model.metrics.yearEarned.total, 3400);
  assert.deepEqual(model.periods.ranges.previousPayCycle, { start: '2026-09-10', end: '2026-10-10' });
  assert.equal(model.metrics.previousPayCycle.total, 1700);
  assert.equal(model.metrics.payEarned.total, 1000);
});

test('income preserves explicit master-class metadata in array-indexed schedules', () => {
  const data = { dates: { 0: '2026-10-12' }, body: [[lesson('МК', { scheduleType: 'event', eventName: 'Мастер-класс' })]] };
  const model = incomeSummary(data, defaultIncomeConfig());
  assert.equal(model.total, 650);
  assert.equal(model.unpriced, 0);
  assert.equal(model.lessons[0].masterclass, true);
});

test('income periods use actual calendar boundaries, clamp leap-month dates and include year crossings', () => {
  assert.equal(addIncomeMonth('2026-01-31'), '2026-02-28');
  assert.equal(addIncomeMonth('2024-01-31'), '2024-02-29');
  assert.equal(addIncomeMonth('2026-12-31'), '2027-01-31');
  const january = incomePeriods('2026-01-01', 10);
  assert.deepEqual(january.ranges.previousMonth, { start: '2025-12-01', end: '2026-01-01' });
  assert.deepEqual(january.ranges.yearEarned, { start: '2026-01-01', end: '2026-01-01' });
  assert.deepEqual(january.ranges.payPlan, { start: '2025-12-10', end: '2026-01-10' });
  const december = incomePeriods('2026-12-31', 10);
  assert.deepEqual(december.ranges.nextMonth, { start: '2027-01-01', end: '2027-02-01' });
  assert.ok(december.weeks.length > 52, 'history can span more than 52 weeks; only relative offsets are bounded');
  assert.ok(december.weeks.every(week => week >= -52 && week <= 52));
  assert.throws(() => incomePeriods('2026-02-30', 10));
});

test('income month/history metrics count real dates, exclude today from earned, and preserve cents', () => {
  const today = '2026-10-14';
  const config = { ...defaultIncomeConfig(), defaultRate: 0.1, groupRates: { 'П411': 0.2 } };
  const history = historyFor(today, {
    '2026-01-01': { 1: lesson('С2411') },
    '2026-09-30': { 1: lesson('П411') },
    '2026-10-01': { 1: lesson('С2411') },
    '2026-10-13': { 1: lesson('П411') },
    '2026-10-14': { 1: lesson('С2411') },
    '2026-10-31': { 1: lesson('С2411') },
    '2026-11-01': { 1: lesson('П411') },
    '2026-11-13': { 1: lesson('С2411') },
    '2026-11-14': { 1: lesson('П411') },
  }, config);
  const model = incomeHistoryModel(history, config, today);
  assert.equal(model.metrics.yearEarned.total, 0.6);
  assert.equal(model.metrics.previousMonth.total, 0.2);
  assert.equal(model.metrics.monthEarned.total, 0.3);
  assert.equal(model.metrics.monthRemaining.total, 0.2);
  assert.equal(model.metrics.monthPlan.total, 0.5);
  assert.equal(model.metrics.nextMonth.total, 0.5);
  assert.equal(model.metrics.rollingMonth.total, 0.5);
  assert.equal(model.metrics.monthPlan.count, 4);
  assert.equal(model.byGroup.find(row => row.group === 'С2411').earned, 0.1);
  assert.equal(model.byGroup.find(row => row.group === 'С2411').remaining, 0.2);
});

test('income pay cycle on day 10 is completed previous cycle; next day starts a new cycle', () => {
  const entries = {
    '2026-09-10': { 1: lesson('С2411') },
    '2026-10-09': { 1: lesson('С2411') },
    '2026-10-10': { 1: lesson('П411') },
    '2026-11-09': { 1: lesson('С2411') },
    '2026-11-10': { 1: lesson('П411') },
  };
  const today = '2026-10-10';
  const onPayday = incomeHistoryModel(historyFor(today, entries), defaultIncomeConfig(), today);
  assert.equal(onPayday.metrics.payPlan.total, 1400);
  assert.equal(onPayday.metrics.payEarned.total, 1400);
  assert.equal(onPayday.metrics.payRemaining.total, 0);
  assert.equal(onPayday.payProgress, 100);
  assert.equal(onPayday.periods.daysUntilPayday, 0);
  const tomorrow = '2026-10-11';
  const newCycle = incomeHistoryModel(historyFor(tomorrow, entries), defaultIncomeConfig(), tomorrow);
  assert.equal(newCycle.metrics.payPlan.total, 1700);
  assert.equal(newCycle.metrics.payEarned.total, 1000);
  assert.equal(newCycle.metrics.payRemaining.total, 700);
  assert.equal(newCycle.payProgress, 1000 / 1700 * 100);
});

test('income incomplete/unpriced periods are unknown, not false zero or 100 percent', () => {
  const today = '2026-10-14';
  const history = historyFor(today, { '2026-10-12': { 1: lesson('С2411') } });
  const broken = history.map(entry => entry.week === 0 ? { ...entry, schedule: { data: null, error: 'Unavailable week' } } : entry);
  const incomplete = incomeHistoryModel(broken, defaultIncomeConfig(), today);
  assert.equal(incomplete.metrics.monthEarned.total, null);
  assert.ok(incomplete.metrics.monthEarned.missingDays > 0);
  assert.equal(incomplete.metrics.previousMonth.total, 0, 'complete empty previous month is known zero');
  assert.equal(incomplete.payProgress, null);
  const missing = incomeHistoryModel(history, { ...defaultIncomeConfig(), defaultRate: null }, today);
  assert.equal(missing.metrics.monthEarned.total, null);
  assert.equal(missing.metrics.monthEarned.unpriced, 1);
  const free = incomeHistoryModel(history, { ...defaultIncomeConfig(), defaultRate: 0 }, today);
  assert.equal(free.metrics.monthEarned.total, 0);
  assert.equal(free.payProgress, null, 'zero target does not become 100 percent');
});

test('income history rejects repeated template dates, deduplicates same week/slot, and requires full coverage', () => {
  const today = '2026-10-14';
  const history = historyFor(today, { '2026-10-12': { 1: lesson('С2411') } });
  const actual = history.find(entry => entry.week === 0);
  const duplicate = incomeHistoryModel([...history, actual], defaultIncomeConfig(), today);
  assert.equal(duplicate.metrics.monthPlan.total, 700);
  assert.equal(duplicate.lessons.length, 1);
  const repeated = history.map(entry => entry.week === 1 ? { ...entry, schedule: actual.schedule } : entry);
  const rejected = incomeHistoryModel(repeated, defaultIncomeConfig(), today);
  assert.equal(rejected.metrics.monthPlan.total, null);
  assert.equal(rejected.lessons.length, 1, 'week template is never multiplied into another week');
  const partial = history.map(entry => entry.week === 0 ? { ...entry, schedule: { data: { dates: { 1: '2026-10-12' }, body: {} }, error: null } } : entry);
  assert.equal(incomeHistoryModel(partial, defaultIncomeConfig(), today).metrics.monthEarned.total, null);
});

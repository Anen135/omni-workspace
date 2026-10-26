import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5192, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
const section = data => ({ data, error: null });
const fixtureToday = '2026-10-14';
const monday = new Date('2026-10-12T00:00:00Z');
const weekOffsetFor = date => {
  const value = new Date(`${date}T00:00:00Z`);
  const start = new Date(value);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  return Math.round((start - monday) / (7 * 86400000));
};
const weekFor = offset => {
  const start = new Date(monday);
  start.setUTCDate(start.getUTCDate() + offset * 7);
  const dates = {}, days = {}, daysShort = {}, body = {};
  const dayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const shortNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  for (let day = 1; day <= 7; day++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + day - 1);
    dates[day] = date.toISOString().slice(0, 10);
    days[day] = dayNames[day - 1];
    daysShort[day] = shortNames[day - 1];
  }
  return { dates, days, daysShort, body };
};
const lesson = (group, name, eventName = null, scheduleType = 'planned') => ({
  lenta: '1', weekday: '1', groups: group, num_rooms: 'Кабинет тестовый', name_spec: name,
  id_form: '5', l_start: '09:00', l_end: '10:20', lessons_count: '9', activity_type_id: '3',
  entity_id: '5', scheduleType, eventName, eventSubtypeName: null,
});
const scheduleLessons = new Map();
function addLesson(date, slot, item) {
  if (!scheduleLessons.has(date)) scheduleLessons.set(date, []);
  scheduleLessons.get(date).push({ slot: String(slot), item });
}
// Fictional records exercise Jan 1+, last month, past/current/future dates and payday boundaries.
addLesson('2026-01-01', 1, lesson('С2411', 'Курс'));
addLesson('2026-09-10', 1, lesson('С2411', 'Курс'));
addLesson('2026-09-22', 1, lesson('П411', 'Базы данных'));
addLesson('2026-10-12', 1, lesson('С2411', 'Курс'));
addLesson('2026-10-13', 1, lesson('П411', 'Базы данных'));
addLesson('2026-10-14', 1, lesson('С2411', 'Курс'));
addLesson('2026-10-15', 1, lesson('С2411', 'Курс'));
addLesson('2026-10-20', 1, lesson('ТЕСТ-МК', 'Практика', 'Мастер-класс'));
addLesson('2026-11-09', 1, lesson('П411', 'Базы данных'));
addLesson('2026-11-10', 1, lesson('С2411', 'Курс'));
addLesson('2026-11-11', 1, lesson('С2411', 'Курс'));
addLesson('2026-11-13', 1, lesson('ТЕСТ-МК', 'Практика', 'Мастер-класс'));
function populatedWeek(offset) {
  const schedule = weekFor(offset);
  for (const [date, entries] of scheduleLessons) {
    const day = Object.entries(schedule.dates).find(([, value]) => value === date)?.[0];
    if (!day) continue;
    for (const { slot, item } of entries) {
      schedule.body[slot] ||= {};
      schedule.body[slot][day] = item;
    }
  }
  return schedule;
}
const schedule = {
  dates: { 1: '2026-10-12', 2: '2026-10-13', 3: '2026-10-14', 4: '2026-10-15', 5: '2026-10-16', 6: '2026-10-17', 7: '2026-10-18' },
  days: { 1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница', 6: 'Суббота', 7: 'Воскресенье' },
  daysShort: { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' },
  body: {
    1: { 1: lesson('С2411', 'Обычный курс'), 2: lesson('П411', 'Базы данных'), 3: lesson('ТЕСТ-МК', 'Практика', 'Мастер-класс'), 4: lesson('', 'Неизвестное событие', 'Неизвестное событие', 'event') },
    2: { 2: lesson('П411', 'Базы данных', 'Отработка') },
  },
};
let accountId = '101';
let branch = 'Филиал-тест';
let rangeMode = 'normal';
const requestedBatches = [];
let activeDataRequests = 0;
let dataActionOverlap = false;
const activeDataActions = new Map();
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date(`${fixtureToday}T09:00:00Z`));
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    const tracked = action === 'teacher-dossier' || action === 'schedule-range';
    if (tracked) {
      if (activeDataRequests > 0 && [...activeDataActions.keys()].some(active => active !== action)) dataActionOverlap = true;
      activeDataRequests++;
      activeDataActions.set(action, (activeDataActions.get(action) || 0) + 1);
      await new Promise(resolve => setTimeout(resolve, action === 'teacher-dossier' ? 50 : 10));
    }
    let body;
    if (action === 'status') body = { connected: true };
    else if (action === 'snapshot') body = {
      account: { id: accountId, name: `Тестовый преподаватель ${accountId}`, branch, timezone: 'Europe/Moscow' },
      teachers: section([]), schedule: section(populatedWeek(0)), presents: section({}), groups: section([]), homework: section([]), newHomework: section([]),
      counts: { homework: 0, practice: 0 }, fetchedAt: '2026-10-14T09:00:00.000Z',
    };
    else if (action === 'schedule-range') {
      const input = route.request().postDataJSON();
      assert.equal(input.accountId, accountId, 'schedule history is requested for the selected numeric account id');
      assert.ok(Array.isArray(input.weeks) && input.weeks.length <= 16, 'schedule-range requests contain at most sixteen offsets');
      assert.equal(new Set(input.weeks).size, input.weeks.length, 'schedule-range offsets are unique per request');
      requestedBatches.push([...input.weeks]);
      const weeks = input.weeks.map(offset => ({ week: offset, schedule: rangeMode === 'unavailable' || (rangeMode === 'partial-month' && offset === -2) || (rangeMode === 'partial' && offset === input.weeks[0])
        ? { data: populatedWeek(offset), error: 'Тестовая ошибка расписания' }
        : section(populatedWeek(offset)) }));
      body = { account: { id: accountId, name: `Тестовый преподаватель ${accountId}`, branch }, weeks };
    }
    else if (action === 'teacher-dossier') body = {
      account: { id: accountId, name: `Тестовый преподаватель ${accountId}` },
      single: section(null), graphics: section(null), all: section({}),
    };
    else throw new Error(`Unexpected API action ${action}`);
    await route.fulfill({ json: body });
    if (tracked) {
      activeDataRequests--;
      const remaining = activeDataActions.get(action) - 1;
      if (remaining) activeDataActions.set(action, remaining);
      else activeDataActions.delete(action);
    }
  });

  await page.goto('http://127.0.0.1:5192/');
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  const dossier = page.locator('.teacher-dossier');
  const income = dossier.getByRole('region', { name: 'Доходы', exact: true });
  await page.addStyleTag({ content: '.topbar,.sidebar,.quick-handle,.quick-drawer{display:none!important}.live-workspace main{margin-left:0!important;width:100%!important}' });
  await income.getByRole('button', { name: 'Загрузить историю за год', exact: true }).waitFor();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  const metric = label => income.locator('.dossier-summary-card').filter({ has: page.getByText(label, { exact: true }) }).locator('dd').first().innerText().then(value => value.replace(/\s+/g, ' ').trim());
  assert.equal(requestedBatches.length, 1, 'initial load requests only recent intervals');
  assert.equal(requestedBatches[0].length, 13, 'the valid supplied current week saves one read');
  await income.getByRole('button', { name: 'Загрузить историю за год', exact: true }).click();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.ok(requestedBatches.length >= 3, 'January-to-next-month history is loaded in batches no larger than sixteen weeks');
  assert.ok(requestedBatches.every(batch => batch.length <= 16 && new Set(batch).size === batch.length));
  assert.equal(await metric('Всего заработано с 1 января 2026'), '4 100 ₽');
  assert.equal(await metric('Заработано в прошлом месяце'), '1 700 ₽');
  assert.equal(await metric('Заработано в этом месяце'), '1 700 ₽', 'today is not counted as already earned');
  assert.equal(await metric('Осталось заработать в этом месяце'), '2 050 ₽', 'today and future October lessons remain projected');
  assert.equal(await metric('План на текущий месяц'), '3 750 ₽');
  assert.equal(await metric('Прогноз на следующий месяц'), '3 050 ₽');
  assert.equal(await metric('Прогноз на месяц вперёд'), '5 100 ₽');
  assert.equal(await metric('Заработано за расчётный цикл'), '1 700 ₽');
  assert.equal(await metric('Предыдущий расчётный цикл'), '1 700 ₽', 'September lessons appear in the closed September 10–October 10 cycle');
  assert.equal(await metric('Осталось заработать до выплаты'), '3 050 ₽');
  assert.equal(await metric('План за расчётный цикл'), '4 750 ₽');
  assert.match(await metric('Выполнено по сумме'), /35[,.]79\s*%/);
  assert.equal(await metric('Дней до выплаты'), '27');
  assert.equal(dataActionOverlap, false, 'dossier and schedule-range requests never overlap on the single Omni channel');

  rangeMode = 'partial';
  await income.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await income.getByRole('alert').filter({ hasText: 'Часть недель не загружена' }).waitFor();
  assert.match(await metric('Всего заработано с 1 января 2026'), /^≥ [\d ]+ ₽$/, 'a missing schedule week does not hide known income or claim an exact total');
  await income.getByText(/Дней без данных:/).first().waitFor();
  rangeMode = 'partial-month';
  await income.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await metric('Заработано в этом месяце'), '≥ 1 700 ₽', 'known October income remains visible when an earlier October week is unavailable');
  assert.equal(await metric('План на текущий месяц'), '≥ 3 750 ₽');
  rangeMode = 'unavailable';
  await income.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await metric('Заработано в этом месяце'), '—', 'fully unavailable income remains unknown');
  rangeMode = 'normal';
  await income.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await metric('Всего заработано с 1 января 2026'), '4 100 ₽', 'retry restores complete estimates');

  const settings = income.locator('details.dossier-income-settings');
  await settings.locator('summary').click();
  assert.equal(await settings.getByLabel('Стоимость пары П411, ₽').inputValue(), '1000');
  await settings.getByLabel('Обычная пара, ₽').fill('800');
  assert.equal(await metric('План на текущий месяц'), '3 750 ₽', 'editing a draft does not update the estimate before Save');
  await settings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  assert.equal(await metric('План на текущий месяц'), '4 050 ₽');
  await income.getByRole('status').getByText('Настройки дохода сохранены на этом устройстве.', { exact: true }).waitFor();
  await page.addStyleTag({ content: '.topbar,.sidebar,.quick-handle,.quick-drawer{display:none!important}.live-workspace main{margin-left:0!important;width:100%!important}' });
  await income.screenshot({ path: 'tmp/income-desktop.png' });

  await page.evaluate(() => localStorage.setItem('omni.workspace.tab', 'lesson'));
  await page.reload();
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  let incomeAfterReload = page.locator('.teacher-dossier').getByRole('region', { name: 'Доходы', exact: true });
  await incomeAfterReload.getByRole('button', { name: 'Загрузить историю за год', exact: true }).waitFor();
  await incomeAfterReload.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  const otherMetric = label => incomeAfterReload.locator('.dossier-summary-card').filter({ has: page.getByText(label, { exact: true }) }).locator('dd').first().innerText().then(value => value.replace(/\s+/g, ' ').trim());
  assert.equal(await otherMetric('План на текущий месяц'), '4 050 ₽', 'saved settings persist for this account and branch');

  accountId = '102';
  await page.evaluate(() => localStorage.setItem('omni.workspace.tab', 'lesson'));
  await page.reload();
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  incomeAfterReload = page.locator('.teacher-dossier').getByRole('region', { name: 'Доходы', exact: true });
  await incomeAfterReload.getByRole('button', { name: 'Загрузить историю за год', exact: true }).waitFor();
  await incomeAfterReload.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await otherMetric('План на текущий месяц'), '3 750 ₽', 'different account starts from its own defaults');
  const otherSettings = incomeAfterReload.locator('details.dossier-income-settings');
  await otherSettings.locator('summary').click();
  assert.equal(await otherSettings.getByLabel('Обычная пара, ₽').inputValue(), '700');
  await otherSettings.getByLabel('Обычная пара, ₽').fill('-1');
  await otherSettings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  await incomeAfterReload.getByRole('alert').waitFor();
  assert.match(await incomeAfterReload.getByRole('alert').innerText(), /Обычная пара|ставки/i);
  assert.equal(await otherMetric('План на текущий месяц'), '3 750 ₽', 'negative rate does not replace saved estimate');

  await otherSettings.getByLabel('Обычная пара, ₽').fill('700');
  await otherSettings.getByLabel('Мастер-класс, ₽').fill('');
  await otherSettings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  assert.equal(await otherMetric('План на текущий месяц'), '≥ 3 100 ₽', 'empty rate does not become zero and priced lessons remain visible');
  await incomeAfterReload.getByText(/Занятий без ставки: 1/).first().waitFor();
  assert.equal(await otherMetric('Без ставки в этом месяце'), '1');

  await otherSettings.getByLabel('Мастер-класс, ₽').fill('650');
  await otherSettings.getByLabel('Обычная пара, ₽').fill('0');
  await otherSettings.getByLabel('Стоимость пары П411, ₽').fill('0');
  await otherSettings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  assert.equal(await otherMetric('План на текущий месяц'), '650 ₽', 'zero is a valid explicit rate; regular and P411 lessons are free while masterclass retains its rate');
  await otherSettings.getByLabel('Мастер-класс, ₽').fill('');
  await otherSettings.getByRole('button', { name: 'Сохранить настройки дохода', exact: true }).click();
  assert.equal(await otherMetric('План на текущий месяц'), '≥ 0 ₽', 'known free lessons remain visible even when another lesson has no rate');

  branch = 'Филиал-другой';
  await page.evaluate(() => localStorage.setItem('omni.workspace.tab', 'lesson'));
  await page.reload();
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  incomeAfterReload = page.locator('.teacher-dossier').getByRole('region', { name: 'Доходы', exact: true });
  await incomeAfterReload.getByRole('button', { name: 'Загрузить историю за год', exact: true }).waitFor();
  await incomeAfterReload.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await otherMetric('План на текущий месяц'), '3 750 ₽', 'different branch has isolated income settings');

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'income settings fit the mobile viewport');
  await page.addStyleTag({ content: '.topbar,.sidebar,.quick-handle,.quick-drawer{display:none!important}.live-workspace main{margin-left:0!important;width:100%!important}' });
  await incomeAfterReload.screenshot({ path: 'tmp/income-mobile.png' });
  assert.deepEqual(pageErrors, []);
  assert.equal(dataActionOverlap, false, 'refresh keeps dossier and schedule-range API calls serialized');
  console.log('PASS: monthly/year/pay-cycle income metrics from unique batched schedule weeks, date boundaries and today exclusion, no concurrent Omni calls, partial-range retry, explicit save/reload, account/branch isolation, zero/invalid rates and mobile width. Fictional data only; no live academic writes.');
} finally { await browser?.close(); await server.close(); }

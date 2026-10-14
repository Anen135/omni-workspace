import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5191, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
const section = data => ({ data, error: null });
const account = { id: '101', name: 'Тестовый преподаватель', timezone: 'Europe/Moscow' };
const today = new Date(Date.UTC(2026, 9, 14));
const monday = new Date(today);
monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
function emptyWeek(offset) {
  const start = new Date(monday);
  start.setUTCDate(start.getUTCDate() + Number(offset) * 7);
  const dates = {}, days = {}, daysShort = {};
  const names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
  const short = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  for (let day = 1; day <= 7; day++) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + day - 1);
    dates[day] = date.toISOString().slice(0, 10);
    days[day] = names[day - 1];
    daysShort[day] = short[day - 1];
  }
  return { dates, days, daysShort, body: {} };
}
const escaped = '<img src=x onerror="window.injected=true">';
// Fictional values; field names follow the official dossier template/API bindings.
function allData() {
  return {
    profile_data: { fio_teach: account.name, post_teach: 'Преподаватель', email_teach: 'teacher@example.invalid', rating: { rating: 0, position: 2 }, id_teach: 'INTERNAL_ID_NOT_FOR_DISPLAY' },
    single_data: { count_pairs: { indicator_value: 0 }, average_attendance: { indicator_value: '82.5' }, count_marks: { indicator_value: null } },
    graphics_data: {
      count_pairs: Array.from({ length: 30 }, (_, index) => ({ month_date: new Date(Date.UTC(2024, index, 1)).toISOString().slice(0, 10), graphic_value: index })),
      average_attendance: [{ month_date: '2026-09-01', graphic_value: 82.5 }],
    },
    teach_specs_list: Array.from({ length: 25 }, (_, index) => ({ name_spec: index === 0 ? escaped : `Тестовый предмет ${index + 1}`, read_now: index % 2 })),
    percents: { count_pairs: { semestr: 0, month: '12.5', week: null } },
    evaluation: {
      single_data: {
        evaluation_homework: [{ translate_key: 'everything_is_clear_tag', value: 0 }],
        evaluation_lesson_teach: [{ translate_key: 'clearly_explains_tag', value: 4 }],
        evaluation_lesson: [{ translate_key: 'little_practice_tag', value: null }],
      },
      students_who_need_help: Array.from({ length: 25 }, (_, index) => ({ fio: `Тестовый студент ${index + 1}`, group: 'Тестовая группа', subject: 'Тестовый предмет', lesson_theme: index === 0 ? escaped : 'Тема занятия', date_next_lesson: '2026-10-20', percent_hw_completion: index === 0 ? 0 : null })),
    },
  };
}
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.clock.setFixedTime(new Date('2026-10-14T09:00:00Z'));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  let mode = 'normal', calls = 0;
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    let body;
    if (action === 'status') body = { connected: true };
    else if (action === 'snapshot') body = { account, teachers: section([]), schedule: section({}), presents: section({}), groups: section([]), homework: section([]), newHomework: section([]), counts: { homework: 0, practice: 0 }, fetchedAt: new Date().toISOString() };
    else if (action === 'schedule-range') {
      const input = route.request().postDataJSON();
      assert.equal(input.accountId, account.id, 'income schedule queries use the active numeric account id');
      const offsets = Array.isArray(input.weeks) ? input.weeks : Number.isInteger(input.weeks) ? Array.from({ length: input.weeks }, (_, index) => index) : [];
      assert.ok(offsets.length <= 16, 'a single schedule-range request is capped at sixteen weeks');
      assert.equal(new Set(offsets).size, offsets.length, 'requested week offsets are unique');
      const weeks = offsets.map(offset => ({ week: offset, schedule: section(emptyWeek(offset)) }));
      for (const { schedule } of weeks) {
        assert.equal(Object.keys(schedule.data.dates).length, 7, 'even an empty schedule has seven valid week dates');
        assert.deepEqual(Object.keys(schedule.data.body), []);
      }
      body = { account, weeks };
    }
    else if (action === 'teacher-dossier') {
      calls++; assert.deepEqual(route.request().postDataJSON(), {});
      const all = mode === 'empty' ? {} : allData();
      if (mode === 'partial') delete all.graphics_data;
      if (mode === 'delayed') await new Promise(resolve => setTimeout(resolve, 350));
      body = { account: mode === 'wrong' ? { ...account, id: '102' } : account, single: section(all.single_data ?? null), graphics: mode === 'partial' ? { data: null, error: 'Тестовая ошибка динамики' } : section(all.graphics_data ?? null), all: section(all) };
    } else throw new Error(`Unexpected action ${action}`);
    await route.fulfill({ json: body });
  });
  await page.goto('http://127.0.0.1:5191/');
  await page.getByRole('heading', { name: 'Мой урок', exact: true }).waitFor();
  assert.equal(calls, 0, 'dossier should load only after navigation');
  await page.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  const dossier = page.locator('.teacher-dossier');
  const income = dossier.getByRole('region', { name: 'Доходы', exact: true });
  await income.getByText('Всего заработано с 1 января 2026', { exact: true }).waitFor();
  await income.getByText(/^Загружаем расписание:/).waitFor({ state: 'detached' });
  assert.equal(await income.locator('.dossier-summary-card').filter({ has: page.getByText('Пар в этом месяце', { exact: true }) }).locator('dd').innerText(), '0', 'valid empty schedule weeks produce a real zero count');
  await dossier.getByText('teacher@example.invalid', { exact: true }).waitFor();
  for (const title of ['Профиль', 'Показатели', 'Динамика', 'Предметы', 'По периодам', 'Обратная связь', 'Нужна помощь']) assert.equal(await dossier.getByRole('heading', { name: title, exact: true }).count(), 1);
  const metric = label => dossier.locator('.dossier-summary-card').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
  assert.equal(await metric('Количество пар').innerText(), '0');
  assert.equal(await metric('Количество оценок').innerText(), '—');
  assert.match(await metric('Средняя посещаемость').innerText(), /82[.,]5\s*%/);
  const content = await dossier.innerText();
  for (const raw of ['single_data', 'graphic_value', 'month_date', 'id_teach', 'INTERNAL_ID_NOT_FOR_DISPLAY']) assert.ok(!content.includes(raw), `raw API metadata must not display: ${raw}`);
  assert.equal(await dossier.getByText(escaped, { exact: true }).count(), 2);
  assert.equal(await dossier.locator('img').count(), 0, 'API text must not become HTML');
  assert.equal(await page.evaluate(() => !!window.injected), false);
  const dynamics = dossier.locator('.dossier-section').filter({ has: page.getByRole('heading', { name: 'Динамика', exact: true }) });
  await dynamics.getByText('январь 2024 г.', { exact: true }).waitFor();
  assert.equal(await dynamics.locator('.dossier-series-row').count(), 12);
  await dynamics.getByRole('button', { name: 'Следующие периоды: Количество пар', exact: true }).click();
  await dynamics.getByText('январь 2025 г.', { exact: true }).waitFor();
  await dynamics.getByRole('button', { name: 'Следующие периоды: Количество пар', exact: true }).click();
  await dynamics.getByText('июнь 2026 г.', { exact: true }).waitFor();
  assert.equal(await dynamics.locator('.dossier-series-row').count(), 6);
  await dynamics.getByLabel('Показатель динамики', { exact: true }).selectOption('average_attendance');
  await dynamics.getByText('сентябрь 2026 г.', { exact: true }).waitFor();
  assert.equal(await dynamics.getByText('82,5 %', { exact: true }).count(), 1);
  const subjects = dossier.getByRole('region', { name: 'Предметы преподавателя', exact: true });
  assert.equal(await subjects.locator('tbody tr').count(), 20);
  await dossier.getByRole('button', { name: 'Следующие записи: Предметы преподавателя', exact: true }).click();
  await subjects.getByText('Тестовый предмет 25', { exact: true }).waitFor();
  assert.equal(await subjects.locator('tbody tr').count(), 5);
  const assistance = dossier.getByRole('region', { name: 'Студенты, которым нужна помощь', exact: true });
  await assistance.getByText('0 %', { exact: true }).waitFor();
  await dossier.getByRole('button', { name: 'Следующие записи: Студенты, которым нужна помощь', exact: true }).click();
  await assistance.getByText('Тестовый студент 25', { exact: true }).waitFor();
  for (const label of ['Всё понятно!', 'Понятно объясняет', 'Мало практики']) await dossier.getByText(label, { exact: true }).waitFor();
  mode = 'partial'; await dossier.getByRole('button', { name: 'Обновить досье', exact: true }).click();
  await dossier.getByText('Тестовая ошибка динамики', { exact: true }).waitFor();
  assert.equal(await dossier.getByText('teacher@example.invalid', { exact: true }).count(), 1);
  mode = 'normal'; await dossier.getByRole('button', { name: 'Повторить загрузку: Динамика', exact: true }).click();
  await dynamics.getByLabel('Показатель динамики', { exact: true }).waitFor();
  mode = 'empty'; await dossier.getByRole('button', { name: 'Обновить досье', exact: true }).click();
  await dossier.getByText('Omni не вернул студентов, которым нужна помощь.', { exact: true }).waitFor();
  const dossierMetrics = dossier.locator('.dossier-section').filter({ has: page.getByRole('heading', { name: 'Показатели', exact: true }) });
  assert.equal(await dossierMetrics.locator('.dossier-summary-card').count(), 0);
  assert.equal(await dossier.locator('.dossier-section tbody tr').count(), 0);
  mode = 'delayed'; await dossier.getByRole('button', { name: 'Обновить досье', exact: true }).click();
  await dossier.getByRole('status', { name: 'Загрузка: Показатели', exact: true }).waitFor();
  await dossier.getByText('teacher@example.invalid', { exact: true }).waitFor();
  await page.screenshot({ path: 'tmp/dossier-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no mobile document overflow');
  await page.screenshot({ path: 'tmp/dossier-mobile.png', fullPage: true });
  mode = 'wrong'; await dossier.getByRole('button', { name: 'Обновить досье', exact: true }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('teacher@example.invalid'));
  assert.equal(await page.getByText('Тестовый студент 1', { exact: true }).count(), 0, 'previous account data cleared');
  assert.deepEqual(errors, []);
  console.log('PASS: dossier human sections, verified-shape fixtures, zero/missing values, safe text, actual periods, pagination, loading, partial retry, empty, account mismatch and mobile layout. No live academic writes.');
} finally { await browser?.close(); await server.close(); }

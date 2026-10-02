import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const profile = await mkdtemp(resolve(tmpdir(), 'omni-extension-test-'));
const extension = resolve('dist-extension');
const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const stream = 'BT /F1 24 Tf 40 700 Td (Extension PDF fixture) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [];
  objects.forEach((object, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await worker.evaluate(pdf => {
    globalThis.fetch = async (url, options) => {
      if (url !== 'https://fs.top-academy.ru/api/v1/files/pdf-fixture' || options.credentials !== 'omit') throw new Error('Unexpected network request in fixture');
      const result = new Response(pdf, { headers: { 'Content-Type': 'application/pdf' } });
      Object.defineProperty(result, 'url', { value: url });
      return result;
    };
  }, pdf);
  const errors = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const paths = [];
  let signedIn = false;
  let teacherId = 1;
  let rejectSwitch = false;
  let rejectAttendance = false;
  let ignoreAttendance = false;
  let rejectTheme = false;
  let lessonDate = '2026-09-30';
  let rejectMark = false;
  const lessonStudents = [{ id_stud: 101, fio_stud: 'Тестовый ученик А', was: null, id_vizit: null, theme: '', primary_teach: 0 }, { id_stud: 102, fio_stud: 'Тестовый ученик Б', was: 2, id_vizit: 9, theme: '', primary_teach: 0 }];
  const empty = {};
  // All Omni responses are fictional: no real login, cookies or academic data.
  await context.route('https://omni.top-academy.ru/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && path === '/auth/logout') {
      signedIn = false;
      paths.push(path);
      return route.fulfill({ status: 302, headers: { location: 'https://omni.top-academy.ru/login/index' } });
    }
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="csrf-token" content="fixture-csrf"><title>Fixture Omni</title>${signedIn ? '' : '<input type="password">'}<script>globalThis.angular = { element: () => ({ injector: () => ({ get: () => ({ clearLocalStorage: () => sessionStorage.setItem('switch-cleaned', 'yes') }) }) }) };</script>` });
    if (path === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (request.method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    paths.push(path);
    assert.equal(request.method(), 'POST');
    assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
    let data = empty;
    if (path === '/profile/get-profile') data = { teach_info: { id_teach: teacherId, fio_teach: `Тестовый преподаватель ${teacherId}` } };
    if (path === '/auth/get-teach-list') data = [1, 2].map(id => ({ id_teach: id, fio_teach: `Тестовый преподаватель ${id}` }));
    if (path === '/auth/change-user') {
      assert.equal(request.headers()['id-local-hash'], 'fixture-hash');
      const input = request.postDataJSON();
      assert.deepEqual(Object.keys(input), ['id_user']);
      assert.ok(['1', '2'].includes(input.id_user));
      if (!rejectSwitch) teacherId = Number(input.id_user);
      data = { success: !rejectSwitch };
    }
    if (path === '/auth/get-start-info') data = { branch: { name: 'Тестовая академия' } };
    if (path === '/students/get-groups-list') data = [];
    if (path === '/schedule/get-schedule') data = { dates: { 1: '2026-09-29', 2: '2026-10-02' }, days: { 1: 'Вторник', 2: 'Пятница' }, body: { 0: { 1: { name_spec: 'Прошедший урок', l_start: '09:00', l_end: '10:30' }, 2: { name_spec: 'Будущий урок', l_start: '09:00', l_end: '10:30' } } } };
    if (path === '/presents/get-presents') {
      lessonDate = request.postDataJSON().date || '2026-09-30';
      const slot = Number(request.postDataJSON().lenta || 0);
      data = { cur_date: lessonDate, cur_group: 10, cur_lenta: slot, cur_schedule: slot === 4 ? 54 : 50, students: slot === 4 ? [] : lessonStudents, schedule: { 0: { name_spec: 'Первая пара', l_start: '09:00', l_end: '10:30' }, 4: { name_spec: 'Пара без учеников', l_start: '15:00', l_end: '16:30' } }, scheduleType: 'planned', can_set_theme: true, cur_spec: { id_spec: 3, source: 'fixture', id_base_spec: 4 } };
    }
    if (path === '/presents/set-mark') {
      assert.ok(['2026-09-29', '2026-10-02'].includes(lessonDate));
      const input = request.postDataJSON();
      const change = input.marks[0];
      assert.equal(change.vizit, 80);
      if (!rejectMark) lessonStudents[0][`mark${change.type}`] = change.mark;
      data = rejectMark ? { success: false, message: 'Период закрыт' } : { success: true };
    }
    if (path === '/presents/get-methodpackage-themes') data = [{ public_week_id: 7, package_id: 5, week: 1, theme: 'Тестовая тема', has_homework: true, has_labwork: true }];
    if (path === '/presents/set-theme') {
      const input = request.postDataJSON();
      assert.equal(input.schedule, 50); assert.equal(input.theme, 'Тестовая тема');
      assert.equal(input.public_week_id, 7); assert.equal(input.issue_homework, true); assert.equal(input.issue_labwork, false);
      assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
      if (!rejectTheme) lessonStudents.forEach((student, index) => { student.theme = input.theme; student.public_week_id = 7; student.id_vizit = 80 + index; student.was = 0; });
      data = rejectTheme ? { success: false, message: 'Тестовый отказ темы' } : { success: true };
    }
    if (path === '/presents/set-was') {
      const input = request.postDataJSON();
      assert.equal(input.schedule, 50);
      assert.equal(request.headers()['id-local-hash'], 'fixture-hash');
      for (const visit of Object.values(input.visits)) {
        assert.equal(visit.theme, 'Тестовая тема'); // Only the saved official topic.
        assert.equal(visit.id_schedule, 50);
        if (!rejectAttendance && !ignoreAttendance) {
          const student = lessonStudents.find(row => row.id_stud === visit.id_stud);
          student.was = visit.was; student.id_vizit ||= 8;
        }
      }
      data = rejectAttendance ? { error: 'Отметка запрещена сервером' } : { new_id_vizit: { 101: { id_vizit: 8 } } };
    }
    if (path === '/homework/get-new-homeworks') data = [{ filename: 'fixture.pdf', download_url_stud: 'https://fs.top-academy.ru/api/v1/files/pdf-fixture' }];
    assert.ok(signedIn);
    return route.fulfill({ json: data });
  });
  const ui = await context.newPage();
  ui.setDefaultTimeout(15000);
  await ui.goto(`chrome-extension://${id}/index.html`);
  await ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).waitFor();
  assert.equal(await ui.locator('input[type=password]').count(), 0);
  const [official] = await Promise.all([context.waitForEvent('page'), ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click()]);
  await official.waitForURL('https://omni.top-academy.ru/**');
  await official.waitForLoadState('domcontentloaded');
  assert.equal(new URL(official.url()).origin, 'https://omni.top-academy.ru');
  await official.locator('input[type=password]').waitFor();
  // Simulates completion of an official login, without ever sending a password.
  await official.evaluate(() => { document.querySelector('input').remove(); sessionStorage.setItem('IdLocalHash', 'fixture-hash'); });
  signedIn = true;
  await ui.getByRole('button', { name: 'Открыть официальный вход', exact: true }).click();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  await ui.getByRole('heading', { name: 'Мой урок' }).waitFor();
  assert.ok(paths.includes('/schedule/get-schedule'));
  assert.ok(paths.filter(path => path === '/profile/get-profile').length >= 2);
  const presence = ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true });
  const dayPairs = ui.getByLabel('Пара выбранного дня', { exact: true });
  assert.equal(await dayPairs.locator('option').count(), 3);
  await dayPairs.selectOption('4');
  await ui.getByRole('heading', { name: 'Выберите пару и группу', exact: true }).waitFor();
  assert.equal(await dayPairs.inputValue(), '4');
  assert.equal(await dayPairs.isEnabled(), true);
  await dayPairs.selectOption('0');
  await presence.waitFor();
  assert.equal(await presence.isEnabled(), true); // Empty lesson theme must not block attendance.
  await presence.selectOption('1');
  await ui.getByText(/Черновик: 1 отметок/).waitFor();
  assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Отменить черновик', exact: true }).click();
  assert.equal(await presence.inputValue(), '');
  await presence.selectOption('1');
  await presence.selectOption('2');
  assert.equal(await presence.inputValue(), '2');
  await presence.selectOption('1');
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.waitForFunction(() => !document.querySelector('.attendance-select')?.disabled);
  assert.equal(await presence.inputValue(), '1'); // Reload preserves local draft.
  assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
  await ui.getByRole('button', { name: 'Выбрать тему', exact: true }).click();
  await ui.getByLabel('Тема из методпакета', { exact: true }).selectOption('7');
  await ui.getByRole('checkbox', { name: 'Выдать ДЗ из методпакета' }).check();
  rejectTheme = true;
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сохранить тему', exact: true }).click();
  await ui.getByRole('alert').filter({ hasText: 'Тестовый отказ темы' }).waitFor();
  assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
  assert.equal(await presence.inputValue(), '1');
  assert.equal(await ui.getByRole('button', { name: 'Сохранить тему', exact: true }).isDisabled(), true);
  rejectTheme = false;
  await ui.getByRole('button', { name: 'Обновить список тем', exact: true }).click();
  await ui.getByLabel('Тема из методпакета', { exact: true }).selectOption('7');
  await ui.getByRole('checkbox', { name: 'Выдать ДЗ из методпакета' }).check();
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сохранить тему', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Посещаемость сохранена' }).waitFor().catch(async error => {
    console.error('Attendance fixture failure:', await ui.getByRole('alert').allTextContents(), paths.slice(-10));
    throw error;
  });
  assert.equal(await presence.inputValue(), '1');
  assert.equal(lessonStudents[0].id_vizit, 80); // Theme-created visit, not old draft metadata.
  await presence.selectOption('2');
  await ui.waitForFunction(() => document.querySelector('.attendance-select')?.value === '2' && !document.querySelector('.attendance-select')?.disabled);
  await presence.selectOption('0');
  await ui.waitForFunction(() => document.querySelector('.attendance-select')?.value === '0' && !document.querySelector('.attendance-select')?.disabled);
  const writesBeforeAll = paths.filter(path => path === '/presents/set-was').length;
  ui.once('dialog', dialog => dialog.dismiss());
  await ui.getByRole('button', { name: 'Все присутствуют', exact: true }).click();
  assert.equal(paths.filter(path => path === '/presents/set-was').length, writesBeforeAll);
  await ui.getByLabel('Поиск ученика', { exact: true }).fill('ученик А');
  ui.once('dialog', dialog => { assert.match(dialog.message(), /включая скрытых поиском/); return dialog.accept(); });
  await ui.getByRole('button', { name: 'Все присутствуют', exact: true }).click();
  await ui.waitForFunction(() => document.querySelector('.attendance-select')?.value === '1' && !document.querySelector('.attendance-select')?.disabled);
  assert.deepEqual(lessonStudents.map(row => row.was), [1, 1]);
  rejectAttendance = true;
  await presence.selectOption('0');
  await ui.getByRole('alert').filter({ hasText: 'Отметка запрещена сервером' }).waitFor();
  assert.equal(await presence.inputValue(), '1');
  assert.equal(await presence.isDisabled(), true);
  rejectAttendance = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await presence.waitFor();
  await ui.waitForFunction(() => !document.querySelector('.attendance-select')?.disabled);
  assert.equal(await presence.inputValue(), '1');
  ignoreAttendance = true;
  await presence.selectOption('0');
  await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил все отметки' }).waitFor();
  assert.equal(await presence.inputValue(), '1');
  assert.equal(await presence.isDisabled(), true);
  ignoreAttendance = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.waitForFunction(() => !document.querySelector('.attendance-select')?.disabled);
  for (const [index, date, type, value] of [[0, '2026-09-29', 'Контрольная', '10'], [1, '2026-10-02', 'Работа на уроке', '11']]) {
    await ui.getByRole('button', { name: 'Расписание', exact: true }).click();
    await ui.getByRole('button', { name: 'Открыть урок', exact: true }).nth(index).click();
    await ui.getByText(`Дата урока: ${date}`, { exact: true }).waitFor();
    const gradeLabel = `${type}: Тестовый ученик А`;
    await ui.getByRole('button', { name: gradeLabel, exact: true }).click();
    await ui.getByRole('spinbutton', { name: gradeLabel, exact: true }).fill(value);
    await ui.locator('.mark-editor').getByRole('button', { name: 'Сохранить', exact: true }).click();
    await ui.getByRole('status').filter({ hasText: 'Оценка сохранена в Omni' }).waitFor();
    assert.equal(await ui.getByRole('button', { name: gradeLabel, exact: true }).textContent(), value);
    await presence.selectOption(index === 0 ? '0' : '1');
    await ui.getByRole('status').filter({ hasText: 'Посещаемость сохранена в Omni' }).waitFor();
    assert.equal(lessonDate, date);
  }
  rejectMark = true;
  await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).click();
  await ui.getByRole('spinbutton', { name: 'Контрольная: Тестовый ученик А', exact: true }).fill('9');
  await ui.locator('.mark-editor').getByRole('button', { name: 'Сохранить', exact: true }).click();
  await ui.getByRole('alert').filter({ hasText: 'Период закрыт' }).waitFor();
  assert.equal(lessonStudents[0].mark2, 10);
  assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).isDisabled(), true);
  rejectMark = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.waitForFunction(() => !document.querySelector('.attendance-select')?.disabled);
  await ui.getByRole('button', { name: 'Домашние задания', exact: true }).click();
  await ui.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
  await ui.locator('.remote-attachment canvas[data-rendered="true"]').waitFor();
  const external = await worker.evaluate(async () => {
    const { omniTabId } = await chrome.storage.session.get('omniTabId');
    const result = await chrome.scripting.executeScript({ target: { tabId: omniTabId }, func: () => chrome.runtime.sendMessage({ action: 'status', input: {} }) });
    return result[0].result;
  });
  assert.equal(external.error.code, 'FORBIDDEN');
  const forbidden = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'eval', input: { code: 'alert(1)' } }));
  assert.equal(forbidden.error.code, 'BAD_INPUT');
  const actAs = ui.getByLabel('Работаю от имени', { exact: true });
  assert.equal(await actAs.isEnabled(), true);
  const capabilities = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'capabilities', input: {} }));
  assert.equal(capabilities.data.teacherSwitch, true);
  assert.equal(capabilities.data.version, manifest.version);
  assert.equal(capabilities.data.accountSwitch, true);
  const malformed = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '', accountId: '1' } }));
  assert.match(malformed.error.message, /идентификатор выбранного преподавателя/);
  const denied = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '999', accountId: '1' } }));
  assert.equal(denied.error.code, 'TEACHER_NOT_ALLOWED');
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  const stale = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'switch-teacher', input: { teacherId: '2', accountId: '9' } }));
  assert.equal(stale.error.code, 'ACCOUNT_CHANGED');
  // Simulate a new interface talking to the pre-switching background worker.
  await ui.evaluate(() => {
    const send = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = message => message.action === 'capabilities'
      ? Promise.resolve({ error: { code: 'BAD_INPUT', message: 'Команда или параметры не поддерживаются.' } })
      : send(message);
  });
  await actAs.selectOption('2');
  await ui.getByRole('alert').filter({ hasText: 'Фоновый обработчик расширения устарел' }).waitFor();
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  await ui.reload();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  const secondUi = await context.newPage();
  await secondUi.goto(`chrome-extension://${id}/index.html`);
  await secondUi.getByText('Подключено', { exact: true }).waitFor();
  const secondActAs = secondUi.getByLabel('Работаю от имени', { exact: true });
  assert.equal(await secondActAs.inputValue(), '1');
  await actAs.selectOption('2');
  await secondUi.getByRole('heading', { name: 'Завершите вход в окне Omni' }).waitFor();
  assert.equal(await secondUi.getByText('Подключено', { exact: true }).count(), 0);
  await ui.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await actAs.inputValue(), '2');
  await secondUi.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await secondActAs.inputValue(), '2');
  assert.equal(await official.evaluate(() => sessionStorage.getItem('switch-cleaned')), 'yes');
  assert.equal(await ui.locator('.file-preview-full').count(), 0);
  assert.equal(await ui.getByRole('heading', { name: 'Мой урок' }).count(), 1);
  rejectSwitch = true;
  await actAs.selectOption('1');
  await ui.getByRole('alert').filter({ hasText: 'Omni отклонил переключение' }).waitFor();
  assert.equal(await ui.locator('.lesson-banner').count(), 0);
  assert.equal(teacherId, 2);
  await ui.reload();
  await ui.getByText('Подключено', { exact: true }).waitFor();
  ui.once('dialog', dialog => dialog.dismiss());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  assert.equal(paths.filter(path => path === '/auth/logout').length, 0);
  assert.equal(await actAs.inputValue(), '2');
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  await official.waitForURL('https://omni.top-academy.ru/login/index');
  await secondUi.getByRole('heading', { name: 'Завершите вход в окне Omni' }).waitFor();
  assert.equal(await secondUi.getByText('Подключено', { exact: true }).count(), 0);
  await ui.getByRole('heading', { name: 'Завершите вход в окне Omni' }).waitFor();
  assert.equal(await ui.locator('.lesson-banner').count(), 0);
  assert.equal(await ui.locator('input[type=password]').count(), 0);
  assert.equal(paths.filter(path => path === '/auth/logout').length, 1);
  teacherId = 3; signedIn = true;
  await official.goto('https://omni.top-academy.ru/');
  await ui.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await actAs.inputValue(), '3');
  await secondUi.getByText('Подключено', { exact: true }).waitFor();
  assert.equal(await secondActAs.inputValue(), '3');
  await official.close();
  const status = await ui.evaluate(() => chrome.runtime.sendMessage({ action: 'status', input: {} }));
  assert.equal(status.data.connected, false);
  assert.deepEqual(errors, []);
  console.log('PASS: MV3 local attendance drafts (edit/cancel/reload, zero writes), in-app topic catalogue/save/material options, rejected topic keeps draft, successful topic triggers attendance with new visits; three states, all/cancel/search, readback mismatch/reload, snapshot/PDF, teacher switching, two-tab session invalidation, account change and sender restrictions. All data fictional.');
} finally {
  await context?.close();
  // Only the unique temporary test profile created above is removed.
  if (profile.startsWith(resolve(tmpdir()) + '\\') && profile.includes('omni-extension-test-')) await rm(profile, { recursive: true, force: true });
}

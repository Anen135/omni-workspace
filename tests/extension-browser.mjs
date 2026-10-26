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
  await worker.evaluate(({ pdf, png }) => {
    globalThis.fetch = async (url, options) => {
      if (!['https://fs.top-academy.ru/api/v1/files/pdf-fixture', 'https://fs.top-academy.ru/api/v1/files/png-fixture'].includes(url) || options.credentials !== 'omit') throw new Error('Unexpected network request in fixture');
      const image = url.endsWith('/png-fixture');
      const result = new Response(image ? Uint8Array.from(atob(png), char => char.charCodeAt(0)) : pdf, { headers: image ? {} : { 'Content-Type': 'application/octet-stream' } });
      Object.defineProperty(result, 'url', { value: image ? 'https://s3.twcstorage.ru/top-academy-services-msapi/fixtures/answer.png' : url });
      return result;
    };
  }, { pdf, png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' });
  const errors = [];
  const requests = [];
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  context.on('request', request => requests.push(request.url()));
  await context.route('https://fonts.googleapis.com/**', route => route.abort());
  const paths = [];
  let signedIn = false;
  let retainLogout = false;
  let teacherId = 1;
  let rejectSwitch = false;
  let rejectAttendance = false;
  let ignoreAttendance = false;
  let rejectTheme = false;
  let expireOnStartInfo = false;
  let lessonDate = '2026-09-30';
  let rejectMark = false;
  let rejectReward = false;
  let ignoreReward = false;
  let rejectQueueRead = false;
  let nextScheduleHold = null;
  function holdNextSchedule() {
    let start, release;
    const started = new Promise(resolve => { start = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    nextScheduleHold = { start, released };
    return { started, release };
  }
  let rejectRoster = false;
  let nextRosterHold = null;
  function holdNextRoster(delayMs = 400) {
    let onStart, release;
    const started = new Promise(resolve => { onStart = resolve; });
    const released = new Promise(resolve => { release = resolve; });
    nextRosterHold = { delayMs, onStart, released };
    return { started, release };
  }
  const lessonWrites = [];
  const lessonStudents = [{ id_stud: 101, fio_stud: 'Тестовый ученик А', was: null, id_vizit: null, theme: '', primary_teach: 0, prize: 0 }, { id_stud: 102, fio_stud: 'Тестовый ученик Б', was: 2, id_vizit: 9, theme: '', primary_teach: 0, prize: 0 }];
  const copySourceDate = '2026-09-28';
  const copySourceStudents = [
    { id_stud: 102, fio_stud: 'Тестовый ученик Б', was: null, mark2: null, mark4: null, id_vizit: 9702, theme: 'Другая тема', prize: 2 },
    { id_stud: 101, fio_stud: 'Тестовый ученик А', was: 0, mark2: 6, mark4: null, id_vizit: 9701, theme: 'Другая тема', prize: 4 },
    { id_stud: 109, fio_stud: 'Ученик из другой группы', was: 1, mark2: 12, mark4: 12, id_vizit: 9709, theme: 'Другая тема', prize: 3 },
  ];
  let homeworkQueue = [201, 202, 203].map((id, index) => ({ id, id_domzad_teach: id + 1000, stud_stud: index < 2 ? 101 : 102, fio_stud: index < 2 ? 'Тестовый ученик А' : 'Тестовый ученик Б', name_tgroups: 'Тест', name_spec: 'Веб', theme: `ДЗ ${id}`, stud_date: '2026-10-10 10:00:00', ospr: 0, mark: null, answer_text: 'Вымышленный ответ', comment: 'Не менять', filename: 'fixture.pdf', download_url_stud: index === 1 ? 'https://fs.top-academy.ru/api/v1/files/png-fixture' : 'https://fs.top-academy.ru/api/v1/files/pdf-fixture' }));
  const homeworkWrites = [];
  let rejectHomework = false;
  let expectedHomeworkResponse = null;
  let dropHomeworkResponse = false;
  const directoryStudents = [
    { id_stud: 301, id_tgroups: 10, fio_stud: 'Студент каталога А', gpa: 0, percent_vizit: 0, age: 16, st_email: 'student-a@example.invalid', phone_stud: '+7 000 111-22-33', st_login: 'student_fixture_a', last_date_vizit: '2026-10-08 15:20:00', DIAMOND: 0, COIN: 4, count_comment: 0, achieves: 2 },
    { id_stud: 302, id_tgroups: 10, fio_stud: 'Студент каталога Б', gpa: '10.5', percent_vizit: 85, age: 17, st_email: 'student-b@example.invalid', phone_stud: '+7 000 444-55-66', st_login: 'student_fixture_b', last_date_vizit: '2026-09-30 09:00:00' },
  ];
  const empty = {};
  // All Omni responses are fictional: no real login, cookies or academic data.
  await context.route('https://omni.top-academy.ru/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.isNavigationRequest() && path === '/auth/logout') {
      paths.push(path);
      if (retainLogout) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>location.replace("/")</script>' });
      signedIn = false;
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><script>location.replace("/login/index")</script>' });
    }
    if (request.isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="csrf-token" content="fixture-csrf"><title>Fixture Omni</title>${signedIn ? '' : '<form><input type="password"></form><div data-login-challenge="fixture">Complete verification</div>'}<script>globalThis.angular = { element: () => ({ injector: () => ({ get: () => ({ clearLocalStorage: () => sessionStorage.setItem('switch-cleaned', 'yes') }) }) }) };</script>` });
    if (path === '/fixtures/student-101.png') return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
    if (path === '/favicon.ico') return route.fulfill({ status: 404, body: '' });
    if (path.startsWith('/dossier/')) {
      assert.equal(request.method(), 'GET');
      assert.equal(request.postData(), null);
      assert.equal(request.headers()['x-csrf-token'], 'fixture-csrf');
      if (!signedIn) return route.fulfill({ status: 401, body: '' });
      paths.push(path);
      const single = { count_pairs: { indicator_value: 42 } };
      const graphics = { count_pairs: [{ month_date: '2026-09-01', graphic_value: 12 }] };
      const data = path === '/dossier/get-single-data' ? single
        : path === '/dossier/get-data-graphics' ? graphics
        : { single_data: single, graphics_data: graphics, profile_data: { fio_teach: 'Преподаватель досье' },
          teach_specs_list: [{ name_spec: 'Предмет досье', read_now: 1 }],
          evaluation: { students_who_need_help: [{ fio: 'Студент досье', group: 'Группа досье', percent_hw_completion: 0 }] } };
      return route.fulfill({ json: data });
    }
    if (request.method() !== 'POST') return route.fulfill({ status: 404, body: '' });
    if (!signedIn) return route.fulfill({ status: 401, body: '' });
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
    if (path === '/auth/get-start-info' && expireOnStartInfo) { expireOnStartInfo = false; signedIn = false; return route.fulfill({ status: 401, body: '' }); }
    if (path === '/auth/get-start-info') data = { branch: { name: 'Тестовая академия' } };
    if (path === '/students/get-groups-list') data = [{ id_tgroups: 10, name_tgroups: 'Группа каталога' }];
    if (path === '/students/get-students') {
      assert.deepEqual(request.postDataJSON(), { group: '10' });
      const hold = nextRosterHold;
      nextRosterHold = null;
      if (hold) {
        hold.onStart();
        await Promise.all([hold.released, new Promise(resolve => setTimeout(resolve, hold.delayMs))]);
      }
      if (rejectRoster) return route.fulfill({ status: 503, json: { error: 'Fixture roster unavailable' } });
      data = [...directoryStudents, { id_stud: 102, fio_stud: 'Тестовый ученик Б', gpa: '10.5', photo_pas: '/fixtures/missing-student.png' }, { id_stud: 101, fio_stud: 'Тестовый ученик А', gpa: 0, photo_pas: '/fixtures/student-101.png' }];
    }
    if (path === '/students/get-details-stud') {
      assert.deepEqual(request.postDataJSON(), { stud: '301' });
      data = { name_tgroups: 'Группа каталога', name_streams: 'Поток каталога', dir_name: 'Веб-разработка', birthdat_stud: '2010-01-02', st_mob1: '+7 000 999-88-77' };
    }
    if (path === '/students/get-stud-vizit') {
      assert.deepEqual(request.postDataJSON(), { stud: '301' });
      data = [{ date_vizit: '2026-10-01', name_spec: 'Предмет каталога', theme: 'Тема каталога', fio_teach: 'Преподаватель каталога', was: 0, homework_mark: 8, control_mark: 9, work_in_class: 10, labwork_mark: 11, mark5: 12, comments: 'Комментарий занятия' }];
    }
    if (path === '/bind/get-materials-type') data = [{ id: 1, name: 'Материал каталога' }];
    if (path === '/bind/get-public-form') data = [{ id_form: 4, name_form: 'Форма каталога' }];
    if (path === '/bind/get-public-direction') data = [{ id: 16, dir_name: 'Направление каталога' }];
    if (path === '/bind/get-public-spec') {
      assert.deepEqual(request.postDataJSON(), { ...(request.postDataJSON().form ? { form: '4' } : {}), arc: 0 });
      data = [{ id: 42, name_spec: 'Тестовый курс каталога' }];
    }
    if (path === '/bind/get-materials' || path === '/bind/get-count-week') {
      const spec = request.postDataJSON().spec;
      assert.ok(['42', '5'].includes(spec));
      assert.deepEqual(request.postDataJSON(), { spec });
      data = spec === '5' && path === '/bind/get-materials' ? { 1: { data: { lesson: [{ theme: 'Материал темы до выдачи' }] } }, 2: { data: { lesson: [{ theme: 'Другой материал недели' }] } } } : [];
    }
    if (path === '/schedule/get-schedule' && nextScheduleHold) { const held = nextScheduleHold; nextScheduleHold = null; held.start(); await held.released; }
    if (path === '/schedule/get-schedule') data = { dates: { 1: '2026-09-29', 2: '2026-10-02' }, days: { 1: 'Вторник', 2: 'Пятница' }, body: { 0: { 1: { name_spec: 'Прошедший урок', l_start: '09:00', l_end: '10:30' }, 2: { name_spec: 'Будущий урок', l_start: '09:00', l_end: '10:30' } } } };
    if (path === '/presents/get-presents') {
      const requestedDate = request.postDataJSON().date || '2026-09-30';
      if (requestedDate !== copySourceDate) lessonDate = requestedDate;
      const slot = Number(request.postDataJSON().lenta || 0);
      data = { cur_date: requestedDate, cur_group: 10, cur_lenta: slot, cur_schedule: slot === 4 ? 54 : 50, students: requestedDate === copySourceDate ? copySourceStudents : slot === 4 ? [] : lessonStudents, schedule: { 0: { name_spec: 'Первая пара', l_start: '09:00', l_end: '10:30' }, 4: { name_spec: 'Пара без учеников', l_start: '15:00', l_end: '16:30' } }, scheduleType: 'planned', can_set_theme: true, cur_spec: { id_spec: 3, source: 'fixture', id_base_spec: 4 } };
    }
    if (path === '/presents/set-mark') {
      lessonWrites.push('mark');
      assert.match(lessonDate, /^2026-\d{2}-\d{2}$/);
      const input = request.postDataJSON();
      const change = input.marks[0];
      assert.equal(change.vizit, lessonStudents[0].id_vizit);
      if (!rejectMark) lessonStudents[0][`mark${change.type}`] = change.mark;
      data = rejectMark ? { success: false, message: 'Период закрыт' } : { success: true };
    }
    if (path === '/presents/set-prize') {
      lessonWrites.push('reward');
      const input = request.postDataJSON();
      assert.deepEqual(Object.keys(input), ['prizes']);
      const changes = Object.values(input.prizes);
      assert.ok(changes.length > 0);
      for (const change of changes) {
        assert.deepEqual(Object.keys(change).sort(), ['id', 'reward']);
        const matches = lessonStudents.filter(student => student.id_vizit === change.id);
        assert.equal(matches.length, 1, 'Topcoins payload must use the current destination visit ID');
        if (!rejectReward && !ignoreReward) matches[0].prize = change.reward === 4 ? 0 : change.reward;
      }
      data = rejectReward ? { error: 'Topcoins отклонены сервером' } : { success: true, total: 20 };
    }
    if (path === '/presents/get-methodpackage-themes') data = [{ public_week_id: 7, package_id: 5, week: 1, theme: 'Тестовая тема', has_homework: true, has_labwork: true }];
    if (path === '/presents/set-theme') {
      lessonWrites.push('theme');
      const input = request.postDataJSON();
      assert.equal(input.schedule, 50); assert.equal(input.theme, 'Тестовая тема');
      assert.equal(input.public_week_id, 7); assert.equal(input.issue_homework, true); assert.equal(input.issue_labwork, false);
      assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
      if (!rejectTheme) lessonStudents.forEach((student, index) => { student.theme = input.theme; student.public_week_id = 7; student.id_vizit = 80 + index; student.was = 0; });
      data = rejectTheme ? { success: false, message: 'Тестовый отказ темы' } : { success: true };
    }
    if (path === '/presents/set-was') {
      lessonWrites.push('attendance');
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
    if (path === '/homework/get-new-homeworks' && rejectQueueRead) return route.fulfill({ status: 503, json: {} });
    if (path === '/homework/get-new-homeworks') data = { homework: homeworkQueue, lab_work: [], requests: [] };
    if (path === '/homework/save-homework') {
      const { HomeworkForm: form } = request.postDataJSON();
      assert.equal(form.comment, expectedHomeworkResponse ?? homeworkQueue.find(item => item.id === form.id).comment);
      assert.equal(form.answer_text, 'Вымышленный ответ');
      assert.deepEqual(form.marks, { 0: { id: form.id_domzad_teach, stud: form.stud_stud, mark: form.mark, ospr: 0 } });
      homeworkWrites.push({ id: form.id, student: form.stud_stud, mark: form.mark });
      if (!rejectHomework) {
        if (expectedHomeworkResponse !== null && !dropHomeworkResponse) Object.assign(homeworkQueue.find(item => item.id === form.id), { mark: form.mark, comment: form.comment });
        else homeworkQueue = homeworkQueue.filter(item => item.id !== form.id);
      }
      data = rejectHomework ? { success: false, message: 'ДЗ отклонено сервером' } : { success: 'Сохранено' };
    }
    return route.fulfill({ json: data });
  });
  for (const page of context.pages()) await page.close();
  const official = await context.newPage();
  official.setDefaultTimeout(15000);
  const ui = official;
  const extensionMessage = async (message, tab = official) => {
    await tab.bringToFront();
    return worker.evaluate(async ({ url, message }) => {
    const targets = await chrome.tabs.query({ url });
    const target = targets.find(candidate => candidate.active) || targets[0];
    if (!target) throw new Error(`No Omni test tab for ${url}`);
    const results = await chrome.scripting.executeScript({
      target: { tabId: target.id, frameIds: [0] }, world: 'ISOLATED',
      func: message => chrome.runtime.sendMessage(message), args: [message],
    });
    return results[0]?.result;
    }, { url: tab.url(), message });
  };
  const downgradeCapabilities = async (tab = official) => {
    await tab.bringToFront();
    return worker.evaluate(async ({ url }) => {
    const targets = await chrome.tabs.query({ url });
    const target = targets.find(candidate => candidate.active) || targets[0];
    if (!target) throw new Error(`No Omni test tab for ${url}`);
    const results = await chrome.scripting.executeScript({
      target: { tabId: target.id, frameIds: [0] }, world: 'ISOLATED',
      func: () => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = message => message.action === 'capabilities'
          ? Promise.resolve({ error: { code: 'BAD_INPUT', message: 'fixture unsupported capabilities' } })
          : send(message);
      },
    });
    return results[0]?.result;
    }, { url: tab.url() });
  };
  await official.goto('https://omni.top-academy.ru/');
  await official.waitForLoadState('domcontentloaded');
  assert.equal(new URL(official.url()).origin, 'https://omni.top-academy.ru');
  await official.locator('input[type=password]').waitFor();
  assert.equal(await official.locator('#omni-workspace-root').count(), 0);
  assert.equal(await official.locator('[data-login-challenge="fixture"]').count(), 1);
  // Simulates completion of Omni's own login and challenge without a real credential.
  await official.evaluate(() => { document.querySelector('input[type=password]').closest('form')?.remove(); document.querySelector('[data-login-challenge="fixture"]')?.remove(); sessionStorage.setItem('IdLocalHash', 'fixture-hash'); });
  signedIn = true;
  const initialRoster = holdNextRoster();
  await official.addInitScript(() => localStorage.setItem('omni.connection-check-seconds', '15'));
  await official.reload();
  await official.locator('#omni-workspace-root #root').waitFor();
  if (process.env.OMNI_PNG_PREVIEW_ONLY === '1') {
    await initialRoster.started;
    initialRoster.release();
    await ui.locator('.attendance-select').first().waitFor();
    await ui.getByRole('button', { name: 'Домашние задания', exact: true }).click();
    await ui.getByRole('button', { name: 'Открыть работу', exact: true }).nth(1).click();
    await ui.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
    await ui.locator('.file-preview-full img').waitFor();
    await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.file-preview-full img')?.naturalWidth === 1);
    assert.equal(await ui.locator('.file-preview-error').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: homework PNG preview through extension with TWC destination and no Content-Type. Fictional image.');
  } else   if (process.env.OMNI_DRAFT_RECOVERY_ONLY === '1') {
    await initialRoster.started;
    initialRoster.release();
    await ui.locator('.attendance-select').first().waitFor();
    lessonStudents.forEach((student, index) => { student.theme = 'Тестовая тема'; student.id_vizit = 80 + index; student.was = 0; });
    const branch = 'Тестовая академия';
    const key = JSON.stringify(['1', branch, '2026-09-30', '10', '0', '50']);
    const attendanceDraft = (previousWas, was) => ({ attendance: { '101': { stud: '101', previousWas, was, visit: '80' } }, marks: {}, rewards: {} });
    const seed = async (draft, state, contextKey = key, owner = null) => worker.evaluate(async ({ draft, state, contextKey, owner }) => {
      await chrome.storage.local.set({ lessonDraftBuffer: { version: 1, entries: [{ key: contextKey, draft, state, revision: 'fixture-buffer', updatedAt: Date.now(), owner }] } });
    }, { draft, state, contextKey, owner });
    const bufferEntries = () => worker.evaluate(async () => (await chrome.storage.local.get('lessonDraftBuffer')).lessonDraftBuffer.entries);
    const waitSaved = async () => {
      await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
      assert.equal((await bufferEntries()).length, 0, 'confirmed queue item is removed');
    };
    // Exercise a real Save preflight failure, not just a seeded recovery record.
    await ui.reload();
    await ui.locator('.attendance-select').first().selectOption('1');
    expireOnStartInfo = true;
    await ui.locator('.lesson-save-icon').click();
    await ui.locator('input[type=password]').waitFor();
    assert.equal(await ui.locator('#omni-workspace-root').count(), 0);
    assert.equal((await bufferEntries())[0].state, 'ready', 'failed preflight durably buffers the explicit Save');
    assert.equal(lessonWrites.length, 0, 'expired preflight sends no academic mutation');
    signedIn = true;
    await ui.goto('https://omni.top-academy.ru/');
    await waitSaved();
    assert.equal(lessonStudents[0].was, 1);
    assert.deepEqual(lessonWrites, ['attendance'], 'same-account login resumes a ready explicit Save once');

    await seed(attendanceDraft(1, 0), 'uncertain');
    await ui.reload();
    const upload = ui.locator('.lesson-save-icon');
    await upload.locator('svg.lucide-upload').waitFor();
    assert.deepEqual(lessonWrites, ['attendance'], 'uncertain write never automatically replays');
    await upload.click();
    await waitSaved();
    assert.equal(lessonStudents[0].was, 0);
    assert.deepEqual(lessonWrites, ['attendance', 'attendance']);

    await seed(attendanceDraft(1, 0), 'uncertain');
    await ui.reload();
    await upload.locator('svg.lucide-upload').waitFor();
    await upload.click();
    await waitSaved();
    assert.equal(lessonWrites.length, 2, 'readback removes already committed attendance without duplicate write');

    await seed(attendanceDraft(2, 1), 'ready');
    await ui.reload();
    await ui.getByRole('alert').filter({ hasText: 'Посещаемость или запись ученика изменилась в Omni' }).waitFor();
    assert.equal((await bufferEntries())[0].state, 'review', 'baseline conflict needs review');
    assert.equal(lessonWrites.length, 2);
    assert.equal(await ui.locator('.workspace-error-toast').evaluate(node => getComputedStyle(node).position), 'fixed');
    await ui.screenshot({ path: 'tmp/draft-recovery-toast.png', animations: 'disabled' });
    assert.ok((await ui.locator('.workspace-error-toast').boundingBox()).height < 160, 'error toast remains compact with the floating Save button');
    await ui.getByRole('button', { name: 'Закрыть ошибку' }).click();
    await ui.locator('.workspace-error-toast').waitFor({ state: 'detached' });

    for (const wrongKey of [JSON.stringify(['99', branch, '2026-09-30', '10', '0', '50']), JSON.stringify(['1', 'Другой филиал', '2026-09-30', '10', '0', '50'])]) {
      await seed(attendanceDraft(0, 1), 'ready', wrongKey);
      await ui.reload();
      await ui.locator('.attendance-select').first().waitFor();
      assert.equal(await upload.count(), 0, 'other account/branch draft is not displayed');
      assert.equal(lessonWrites.length, 2, 'other account/branch produces no writes');
    }

    await seed({ attendance: {}, marks: {}, rewards: {}, theme: { theme: 'Тестовая тема', publicWeekId: '7', issueHomework: true, issueLabwork: false, previousTheme: '' } }, 'uncertain');
    await ui.reload();
    await upload.locator('svg.lucide-upload').waitFor();
    ui.once('dialog', dialog => dialog.accept());
    await upload.click();
    await ui.getByRole('alert').filter({ hasText: 'Результат выдачи материалов не подтверждён' }).waitFor();
    assert.equal(lessonWrites.length, 2, 'uncertain theme issuance cannot be repeated manually or automatically');

    const owner = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://omni.top-academy.ru/*' });
      const tab = tabs[0];
      const [document] = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', func: async () => {
        try { await chrome.storage.local.get('lessonDraftBuffer'); return false; } catch { return true; }
      } });
      return { tabId: tab.id, documentId: document.documentId, isolatedStorageDenied: document.result };
    });
    assert.equal(owner.isolatedStorageDenied, true, 'content script cannot directly forge private storage');
    await seed(attendanceDraft(0, 1), 'ready', key, { tabId: owner.tabId, documentId: owner.documentId });
    const competing = await context.newPage();
    await competing.addInitScript(() => sessionStorage.setItem('IdLocalHash', 'fixture-hash'));
    await competing.goto('https://omni.top-academy.ru/');
    await competing.getByRole('alert').filter({ hasText: 'another document' }).waitFor();
    assert.equal(lessonWrites.length, 2, 'live owner in another tab prevents duplicate replay');
    await competing.close();
    assert.deepEqual(errors, []);
    console.log('PASS: private draft recovery across login/reload, automatic ready upload once, manual uncertain retry/readback, account/branch/conflict isolation, uncertain theme blocking, two-tab owner, private storage and toast. Fictional records only.');
  } else {

  assert.equal(await context.pages().length, 1, 'the extension should mount the interface in the current Omni tab');
  assert.equal(await official.locator('#omni-workspace-root iframe').count(), 0);
  const appearance = await official.locator('.live-workspace').evaluate(node => ({
    font: getComputedStyle(node).fontFamily,
    purple: getComputedStyle(node).getPropertyValue('--purple').trim(),
    sidebar: getComputedStyle(node.querySelector('.sidebar')).backgroundColor,
  }));
  assert.match(appearance.font, /sans-serif/);
  assert.equal(appearance.purple, '#6c4df6');
  assert.equal(appearance.sidebar, 'rgb(255, 255, 255)');
  await official.getByRole('button', { name: 'Включить тёмную тему', exact: true }).click();
  assert.equal(await official.locator('#omni-workspace-root').getAttribute('data-omni-theme'), 'dark');
  assert.equal(await official.locator('html').getAttribute('data-omni-theme'), null, 'extension theme must not modify the official document');
  assert.equal(await official.locator('.live-workspace').evaluate(node => getComputedStyle(node).colorScheme), 'dark');
  assert.notEqual(await official.locator('.sidebar').evaluate(node => getComputedStyle(node).backgroundColor), appearance.sidebar);
  await official.screenshot({ path: 'tmp/color-theme-extension-dark.png', animations: 'disabled' });
  assert.equal(await official.locator('.color-theme-toggle').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(48, 40, 66)', 'hovered theme button uses the dark accent surface');
  await official.getByRole('button', { name: 'Включить светлую тему', exact: true }).click();
  assert.equal(await official.locator('.sidebar').evaluate(node => getComputedStyle(node).backgroundColor), appearance.sidebar);

  await ui.locator('.act-as select').waitFor();
  await ui.getByRole('heading', { name: 'Мой урок' }).waitFor();
  await initialRoster.started;
  const refreshWorkspace = ui.getByRole('button', { name: 'Обновить', exact: true });
  assert.equal(await refreshWorkspace.isDisabled(), false, 'background averages leave workspace refresh usable');
  assert.equal(await ui.locator('.average-skeleton').count(), 2, 'each missing average has a loading skeleton');
  assert.equal(await ui.locator('.attendance-select').first().isDisabled(), false, 'background averages leave lesson editing usable');
  assert.equal(await ui.locator('.act-as select').isDisabled(), false, 'background averages leave teacher switching usable');
  assert.ok(paths.includes('/schedule/get-schedule'));
  assert.ok(paths.filter(path => path === '/profile/get-profile').length >= 2);
  const dossierReadsBeforeHold = paths.filter(path => path.startsWith('/dossier/')).length;
  await ui.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  await ui.waitForTimeout(450);
  assert.equal(await refreshWorkspace.isDisabled(), false, 'navigation does not acquire a global roster lock');
  assert.equal(await ui.getByRole('button', { name: 'Обновить досье', exact: true }).isDisabled(), true, 'dossier waits for the pending roster');
  assert.equal(paths.filter(path => path.startsWith('/dossier/')).length, dossierReadsBeforeHold, 'dossier sends no overlapping read');
  assert.equal(await ui.locator('.dossier-error').count(), 0, 'waiting for the roster must not surface a BUSY error');
  initialRoster.release();
  await ui.locator('.dossier-summary-card').filter({ hasText: 'Количество пар' }).getByText('42', { exact: true }).waitFor();
  await ui.getByText('Группа досье', { exact: true }).waitFor();
  for (const endpoint of ['get-single-data', 'get-data-graphics', 'get-all-data']) assert.ok(paths.includes('/dossier/' + endpoint));
  await ui.getByRole('button', { name: 'Обновить расчёт', exact: true }).waitFor();
  await ui.waitForFunction(() => [...document.querySelector('#omni-workspace-root').shadowRoot.querySelectorAll('button')].some(button => button.textContent === 'Обновить расчёт' && !button.disabled));
  const delayedIncome = holdNextSchedule();
  const dossierBeforeRevision = paths.filter(path => path === '/dossier/get-all-data').length;
  await ui.getByRole('button', { name: 'Обновить расчёт', exact: true }).click();
  await delayedIncome.started;
  await worker.evaluate(async () => {
    const revision = 'fixture-same-account-request-volume';
    await chrome.storage.session.set({ sessionRevision: revision });
    const tabs = await chrome.tabs.query({ url: 'https://omni.top-academy.ru/*' });
    await Promise.all(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { action: 'session-revision', revision }, { frameId: 0 })));
  });
  await ui.locator('.teacher-dossier').waitFor({ state: 'detached' });
  delayedIncome.release();
  await ui.locator('.teacher-dossier').waitFor({ timeout: 30000 });
  await ui.waitForFunction(() => [...document.querySelector('#omni-workspace-root').shadowRoot.querySelectorAll('button')].some(button => button.textContent === 'Обновить расчёт' && !button.disabled));
  assert.equal(paths.filter(path => path === '/dossier/get-all-data').length, dossierBeforeRevision + 1, 'same-account session revision replaces retained dossier and income ownership');
  await ui.locator('nav button').nth(1).click();
  await ui.locator('.schedule-tools').waitFor();
  const calendarTrigger = ui.locator('.schedule-tools .workspace-popover > button');
  await calendarTrigger.click();
  const calendar = ui.locator('.schedule-tools .workspace-popover-body');
  const month = calendar.locator('.workspace-calendar-heading strong');
  const previousMonth = await month.textContent();
  await calendar.locator('.workspace-calendar-heading button').nth(1).click();
  assert.notEqual(await month.textContent(), previousMonth, 'a click inside the injected calendar must not dismiss its shadow-root popover');
  await calendar.locator('button[aria-label="2026-10-05"]').click();
  await calendar.waitFor({ state: 'detached' });
  await calendarTrigger.click();
  await ui.locator('nav button').nth(0).click();
  const lessonTable = ui.locator('.lesson-students');
  await lessonTable.getByRole('columnheader', { name: 'Средняя оценка', exact: true }).waitFor();
  await lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик А' }).locator('td:last-child').filter({ hasText: /^0$/ }).waitFor();
  assert.equal(await lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик Б' }).locator('td:last-child').innerText(), '10.5', 'lesson averages use the Students roster matched by ID, independent of roster order');
  const lessonAvatar = lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик А' }).locator('.student-avatar img');
  await lessonAvatar.waitFor();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.lesson-students .student-avatar img')?.naturalWidth === 1);
  assert.equal(await lessonAvatar.getAttribute('src'), 'https://omni.top-academy.ru/fixtures/student-101.png', 'lesson uses roster photo_pas by student ID');
  const missingLessonAvatar = lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик Б' }).locator('.student-avatar');
  await missingLessonAvatar.locator('img').waitFor({ state: 'detached' });
  assert.match(await missingLessonAvatar.innerText(), /Ту/);
  assert.equal(await ui.getByRole('button', { name: 'Посмотреть материалы', exact: true }).count(), 0);
  await ui.mouse.move(700, 180);
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.sidebar')?.getBoundingClientRect().width === 72);
  await ui.getByRole('button', { name: /^(Выбрать тему|Обновить список тем)$/ }).click();
  await ui.getByLabel('Тема из методпакета', { exact: true }).selectOption('7');
  await ui.getByRole('button', { name: 'Материалы выбранной темы', exact: true }).click();
  const lessonMaterials = ui.getByRole('dialog', { name: 'Материалы занятия', exact: true });
  await lessonMaterials.getByRole('region', { name: 'Материалы выбранной темы', exact: true }).waitFor();
  assert.equal(await lessonMaterials.evaluate(node => getComputedStyle(node).maxHeight !== 'none'), true, 'new materials CSS is delivered into Shadow DOM');
  assert.deepEqual(lessonWrites, [], 'viewing selected theme materials is read-only');
  await ui.keyboard.press('Escape');
  await lessonMaterials.waitFor({ state: 'detached' });
  await lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик А' }).locator('td:last-child').filter({ hasText: /^0$/ }).waitFor();
  rejectRoster = true;
  const rosterReadsBeforeFailure = paths.filter(path => path === '/students/get-students').length;
  const failedRoster = ui.waitForResponse(response => new URL(response.url()).pathname === '/students/get-students' && response.status() === 503);
  await refreshWorkspace.click();
  await failedRoster;
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.topbar button')?.disabled);
  assert.equal(paths.filter(path => path === '/students/get-students').length, rosterReadsBeforeFailure + 1, 'a fresh snapshot attempts one roster read');
  assert.deepEqual(await lessonTable.locator('tbody tr td:last-child').allTextContents(), ['—', '—'], 'failed fresh roster reads clear previously displayed averages');
  assert.equal(await lessonTable.locator('.student-avatar img').count(), 0, 'failed fresh roster reads clear previously displayed roster photos');
  rejectRoster = false;
  await refreshWorkspace.click();
  await lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик А' }).locator('td:last-child').filter({ hasText: /^0$/ }).waitFor();
  assert.equal(await lessonTable.locator('tbody tr').filter({ hasText: 'Тестовый ученик Б' }).locator('td:last-child').innerText(), '10.5', 'a later refresh recovers roster averages');
  // Shared admin-table operations stage a complete lesson candidate, never writes.
  const lessonBulk = lessonTable.locator('.table-bulk-editor');
  assert.equal(await lessonBulk.locator('.table-bulk-controls').evaluate(node => getComputedStyle(node).display), 'flex', 'shared table CSS is present in extension Shadow DOM');
  await lessonTable.getByRole('checkbox', { name: 'Выбрать ученика: Тестовый ученик А', exact: true }).check();
  await lessonBulk.getByRole('button', { name: 'Заполнить столбец (1)', exact: true }).click();
  assert.equal(await lessonTable.getByRole('button', { name: 'Работа на уроке: Тестовый ученик А', exact: true }).innerText(), '12');
  assert.equal(await lessonTable.getByRole('button', { name: 'Работа на уроке: Тестовый ученик Б', exact: true }).innerText(), '—');
  assert.equal(await lessonTable.getByRole('checkbox', { name: 'Выбрать ученика: Тестовый ученик А', exact: true }).isChecked(), true, 'selection survives local draft overlays');
  await lessonBulk.getByLabel('Область массового редактирования').selectOption('filtered');
  await lessonBulk.getByRole('button', { name: 'Заполнить столбец (2)', exact: true }).click();
  await lessonBulk.getByLabel('Столбец для массового редактирования').selectOption('attendance');
  await lessonBulk.getByLabel('Единое значение').selectOption('1');
  await lessonBulk.getByRole('button', { name: 'Заполнить столбец (2)', exact: true }).click();
  const allocation = lessonTable.getByRole('region', { name: 'Распределение топкойнов', exact: true });
  await allocation.getByRole('button', { name: 'Распределить топкойны', exact: true }).click();
  await allocation.getByRole('button', { name: 'Рассчитать предложение', exact: true }).click();
  assert.match(await allocation.innerText(), /Предложено: 4.*Остаток: 1/);
  await allocation.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal(await ui.getByLabel('Топкойны: Тестовый ученик А', { exact: true }).inputValue(), '2');
  assert.equal(await ui.getByLabel('Топкойны: Тестовый ученик Б', { exact: true }).inputValue(), '2');
  assert.deepEqual(lessonWrites, [], 'bulk marks, attendance and automatic rewards stay local before explicit Save');
  await allocation.getByRole('button', { name: 'Распределить топкойны', exact: true }).click();
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Отменить черновик', exact: true }).click();
  assert.equal(await ui.getByRole('button', { name: 'Сохранить', exact: true }).count(), 0);
  await refreshWorkspace.click();
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.topbar button')?.disabled);
  assert.equal(await lessonTable.getByRole('checkbox', { name: 'Выбрать ученика: Тестовый ученик А', exact: true }).isChecked(), false, 'remote refresh clears selection even when rows have the same IDs');

  await calendar.waitFor({ state: 'detached' });
  const helpTip = ui.locator('.lesson-context .help-tip-trigger');
  await helpTip.focus();
  await ui.getByRole('tooltip').waitFor();
  assert.equal(await ui.getByRole('tooltip').evaluate(node => node.getRootNode() instanceof ShadowRoot), true);
  assert.equal(await ui.getByRole('tooltip').evaluate(node => getComputedStyle(node).position), 'fixed');
  await ui.keyboard.press('Escape');
  await ui.getByRole('tooltip').waitFor({ state: 'detached' });
  // Students uses the existing authenticated read commands in the actual extension worker.
  await ui.getByRole('button', { name: 'Студенты', exact: true }).click();
  await ui.getByLabel('Выбор группы', { exact: true }).selectOption('10');
  const directory = ui.locator('.students-page');
  await directory.getByRole('button', { name: 'Студент каталога А', exact: true }).waitFor();
  const firstStudent = directory.locator('tbody tr').filter({ hasText: 'Студент каталога А' });
  assert.equal(await firstStudent.locator('td').nth(1).innerText(), '0');
  assert.match(await firstStudent.locator('td').nth(2).innerText(), /^0\s*%?$/);
  assert.match(await firstStudent.innerText(), /student-a@example.invalid/);
  assert.match(await firstStudent.innerText(), /student_fixture_a/);
  // Move the pointer into the content so the hover-expanded sidebar collapses.
  await directory.getByLabel('Поиск студентов', { exact: true }).click();
  await directory.getByLabel('Поиск студентов', { exact: true }).fill('student_fixture_a');
  assert.equal(await directory.locator('tbody tr').count(), 1, 'search uses the official login field');
  await directory.getByRole('button', { name: 'Студент каталога А', exact: true }).click();
  const studentDialog = ui.getByRole('dialog', { name: 'Студент каталога А', exact: true });
  await studentDialog.waitFor();
  assert.match(await studentDialog.innerText(), /Поток каталога/);
  assert.match(await studentDialog.innerText(), /Веб-разработка/);
  assert.match(await studentDialog.innerText(), /\+7 000 999-88-77/);
  assert.match(await studentDialog.innerText(), /Предмет каталога/);
  await ui.screenshot({ path: 'tmp/students-extension-profile.png' });
  await studentDialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await studentDialog.waitFor({ state: 'detached' });
  assert.equal(await directory.locator('table').evaluate(node => getComputedStyle(node).fontSize), '12px', 'students CSS is injected into Shadow DOM');
  assert.equal(paths.filter(path => path === '/students/get-details-stud').length, 1, 'details load only on explicit open');
  assert.equal(paths.some(path => /^\/students\/(set-|send-|delete-)/.test(path)), false, 'students page never writes');
  await ui.screenshot({ path: 'tmp/students-extension-list.png' });
  await ui.getByRole('button', { name: 'Справка', exact: true }).click();
  await ui.locator('.help-page').waitFor();
  await ui.getByRole('link', { name: 'Расчёт дохода', exact: true }).click();
  assert.equal(await ui.locator('#help-2').evaluate(node => node.getBoundingClientRect().top < innerHeight), true);
  await ui.locator('nav button').nth(0).click();
  const presence = ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true });
  const reward = ui.getByLabel('Топкойны: Тестовый ученик А', { exact: true });
  async function setReward(level) {
    await reward.press('Home');
    for (let step = 0; step < level; step++) await reward.press('ArrowRight');
  }
  const lessonSave = ui.getByRole('button', { name: 'Сохранить', exact: true });
  const dayPairs = ui.getByLabel('Пара выбранного дня', { exact: true });
  assert.equal(await lessonSave.count(), 0, 'Save is absent before an actionable draft exists');
  assert.equal(await ui.locator('.lesson-theme-editor > .attendance-help').count(), 0, 'missing theme is an icon, not a paragraph');
  assert.equal(await dayPairs.locator('option').count(), 3);
  await dayPairs.selectOption('4');
  await ui.getByRole('heading', { name: 'Выберите пару и группу', exact: true }).waitFor();
  assert.equal(await dayPairs.inputValue(), '4');
  assert.equal(await dayPairs.isEnabled(), true);
  await dayPairs.selectOption('0');
  await presence.waitFor();
  assert.equal(await presence.isEnabled(), true); // Empty lesson theme must not block attendance.
  assert.equal(await reward.isDisabled(), true, 'rewards need present or late attendance');
  await presence.selectOption('1');
  assert.equal(await lessonSave.isDisabled(), true, 'attendance draft without a theme keeps Save disabled');
  assert.equal(await reward.isEnabled(), true, 'draft attendance enables staging a reward before an official visit exists');
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
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.disabled);
  assert.equal(await presence.inputValue(), '1'); // Reload preserves local draft.
  assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
  await ui.mouse.move(700, 180);
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.sidebar')?.getBoundingClientRect().width === 72);
  await ui.getByRole('button', { name: /^(Выбрать тему|Обновить список тем)$/ }).click();
  await ui.getByLabel('Тема из методпакета', { exact: true }).selectOption('7');
  await ui.getByRole('checkbox', { name: 'Выдать ДЗ из методпакета' }).check();
  rejectTheme = true;
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.deepEqual(lessonWrites, [], 'staging a theme and attendance must not write to Omni');
  await lessonSave.waitFor({ state: 'visible' });
  assert.equal(await lessonSave.textContent(), '', 'Save has an accessible name and no visible label');
  assert.equal(await lessonSave.locator('svg').count(), 1);
  const draftRoster = holdNextRoster();
  await refreshWorkspace.click();
  await draftRoster.started;
  assert.equal(await lessonSave.isDisabled(), false, 'background averages leave an actionable draft Save enabled');
  assert.equal(await refreshWorkspace.isDisabled(), false);
  assert.equal(await ui.locator('.act-as select').isDisabled(), false);
  const catalogReadsBeforeHold = paths.filter(path => path.startsWith('/bind/get-public-')).length;
  await ui.getByRole('button', { name: 'Материалы', exact: true }).click();
  await ui.waitForTimeout(450);
  assert.equal(await refreshWorkspace.isDisabled(), false, 'leaving a draft does not acquire a global roster lock');
  assert.equal(await ui.getByRole('button', { name: 'Обновить методички', exact: true }).isDisabled(), true, 'materials waits for the pending roster');
  assert.equal(paths.filter(path => path.startsWith('/bind/get-public-')).length, catalogReadsBeforeHold, 'materials sends no overlapping catalog read');
  assert.equal(await ui.locator('.teaching-materials [role=alert]').count(), 0, 'waiting for the roster must not surface a materials BUSY error');
  draftRoster.release();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.teaching-materials input[role=combobox]')?.disabled === false);
  assert.ok(paths.filter(path => path.startsWith('/bind/get-public-')).length > catalogReadsBeforeHold, 'materials loads after the roster releases its lock');
  await ui.locator('nav button').nth(0).click();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.lesson-save-icon')?.disabled === false);
  assert.deepEqual(lessonWrites, [], 'refreshing and navigating around an actionable draft sends no lesson write');
  await ui.locator('#omni-workspace-root').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const desktopSave = await lessonSave.boundingBox();
  assert.equal(await ui.locator('.lesson-save-actions').evaluate(node => getComputedStyle(node).position), 'fixed');
  assert.ok(desktopSave.x >= 1180 && desktopSave.x + desktopSave.width <= 1280 && desktopSave.y >= 620 && desktopSave.y + desktopSave.height <= 720, 'Save floats inside the lower-right desktop viewport');
  await ui.screenshot({ path: 'tmp/lesson-save-floating-desktop.png' });
  await ui.setViewportSize({ width: 390, height: 844 });
  await ui.mouse.move(200, 200);
  await ui.locator('#omni-workspace-root').evaluate(node => { node.scrollTop = node.scrollHeight; });
  const mobileSave = await lessonSave.boundingBox();
  await ui.screenshot({ path: 'tmp/lesson-save-floating-mobile.png' });
  assert.ok(await ui.locator('#omni-workspace-root').evaluate(node => node.scrollWidth <= node.clientWidth), 'draft actions must not widen the mobile shadow host');
  assert.ok(mobileSave.x >= 290 && mobileSave.x + mobileSave.width <= 390 && mobileSave.y >= 744 && mobileSave.y + mobileSave.height <= 844, `Save floats inside the lower-right mobile viewport: ${JSON.stringify(mobileSave)}`);
  await ui.setViewportSize({ width: 1280, height: 720 });
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Тестовый отказ темы' }).waitFor();
  assert.equal(paths.filter(path => path === '/presents/set-was').length, 0);
  assert.equal(await presence.inputValue(), '1');
  assert.equal(await lessonSave.isEnabled(), true, 'buffered draft can retry via a fresh read');
  assert.equal(await lessonSave.locator('svg.lucide-upload').count(), 1, 'failed Save switches to upload icon');
  assert.equal(await ui.locator('.workspace-error-toast').evaluate(node => getComputedStyle(node).position), 'fixed', 'errors do not occupy page layout');
  rejectTheme = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.value === '1');
  await ui.mouse.move(700, 180);
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.sidebar')?.getBoundingClientRect().width === 72);
  await ui.getByRole('button', { name: /^(Выбрать тему|Обновить список тем)$/ }).click();
  await ui.getByLabel('Тема из методпакета', { exact: true }).selectOption('7');
  await ui.getByRole('checkbox', { name: 'Выдать ДЗ из методпакета' }).check();
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.deepEqual(lessonWrites, ['theme'], 'failed theme attempt is the only prior write; retry remains explicit');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance']);
  assert.equal(await presence.inputValue(), '1');
  assert.equal(lessonStudents[0].id_vizit, 80); // Theme-created visit, not old draft metadata.
  await ui.locator('.lesson-banner').getByRole('heading', { name: 'Тестовая тема', exact: true }).waitFor();
  assert.equal(await ui.locator('.lesson-theme-editor h2').count(), 0, 'embedded theme editor does not duplicate the lesson title');
  lessonStudents[0].theme = '';
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.locator('.lesson-banner').getByRole('heading', { name: 'Тестовая тема', exact: true }).waitFor();
  await ui.locator('.lesson-banner').getByRole('heading', { name: 'Тестовая тема', exact: true }).waitFor();
  assert.equal(await ui.locator('.lesson-theme-editor h2').count(), 0, 'embedded theme editor does not duplicate the lesson title');
  lessonStudents[0].theme = 'Тестовая тема';
  await presence.selectOption('2');
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance'], 'changing attendance only updates the local draft');
  assert.equal(await lessonSave.isEnabled(), true);
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance', 'attendance']);
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.value === '2' && !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.disabled);
  await presence.selectOption('0');
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance', 'attendance']);
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Отменить черновик', exact: true }).click();
  const writesBeforeAll = paths.filter(path => path === '/presents/set-was').length;
  ui.once('dialog', dialog => dialog.dismiss());
  await ui.getByRole('button', { name: 'Все присутствуют', exact: true }).click();
  assert.equal(paths.filter(path => path === '/presents/set-was').length, writesBeforeAll);
  await ui.getByLabel('Поиск ученика', { exact: true }).fill('ученик А');
  ui.once('dialog', dialog => { assert.match(dialog.message(), /включая скрытых поиском/); return dialog.accept(); });
  await ui.getByRole('button', { name: 'Все присутствуют', exact: true }).click();
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance', 'attendance'], 'bulk changes must stay local before global Save');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.value === '1' && !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.disabled);
  assert.deepEqual(lessonWrites, ['theme', 'theme', 'attendance', 'attendance', 'attendance']);
  assert.deepEqual(lessonStudents.map(row => row.was), [1, 1]);
  rejectAttendance = true;
  await presence.selectOption('0');
  const beforeRejectedAttendance = lessonWrites.length;
  assert.equal(lessonWrites.length, beforeRejectedAttendance, 'staging a rejected attendance change makes no request');
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Отметка запрещена сервером' }).waitFor();
  assert.equal(await presence.inputValue(), '0', 'failed save keeps the local draft visible');
  assert.equal(lessonWrites.length, beforeRejectedAttendance + 1);
  assert.equal(await lessonSave.isEnabled(), true, 'buffered draft can retry via a fresh read');
  assert.equal(await lessonSave.locator('svg.lucide-upload').count(), 1, 'failed Save switches to upload icon');
  assert.equal(await ui.locator('.workspace-error-toast').evaluate(node => getComputedStyle(node).position), 'fixed', 'errors do not occupy page layout');
  rejectAttendance = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await lessonSave.waitFor({ state: 'visible' });
  assert.equal(await presence.inputValue(), '0');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(await presence.inputValue(), '0');
  assert.equal(lessonWrites.length, beforeRejectedAttendance + 2);
  ignoreAttendance = true;
  await presence.selectOption('1');
  const beforeUnconfirmed = lessonWrites.length;
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил все отметки' }).waitFor();
  assert.equal(await presence.inputValue(), '1');
  assert.equal(lessonWrites.length, beforeUnconfirmed + 1);
  assert.equal(await lessonSave.isEnabled(), true, 'buffered draft can retry via a fresh read');
  assert.equal(await lessonSave.locator('svg.lucide-upload').count(), 1, 'failed Save switches to upload icon');
  assert.equal(await ui.locator('.workspace-error-toast').evaluate(node => getComputedStyle(node).position), 'fixed', 'errors do not occupy page layout');
  ignoreAttendance = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await lessonSave.waitFor({ state: 'visible' });
  assert.equal(lessonWrites.length, beforeUnconfirmed + 1, 'rereading an uncertain result does not automatically retry writes');
  assert.equal(await presence.inputValue(), '1');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(lessonWrites.length, beforeUnconfirmed + 2);
  // An already-themed lesson may still lack this student's visit. Stage both
  // changes together; attendance creates the visit that the pending mark uses.
  lessonStudents[0].id_vizit = null;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true }).waitFor();
  const beforeVisitCreation = lessonWrites.length;
  const firstGrade = 'Контрольная: Тестовый ученик А';
  await ui.getByRole('button', { name: firstGrade, exact: true }).click();
  await ui.getByRole('spinbutton', { name: firstGrade, exact: true }).fill('7');
  await ui.locator('.mark-editor').getByRole('button', { name: 'В черновик', exact: true }).click();
  await ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true }).selectOption('2');
  await setReward(1);
  assert.equal(lessonWrites.length, beforeVisitCreation, 'neither staged edit sends a write');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites.slice(beforeVisitCreation), ['attendance', 'mark', 'reward']);
  assert.equal(lessonStudents[0].id_vizit, 8);
  assert.equal(lessonStudents[0].mark2, 7, 'mark write uses the visit created by the preceding attendance write');
  assert.equal(lessonStudents[0].prize, 1, 'reward write uses the visit created by preceding attendance');
  for (const [index, date, type, value] of [[0, '2026-09-29', 'Контрольная', '10'], [1, '2026-10-02', 'Работа на уроке', '11']]) {
    await ui.getByRole('button', { name: 'Расписание', exact: true }).click();
    await ui.getByRole('button', { name: 'Открыть урок', exact: true }).nth(index).click();
    await ui.locator('.lesson-context-date strong').filter({ hasText: date }).waitFor();
    const gradeLabel = `${type}: Тестовый ученик А`;
    await ui.getByRole('button', { name: gradeLabel, exact: true }).click();
    await ui.getByRole('spinbutton', { name: gradeLabel, exact: true }).fill(value);
    await ui.locator('.mark-editor').getByRole('button', { name: 'В черновик', exact: true }).click();
    const writesBeforeLessonDraft = lessonWrites.length;
    await ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true }).selectOption(index === 0 ? '0' : '1');
    assert.equal(lessonWrites.length, writesBeforeLessonDraft, 'grades and attendance remain local until global Save');
    if (index === 0) {
      await ui.getByRole('button', { name: 'Расписание', exact: true }).click();
      await ui.getByRole('button', { name: 'Открыть урок', exact: true }).nth(1).click();
      await ui.locator('.lesson-context-date strong').filter({ hasText: '2026-10-02' }).waitFor();
      assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).textContent(), '7', 'the past lesson draft must not leak into another lesson');
      assert.equal(await ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true }).inputValue(), '2');
      await ui.getByRole('button', { name: 'Расписание', exact: true }).click();
      await ui.getByRole('button', { name: 'Открыть урок', exact: true }).nth(0).click();
      await ui.locator('.lesson-context-date strong').filter({ hasText: '2026-09-29' }).waitFor();
      assert.equal(await ui.getByRole('button', { name: gradeLabel, exact: true }).textContent(), value, 'returning to the original lesson restores its draft');
      assert.equal(await ui.getByLabel('Присутствие: Тестовый ученик А', { exact: true }).inputValue(), '0');
    }
    await lessonSave.click();
    await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
    assert.deepEqual(lessonWrites.slice(writesBeforeLessonDraft), ['attendance', 'mark']);
    assert.equal(await ui.getByRole('button', { name: gradeLabel, exact: true }).textContent(), value);
    assert.equal(lessonDate, date);
  }
  rejectMark = true;
  await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).click();
  await ui.getByRole('spinbutton', { name: 'Контрольная: Тестовый ученик А', exact: true }).fill('9');
  await ui.locator('.mark-editor').getByRole('button', { name: 'В черновик', exact: true }).click();
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Период закрыт' }).waitFor();
  assert.equal(lessonStudents[0].mark2, 10);
  assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).isDisabled(), true);
  rejectMark = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.attendance-select')?.disabled);
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(lessonStudents[0].mark2, 9, 'a rejected mark draft can be retried explicitly after rereading');
  const rewardB = ui.getByLabel('Топкойны: Тестовый ученик Б', { exact: true });
  const writesBeforeBudget = lessonWrites.length;
  await reward.press('End');
  await rewardB.press('End');
  assert.equal(await reward.inputValue(), '3');
  assert.equal(await rewardB.inputValue(), '2', 'a second slider cannot allocate more than the lesson remainder');
  await ui.getByText('Топкойны: 5 из 5 · Осталось: 0', { exact: true }).waitFor();
  await rewardB.press('ArrowRight');
  assert.equal(await rewardB.inputValue(), '2', 'exhausted budget prevents an increase');
  await ui.getByLabel('Поиск ученика', { exact: true }).fill('Тестовый ученик Б');
  await rewardB.press('End');
  assert.equal(await rewardB.inputValue(), '2', 'hidden students still consume the shared budget');
  await ui.getByLabel('Поиск ученика', { exact: true }).fill('');
  await reward.press('ArrowLeft');
  await rewardB.press('End');
  assert.equal(await reward.inputValue(), '2');
  assert.equal(await rewardB.inputValue(), '3', 'decreasing another reward releases the remaining point');
  assert.equal(lessonWrites.length, writesBeforeBudget, 'budget allocation makes no API writes before Save');
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Отменить черновик', exact: true }).click();
  assert.equal(await reward.inputValue(), '1');
  assert.equal(await rewardB.inputValue(), '0');
  await ui.getByText('Топкойны: 1 из 5 · Осталось: 4', { exact: true }).waitFor();
  const beforeRewards = lessonWrites.length;
  rejectReward = true;
  await setReward(2);
  assert.equal(lessonWrites.length, beforeRewards, 'reward changes stay local before Save');
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Omni отклонил топкойны' }).waitFor();
  assert.equal(lessonStudents[0].prize, 1);
  assert.equal(await reward.inputValue(), '2', 'a rejected reward remains visible in the local draft');
  assert.equal(lessonWrites.length, beforeRewards + 1);
  assert.equal(await lessonSave.isEnabled(), true, 'buffered draft can retry via a fresh read');
  assert.equal(await lessonSave.locator('svg.lucide-upload').count(), 1, 'failed Save switches to upload icon');
  assert.equal(await ui.locator('.workspace-error-toast').evaluate(node => getComputedStyle(node).position), 'fixed', 'errors do not occupy page layout');
  rejectReward = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await lessonSave.waitFor({ state: 'visible' });
  assert.equal(lessonWrites.length, beforeRewards + 1, 'reread never automatically retries a reward write');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(lessonStudents[0].prize, 2);
  ignoreReward = true;
  await setReward(3);
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил топкойны' }).waitFor();
  assert.equal(await reward.inputValue(), '3');
  assert.equal(lessonStudents[0].prize, 2);
  const beforeRewardReread = lessonWrites.length;
  ignoreReward = false;
  await ui.getByRole('button', { name: 'Загрузить урок', exact: true }).click();
  await lessonSave.waitFor({ state: 'visible' });
  assert.equal(lessonWrites.length, beforeRewardReread, 'unconfirmed reward is not retried during reread');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(lessonStudents[0].prize, 3);
  await setReward(1);
  const beforeRewardConflict = lessonWrites.length;
  lessonStudents[0].prize = 2; // Simulate another official client changing the reward.
  await lessonSave.click();
  await ui.getByRole('alert').filter({ hasText: 'Топкойны или запись ученика изменились' }).waitFor();
  assert.equal(lessonWrites.length, beforeRewardConflict, 'conflicting remote reward prevents any write');
  assert.equal(await reward.inputValue(), '1');
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Отменить черновик', exact: true }).click();
  await setReward(0);
  assert.equal(await reward.inputValue(), '0', 'removal sentinel is displayed as zero on the slider');
  assert.equal(lessonWrites.length, beforeRewardConflict, 'staging removal still makes no write');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.equal(lessonStudents[0].prize, 0);
  assert.equal(await reward.getAttribute('aria-valuetext'), 'Без топкойнов');
  // Reading a previous lesson never switches the destination or copies its
  // visit IDs. Default copy protects filled values, explicit overwrite stages
  // only the selected categories, and Save is the first mutation request.
  const copyPanel = ui.getByLabel('Перенос с прошлой пары', { exact: true });
  await copyPanel.getByRole('button', { name: 'Перенести с прошлой пары', exact: true }).click();
  await copyPanel.getByLabel('Дата прошлой пары', { exact: true }).fill(copySourceDate);
  const beforeCopy = lessonWrites.length;
  await copyPanel.getByRole('button', { name: 'Загрузить прошлую пару', exact: true }).click();
  await copyPanel.getByText('Совпали ученики: 2 из 2', { exact: true }).waitFor();
  assert.deepEqual(await copyPanel.locator('tbody tr td:first-child').allTextContents(), ['Тестовый ученик А', 'Тестовый ученик Б'], 'copy matches unique IDs despite source order and unmatched students');
  assert.equal(lessonWrites.length, beforeCopy, 'loading source makes no mutation request');
  await copyPanel.getByRole('checkbox', { name: 'Топкойны', exact: true }).uncheck();
  await copyPanel.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal(await presence.inputValue(), '1', 'filled destination attendance is protected by default');
  assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).textContent(), '9');
  assert.equal(await lessonSave.count(), 0, 'copy of filled values without overwrite creates no draft');
  await copyPanel.getByRole('checkbox', { name: 'Оценки', exact: true }).uncheck();
  await copyPanel.getByRole('checkbox', { name: 'Заменить заполненные значения', exact: true }).check();
  ui.once('dialog', dialog => dialog.accept());
  await copyPanel.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal(await presence.inputValue(), '0');
  assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).textContent(), '9', 'attendance-only copy must not replace grades');
  assert.equal(lessonWrites.length, beforeCopy, 'copy remains a local draft until Save');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites.slice(beforeCopy), ['attendance']);
  assert.equal(lessonStudents[0].id_vizit, 8, 'copied old source visit must never become target visit');
  assert.equal(lessonStudents[0].theme, 'Тестовая тема', 'source theme is never copied');
  await copyPanel.getByRole('checkbox', { name: 'Посещаемость', exact: true }).uncheck();
  await copyPanel.getByRole('checkbox', { name: 'Оценки', exact: true }).check();
  ui.once('dialog', dialog => dialog.accept());
  await copyPanel.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal(await ui.getByRole('button', { name: 'Контрольная: Тестовый ученик А', exact: true }).textContent(), '6');
  assert.equal(await presence.inputValue(), '0');
  assert.equal(lessonWrites.length, beforeCopy + 1);
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites.slice(beforeCopy), ['attendance', 'mark']);
  assert.equal(lessonStudents[0].mark2, 6);
  assert.equal(lessonStudents[0].mark4, 11, 'empty source grades must not delete filled destination grades');
  await copyPanel.getByRole('checkbox', { name: 'Оценки', exact: true }).uncheck();
  await copyPanel.getByRole('checkbox', { name: 'Топкойны', exact: true }).check();
  ui.once('dialog', dialog => dialog.accept());
  await copyPanel.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal(lessonWrites.length, beforeCopy + 2, 'copied rewards remain local until Save');
  await lessonSave.click();
  await ui.getByRole('status').filter({ hasText: 'Изменения урока сохранены в Omni' }).waitFor();
  assert.deepEqual(lessonWrites.slice(beforeCopy), ['attendance', 'mark', 'reward']);
  assert.equal(lessonStudents[1].prize, 2, 'positive source reward matches the second destination student by ID');
  assert.equal(lessonStudents[1].id_vizit, 81);
  assert.equal(lessonStudents[0].prize, 0, 'source removal sentinel must not create or revoke a destination reward');
  await ui.getByRole('button', { name: 'Материалы', exact: true }).click();
  const catalogCourse = ui.getByRole('combobox', { name: 'Методпакет', exact: true });
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('input[role="combobox"]')?.disabled);
  const beforeFormMetadata = paths.filter(path => path === '/bind/get-public-form').length;
  const beforeTypeMetadata = paths.filter(path => path === '/bind/get-materials-type').length;
  await ui.getByRole('combobox', { name: 'Форма обучения', exact: true }).fill('Форма каталога');
  await ui.getByRole('combobox', { name: 'Форма обучения', exact: true }).press('Enter');
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root').shadowRoot.querySelector('.teaching-materials input[role=combobox]').disabled);
  assert.equal(paths.filter(path => path === '/bind/get-public-form').length, beforeFormMetadata, 'filter changes reuse forms');
  assert.equal(paths.filter(path => path === '/bind/get-materials-type').length, beforeTypeMetadata, 'filter changes reuse types');
  assert.equal(await ui.getByRole('combobox', { name: 'Форма обучения', exact: true }).inputValue(), 'Форма каталога');
  await ui.getByRole('button', { name: 'Обновить методички', exact: true }).click();
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root').shadowRoot.querySelector('.teaching-materials input[role=combobox]').disabled);
  assert.equal(paths.filter(path => path === '/bind/get-public-form').length, beforeFormMetadata + 1, 'explicit catalog refresh rereads forms');
  assert.equal(paths.filter(path => path === '/bind/get-materials-type').length, beforeTypeMetadata + 1, 'explicit catalog refresh rereads types');
  const beforeCatalogSearch = paths.filter(path => path === '/bind/get-public-spec').length;
  await catalogCourse.fill('Тестовый курс');
  const courseOptions = ui.getByRole('listbox', { name: 'Методпакет', exact: true });
  assert.equal(await courseOptions.evaluate(node => getComputedStyle(node).position), 'absolute');
  assert.equal(paths.filter(path => path === '/bind/get-public-spec').length, beforeCatalogSearch);
  await catalogCourse.press('Enter');
  await ui.waitForFunction(() => !document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('input[role="combobox"]')?.disabled);
  assert.equal(await catalogCourse.inputValue(), 'Тестовый курс каталога');
  await ui.getByRole('combobox', { name: 'Форма обучения', exact: true }).fill('Форма');
  await ui.getByRole('combobox', { name: 'Форма обучения', exact: true }).press('Escape');
  assert.equal(await ui.getByRole('listbox').count(), 0);
  await ui.getByRole('button', { name: 'Домашние задания', exact: true }).click();
  assert.equal(await ui.locator('.homework-table tbody tr').count(), 3);
  const homeworkAvatar = ui.locator('.homework-table tbody tr').filter({ hasText: 'ДЗ 201' }).locator('.student-avatar img');
  await homeworkAvatar.waitFor();
  assert.equal(await homeworkAvatar.getAttribute('src'), 'https://omni.top-academy.ru/fixtures/student-101.png', 'homework reuses ID-matched roster photo_pas');

  assert.equal(await ui.locator('.live-details').count(), 0);
  await ui.getByRole('button', { name: /^Превью работы:/ }).first().hover();
  const homeworkHover = ui.locator('.homework-quick-preview');
  await homeworkHover.locator('canvas[data-rendered="true"]').waitFor();
  assert.equal(await homeworkHover.evaluate(node => node.getRootNode() instanceof ShadowRoot), true, 'homework hover preview stays styled inside extension Shadow DOM');
  assert.equal(await ui.locator('.homework-teacher-response').count(), 0, 'hover does not open the grading editor');
  await ui.keyboard.press('Escape');
  await homeworkHover.waitFor({ state: 'detached' });
  await ui.getByRole('button', { name: 'Открыть работу', exact: true }).first().click();
  await ui.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
  await ui.locator('.remote-attachment canvas[data-rendered="true"]').waitFor();
  await ui.getByRole('button', { name: 'Открыть работу', exact: true }).first().click();
  await ui.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
  await ui.waitForFunction(() => document.querySelector('#omni-workspace-root')?.shadowRoot?.querySelector('.remote-attachment img')?.naturalWidth === 1);
  await ui.getByLabel('Студент домашних работ').selectOption('id:101');
  assert.equal(await ui.locator('.homework-table tbody tr').count(), 2);
  await ui.getByRole('checkbox', { name: 'Выбрать все доступные работы по фильтрам, на всех страницах', exact: true }).check();
  assert.equal(await ui.locator('.homework-table tbody input[type=checkbox]:checked').count(), 2, 'the header checkbox selects both filtered eligible works');
  ui.once('dialog', dialog => { assert.match(dialog.message(), /12.*2/); return dialog.accept(); });
  await ui.getByRole('button', { name: 'Поставить оценку (2)', exact: true }).click();
  await ui.getByRole('status').filter({ hasText: 'Оценка 12 сохранена: 2 из 2' }).waitFor();
  assert.deepEqual(homeworkWrites, [{ id: 201, student: 101, mark: 12 }, { id: 202, student: 101, mark: 12 }]);
  assert.deepEqual(homeworkQueue.map(item => item.stud_stud), [102]);
  assert.deepEqual(await ui.locator('.homework-mark').allTextContents(), ['12', '12']);
  await ui.getByLabel('Студент домашних работ').selectOption('id:102');
  rejectHomework = true;
  await ui.locator('.homework-grade-editor input').fill('11');
  await ui.locator('.homework-grade-editor input').press('Enter');
  await ui.getByRole('alert').filter({ hasText: 'ДЗ отклонено сервером' }).waitFor();
  assert.equal(homeworkQueue[0].mark, null);
  assert.equal(homeworkWrites.length, 3);
  rejectHomework = false;
  rejectQueueRead = true;
  const beforeNarrowRefresh = paths.length;
  await ui.getByRole('button', { name: 'Обновить работы', exact: true }).click();
  await ui.getByRole('alert').filter({ hasText: 'Omni не вернул данные' }).waitFor();
  assert.equal(await ui.locator('.homework-grade-editor input').count(), 0, 'failed queue refresh retains the grading reload lock');
  await ui.getByLabel('Студент домашних работ').selectOption('');
  assert.equal(await ui.locator('.homework-table tbody tr').filter({ hasText: 'ДЗ 201' }).locator('.homework-mark').innerText(), '12', 'failed queue refresh preserves confirmed grade overlay');
  assert.equal(paths.slice(beforeNarrowRefresh).filter(path => path === '/homework/get-new-homeworks').length, 1);
  for (const path of ['/schedule/get-schedule', '/presents/get-presents', '/students/get-groups-list']) assert.equal(paths.slice(beforeNarrowRefresh).includes(path), false, 'queue refresh must not read ' + path);
  rejectQueueRead = false;
  await ui.getByRole('button', { name: 'Обновить работы', exact: true }).click();
  await ui.locator('.homework-grade-editor input').waitFor();
  await ui.getByRole('button', { name: 'Открыть работу', exact: true }).click();
  const teacherResponse = ui.getByRole('textbox', { name: /Ответ преподавателя:/ });
  assert.equal(await teacherResponse.inputValue(), homeworkQueue[0].comment);
  expectedHomeworkResponse = 'Detailed teacher response\nNext steps';
  await teacherResponse.fill(expectedHomeworkResponse);
  assert.equal(homeworkWrites.length, 3, 'response draft never writes before explicit Save');
  const saveTeacherResponse = ui.getByRole('button', { name: 'Сохранить ответ и оценку', exact: true });
  assert.equal(await saveTeacherResponse.isDisabled(), true, 'response requires a grade');
  await ui.getByRole('spinbutton', { name: /Оценка к ответу преподавателя:/ }).fill('10');
  await saveTeacherResponse.click();
  await ui.getByRole('status').filter({ hasText: 'Оценка 10 сохранена: 1 из 1' }).waitFor();
  assert.deepEqual(homeworkWrites.at(-1), { id: 203, student: 102, mark: 10 });
  await ui.getByRole('button', { name: 'Открыть работу', exact: true }).click();
  assert.equal(await ui.locator('.homework-teacher-response p').innerText(), expectedHomeworkResponse, 'confirmed response remains visible after local overlay');
  assert.equal(await ui.locator('.homework-teacher-response textarea').count(), 0, 'confirmed work cannot be submitted again');

  // Acknowledgement plus disappearance confirms neither the response nor an exact readback.
  homeworkQueue.push({ ...homeworkQueue[0], id: 204, id_domzad_teach: 1204, theme: 'ДЗ 204', mark: null });
  await ui.getByRole('button', { name: 'Обновить работы', exact: true }).click();
  const uncertainHomework = ui.locator('.homework-table tbody tr').filter({ hasText: 'ДЗ 204' });
  await uncertainHomework.getByRole('button', { name: 'Открыть работу', exact: true }).click();
  expectedHomeworkResponse = 'Keep this unconfirmed response draft';
  dropHomeworkResponse = true;
  await ui.getByRole('textbox', { name: /Ответ преподавателя:/ }).fill(expectedHomeworkResponse);
  await ui.getByRole('spinbutton', { name: /Оценка к ответу преподавателя:/ }).fill('8');
  await ui.getByRole('button', { name: 'Сохранить ответ и оценку', exact: true }).click();
  await ui.getByRole('alert').filter({ hasText: 'Оценка отправлена, но сохранение ответа не подтверждено. Проверьте работу в Omni.' }).waitFor();
  assert.equal(await ui.locator('.homework-result').count(), 0, 'absent response readback cannot show success');
  const retainedResponse = ui.getByRole('textbox', { name: /Ответ преподавателя:/ });
  assert.equal(await retainedResponse.inputValue(), expectedHomeworkResponse, 'uncertain response draft remains visible');
  assert.equal(await retainedResponse.isEditable(), false, 'uncertainty prevents retry without reload');
  assert.equal(await retainedResponse.isEnabled(), true, 'uncertain draft remains available to copy');
  assert.equal(await ui.getByRole('button', { name: 'Сохранить ответ и оценку', exact: true }).isDisabled(), true);
  assert.equal(homeworkWrites.length, 5, 'uncertain write is attempted once');
  assert.equal(homeworkQueue.some(item => item.id === 204), false);

  const dossierBeforeMutatedReturn = paths.filter(path => path === '/dossier/get-all-data').length;
  await ui.getByRole('button', { name: 'Досье преподавателя', exact: true }).click();
  await ui.getByRole('button', { name: 'Обновить расчёт', exact: true }).waitFor();
  await ui.waitForFunction(() => [...document.querySelector('#omni-workspace-root').shadowRoot.querySelectorAll('button')].some(button => button.textContent === 'Обновить расчёт' && !button.disabled));
  assert.equal(paths.filter(path => path === '/dossier/get-all-data').length, dossierBeforeMutatedReturn + 1, 'academic mutations invalidate retained dossier statistics');


  const external = await extensionMessage({ action: 'status', input: {} });
  assert.equal(external.data.connected, true);
  const forbidden = await extensionMessage({ action: 'eval', input: { code: 'alert(1)' } });
  assert.equal(forbidden.error.code, 'BAD_INPUT');
  const actAs = ui.getByLabel('Работаю от имени', { exact: true });
  assert.equal(await actAs.isEnabled(), true);
  const capabilities = await extensionMessage({ action: 'capabilities', input: {} });
  assert.equal(capabilities.data.teacherSwitch, true);
  assert.equal(capabilities.data.version, manifest.version);
  assert.equal(capabilities.data.accountSwitch, true);
  const malformed = await extensionMessage({ action: 'switch-teacher', input: { teacherId: '', accountId: '1' } });
  assert.match(malformed.error.message, /идентификатор выбранного преподавателя/);
  const denied = await extensionMessage({ action: 'switch-teacher', input: { teacherId: '999', accountId: '1' } });
  assert.equal(denied.error.code, 'TEACHER_NOT_ALLOWED');
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  const stale = await extensionMessage({ action: 'switch-teacher', input: { teacherId: '2', accountId: '9' } });
  assert.equal(stale.error.code, 'ACCOUNT_CHANGED');
  // Simulate the UI running against a worker that lacks account-switch support.
  await downgradeCapabilities();
  const acceptCapabilitySwitch = dialog => dialog.accept();
  ui.on('dialog', acceptCapabilitySwitch);
  await actAs.selectOption('2');
  await ui.getByRole('alert').filter({ hasText: 'Фоновый обработчик расширения устарел' }).waitFor();
  ui.off('dialog', acceptCapabilitySwitch);
  assert.equal(paths.filter(path => path === '/auth/change-user').length, 0);
  await ui.reload();
  await ui.locator('.act-as select').waitFor();
  const secondUi = await context.newPage();
  secondUi.setDefaultTimeout(15000);
  await secondUi.addInitScript(() => sessionStorage.setItem('IdLocalHash', 'fixture-hash'));
  await secondUi.goto('https://omni.top-academy.ru/');
  assert.equal(new URL(secondUi.url()).origin, 'https://omni.top-academy.ru');
  await secondUi.locator('#omni-workspace-root #root').waitFor();
  await secondUi.locator('.act-as select').waitFor();
  const secondActAs = secondUi.getByLabel('Работаю от имени', { exact: true });
  assert.equal(await secondActAs.inputValue(), '1');
  await ui.locator('nav button').nth(1).click();
  await ui.locator('.schedule-tools').waitFor();
  await actAs.selectOption('2');
  await secondUi.getByRole('heading', { name: 'Завершите вход в этой вкладке' }).waitFor();
  assert.equal(await secondUi.locator('.act-as select').count(), 0);
  await ui.locator('.act-as select').waitFor();
  assert.equal(await actAs.inputValue(), '2');
  await secondUi.locator('.act-as select').waitFor();
  assert.equal(await secondActAs.inputValue(), '2');
  assert.equal(await official.evaluate(() => sessionStorage.getItem('switch-cleaned')), 'yes');
  assert.equal(await ui.locator('.file-preview-full').count(), 0);
  assert.equal(await ui.locator('.schedule-tools').count(), 1, 'teacher switching preserves the selected schedule tab');
  assert.equal(await ui.locator('.lesson-workspace').count(), 0, 'teacher switching must not navigate back to My lesson');
  rejectSwitch = true;
  await actAs.selectOption('1');
  await ui.getByRole('alert').filter({ hasText: 'Omni отклонил переключение' }).waitFor();
  assert.equal(await ui.locator('.lesson-banner').count(), 0);
  assert.equal(teacherId, 2);
  await ui.reload();
  await ui.locator('.act-as select').waitFor();
  ui.once('dialog', dialog => dialog.dismiss());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  assert.equal(paths.filter(path => path === '/auth/logout').length, 0);
  assert.equal(await actAs.inputValue(), '2');
  retainLogout = true;
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  const logoutWarning = ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил выход' });
  await logoutWarning.waitFor();
  assert.equal(signedIn, true);
  await ui.reload();
  await ui.locator('#omni-workspace-root #root').waitFor();
  await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил выход' }).waitFor();
  await ui.getByRole('button', { name: 'Закрыть', exact: true }).click();
  assert.equal(await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил выход' }).count(), 0);
  retainLogout = false;
  ui.once('dialog', dialog => dialog.accept());
  await ui.getByRole('button', { name: 'Сменить аккаунт', exact: true }).click();
  await official.waitForURL('https://omni.top-academy.ru/login/index').catch(async error => {
    console.error('Fictional logout fixture state:', JSON.stringify({ url: official.url(), secondUrl: secondUi.url(), signedIn, retainLogout, logoutRequests: paths.filter(path => path === '/auth/logout').length, alerts: await ui.getByRole('alert').allTextContents() }));
    throw error;
  });
  await secondUi.waitForURL('https://omni.top-academy.ru/login/index');
  await secondUi.locator('input[type=password]').waitFor();
  await official.locator('#omni-workspace-root').waitFor({ state: 'detached' });
  await official.locator('input[type=password]').waitFor();
  assert.equal(await official.locator('[data-login-challenge="fixture"]').count(), 1);
  assert.equal(paths.filter(path => path === '/auth/logout').length, 2);
  teacherId = 3; signedIn = true;
  await official.goto('https://omni.top-academy.ru/');
  await secondUi.goto('https://omni.top-academy.ru/');
  await ui.locator('.act-as select').waitFor();
  assert.equal(await ui.getByRole('alert').filter({ hasText: 'Omni не подтвердил выход' }).count(), 0);
  assert.equal(await actAs.inputValue(), '3');
  await secondUi.locator('.act-as select').waitFor();
  assert.equal(await secondActAs.inputValue(), '3');
  await official.close();
  const status = await extensionMessage({ action: 'status', input: {} }, secondUi);
  assert.equal(status.data.connected, true);
  assert.deepEqual(errors, []);
  assert.equal(requests.some(url => url.startsWith('chrome-extension://') || /localhost|127\.0\.0\.1/.test(url)), false);
  console.log('PASS: same-tab UI mount, native login/challenge preservation, Shadow DOM styling/calendar, students/contact search/profile/history, attendance drafts, topic save, marks, previous-lesson copy, materials/PDF, teacher/account switching, logout-warning recovery and second-tab invalidation. All data fictional.');
  }
} finally {
  await context?.close();
  // Only the unique temporary test profile created above is removed.
  if (profile.startsWith(resolve(tmpdir()) + '\\') && profile.includes('omni-extension-test-')) await rm(profile, { recursive: true, force: true });
}

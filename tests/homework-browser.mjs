import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Browser-only contract test with fictional submissions. Never contacts Omni.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5188, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5188/');
  await page.setContent('<div id="root" class="live-workspace"></div>');
  await page.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = (await import('/src/styles/styles.css?inline')).default
      + (await import('/src/app/workspace.css?inline')).default
      + (await import('/src/features/homework/homework.css?inline')).default;
    document.head.append(style);
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = ReactDOM;
    const { HomeworkTable } = await import('/src/features/homework/HomeworkTable.tsx');
    const { homeworkItems } = await import('/src/features/homework/homework.ts');
    const make = (key, studentId, studentName, index) => ({
      key, studentId, studentName, groupName: 'Тестовая группа', subject: 'Алгебра',
      theme: `Тема ${index}`, submittedAt: `2026-10-${String(index % 28 + 1).padStart(2, '0')}`,
      mark: null, source: { answer_text: `Ответ ${index}` }, canGrade: true,
    });
    const items = [
      ...Array.from({ length: 27 }, (_, i) => make(`a-${i}`, 'student-a', 'Иван Иванов', i)),
      ...Array.from({ length: 3 }, (_, i) => make(`b-${i}`, 'student-b', 'Иван Иванов', i + 27)),
      ...Array.from({ length: 5 }, (_, i) => make(`c-${i}`, 'student-c', 'Мария Петрова', i + 30)),
    ];
    window.gradeCalls = [];
    window.gradingMode = 'success';
    window.releaseGrade = null;
    const onGrade = async (selected, mark, response) => {
      window.gradeCalls.push({ keys: selected.map(item => item.key), studentIds: selected.map(item => item.studentId), mark, ...(response ? { response } : {}) });
      if (window.gradingMode === 'pending') await new Promise(resolve => { window.releaseGrade = resolve; });
      if (window.gradingMode === 'error') throw new Error('Вымышленная ошибка сохранения');
      const keys = selected.map(item => item.key);
      return { confirmedKeys: window.gradingMode === 'partial' ? keys.slice(0, 1) : keys };
    };
    const root = createRoot(document.getElementById('root'));
    root.render(React.createElement(HomeworkTable, {
      section: { data: [], error: null }, render: value => React.createElement('span', null, value.answer_text || 'файл'), items,
      grading: { busy: false, onGrade },
    }));
    let responseFixtureContext;
    let responseFixtureItems;
    const renderResponseFixture = (readOnly = false, unavailable = false) => {
      root.render(React.createElement(HomeworkTable, {
        key: 'response-fixture', section: { data: responseFixtureItems.map(item => item.source), error: null },
        render: value => React.createElement('span', null, Object.values(value).join(' ')),
        items: responseFixtureItems, responseDraftContext: responseFixtureContext,
        grading: readOnly ? undefined : { busy: false, onGrade, unavailable: unavailable ? 'Reload and check Omni' : undefined },
      }));
    };
    window.showResponseFixture = (replacement = false, readOnly = false) => {
      const source = { answer_text: 'Student answer stays separate', comment: replacement ? 'Updated baseline response' : 'Existing teacher response' };
      responseFixtureItems = [{ ...make('response-item', 'student-response', 'Response student', 0), source }];
      responseFixtureContext = {};
      renderResponseFixture(readOnly);
    };
    window.overlayResponseFixture = (graded = false) => {
      responseFixtureItems = responseFixtureItems.map(item => ({ ...item, ...(graded ? { mark: 11, canGrade: false } : {}) }));
      renderResponseFixture();
    };
    window.responseUnavailable = () => renderResponseFixture(false, true);
    window.showGroupFixture = fallback => {
      const sources = [
        { group: '  Группа Альфа  ', theme: 'Тема Альфа' },
        { group: 'Группа Бета', theme: 'Тема Бета' },
        { theme: 'Тема без группы' },
        { group: ['Группа Альфа', 'Группа Бета'], theme: 'Тема с неоднозначной группой' },
      ].map((source, index) => ({ ...source, id: 501 + index, id_domzad_teach: 601 + index, id_stud: 701 + index, ospr: 0, fio_stud: 'Однофамилец', answer_text: 'Тестовый ответ' }));
      root.render(React.createElement('div', { key: fallback ? 'fallback-groups' : 'normalized-groups', 'data-group-fixture': fallback ? 'fallback' : 'normalized' }, React.createElement(HomeworkTable, {
        key: fallback ? 'fallback-groups' : 'normalized-groups',
        section: { data: sources, error: null }, items: fallback ? undefined : homeworkItems({ homework: sources }),
        render: value => React.createElement('span', null, value.answer_text || 'файл'),
      })));
    };
  });
  await page.locator('.homework-table tbody tr').first().waitFor();

  const studentFilter = page.locator('.homework-filters select').first();
  const optionValues = await studentFilter.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, text: option.textContent })));
  const sameName = optionValues.filter(option => option.text.includes('Иван Иванов'));
  assert.equal(sameName.length, 2, 'same-name students must remain separate filter choices');
  assert.notEqual(sameName[0].value, sameName[1].value);
  await studentFilter.selectOption('id:student-a');
  assert.equal(await page.locator('.homework-table tbody tr').count(), 25);
  assert.equal(await page.locator('.homework-table tbody tr strong').first().innerText(), 'Иван Иванов');
  assert.equal(await page.locator('.homework-table tbody tr small').first().innerText(), 'Тестовая группа');
  assert.equal(await page.locator('.homework-table details').count(), 0, 'submission details stay compact until opened');
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await page.locator('.homework-detail-row').count(), 1);
  assert.match(await page.locator('.homework-detail-row').innerText(), /Ответ 0/);

  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  await page.locator('.homework-pagination select').selectOption('25');
  const tableCheckboxes = page.locator('.homework-table input[type="checkbox"]');
  await tableCheckboxes.first().check();
  assert.equal(await page.locator('.homework-bulk strong').nth(1).innerText(), '27');
  await page.locator('.homework-pagination button[aria-label]').last().click();
  assert.equal(await page.locator('.homework-table tbody tr').count(), 2);
  await page.getByRole('button', { name: /Поставить оценку/ }).click();
  await page.waitForFunction(() => window.gradeCalls.length === 1);
  const bulk = await page.evaluate(() => window.gradeCalls[0]);
  assert.equal(bulk.mark, 12);
  assert.equal(bulk.keys.length, 27, 'select-all applies across all filtered pages');
  assert.ok(bulk.keys.every(key => key.startsWith('a-')));
  assert.ok(bulk.studentIds.every(id => id === 'student-a'));
  assert.equal(await page.locator('.homework-result').count(), 1, 'success appears after confirmed callback results');

  await studentFilter.selectOption('id:student-b');
  assert.equal(await page.locator('.homework-bulk strong').nth(1).innerText(), '0', 'changing filters clears prior selection');
  const row = page.locator('.homework-table tbody tr').first();
  await row.locator('input[type="number"]').fill('10');
  await row.getByRole('button', { name: /Сохранить/ }).click();
  await page.waitForFunction(() => window.gradeCalls.length === 2);
  const inline = await page.evaluate(() => window.gradeCalls[1]);
  assert.equal(inline.mark, 10);
  assert.deepEqual(inline.keys, ['b-0'], 'inline edit submits only its row');

  await page.locator('.homework-filters button').click();
  await page.locator('.homework-filters select').first().selectOption('id:student-c');
  await page.locator('.homework-table input[type="checkbox"]').first().check();
  await page.evaluate(() => { window.gradingMode = 'partial'; });
  await page.getByRole('button', { name: /Поставить оценку/ }).click();
  await page.waitForFunction(() => window.gradeCalls.length === 3);
  assert.equal(await page.locator('.homework-result').count(), 1);
  assert.equal(await page.locator('.homework-review [role="alert"]').count(), 1, 'partial confirmation reports failure alongside partial success');
  await page.locator('.homework-filters button').click();
  await page.locator('.homework-filters select').first().selectOption('id:student-c');
  await page.locator('.homework-table input[type="checkbox"]').first().check();
  await page.evaluate(() => { window.gradingMode = 'error'; });
  await page.getByRole('button', { name: /Поставить оценку/ }).click();
  await page.waitForFunction(() => window.gradeCalls.length === 4);
  assert.equal(await page.locator('.homework-result').count(), 0, 'thrown error must not show success');
  assert.match(await page.locator('.homework-review [role="alert"]').innerText(), /Вымышленная ошибка/);
  await page.locator('.homework-filters button').click();
  await page.locator('.homework-filters select').first().selectOption('id:student-c');
  await page.locator('.homework-table input[type="checkbox"]').first().check();
  await page.evaluate(() => { window.gradingMode = 'pending'; });
  await page.getByRole('button', { name: /Поставить оценку/ }).click();
  await page.waitForFunction(() => typeof window.releaseGrade === 'function');
  assert.equal(await page.locator('.homework-bulk .button.primary').isDisabled(), true, 'pending grade blocks repeat submit');
  assert.equal(await page.locator('.homework-result').count(), 0, 'pending grade is not reported as success');
  await page.evaluate(() => window.releaseGrade());
  await page.locator('.homework-result').waitFor();

  await page.evaluate(() => { window.gradingMode = 'success'; window.showResponseFixture(); });
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  const response = page.getByRole('textbox', { name: /Ответ преподавателя:/ });
  const responseGrade = page.getByRole('spinbutton', { name: /Оценка к ответу преподавателя:/ });
  const responseSave = page.getByRole('button', { name: 'Сохранить ответ и оценку', exact: true });
  assert.equal(await response.inputValue(), 'Existing teacher response');
  assert.equal(await page.locator('.homework-response').innerText(), 'Ответ студента\nStudent answer stays separate');
  const callsBeforeResponse = await page.evaluate(() => window.gradeCalls.length);
  await response.fill('Teacher draft\nSecond line');
  await response.press('Enter');
  assert.equal(await page.evaluate(() => window.gradeCalls.length), callsBeforeResponse, 'typing and Enter in textarea never write');
  assert.equal(await responseSave.isDisabled(), true, 'response requires an explicit valid grade');
  await responseGrade.fill('13');
  assert.equal(await responseSave.isDisabled(), true, 'invalid grade cannot save response');
  await responseGrade.fill('9');
  assert.equal(await responseSave.isEnabled(), true);
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await response.inputValue(), 'Teacher draft\nSecond line\n', 'closing details retains the current dataset draft');
  await page.evaluate(() => window.overlayResponseFixture());
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await response.inputValue(), 'Teacher draft\nSecond line\n', 'local grade overlay arrays retain unrelated response drafts');
  await page.evaluate(() => { window.gradingMode = 'error'; });
  await responseSave.click();
  await page.waitForFunction(count => window.gradeCalls.length === count + 1, callsBeforeResponse);
  assert.equal(await response.inputValue(), 'Teacher draft\nSecond line\n', 'failed response save retains draft');
  assert.equal(await page.locator('.homework-result').count(), 0);
  await page.evaluate(() => { window.gradingMode = 'pending'; });
  await responseSave.click();
  await page.waitForFunction(() => typeof window.releaseGrade === 'function');
  assert.equal(await response.isDisabled(), true);
  assert.equal(await responseGrade.isDisabled(), true);
  assert.equal(await responseSave.isDisabled(), true, 'pending response blocks repeated submit');
  assert.equal(await page.locator('.homework-result').count(), 0);
  const responseCall = await page.evaluate(() => window.gradeCalls.at(-1));
  assert.deepEqual(responseCall.keys, ['response-item']);
  assert.equal(responseCall.mark, 9);
  assert.deepEqual(responseCall.response, { comment: 'Teacher draft\nSecond line\n', previousComment: 'Existing teacher response' });
  await page.evaluate(() => window.releaseGrade());
  await page.locator('.homework-result').waitFor();
  await response.fill('Stale dataset draft');
  await page.evaluate(() => window.responseUnavailable());
  assert.equal(await response.inputValue(), 'Stale dataset draft', 'unconfirmed save keeps response draft visible');
  assert.equal(await response.isEditable(), false, 'uncertainty blocks another write');
  assert.equal(await response.isEnabled(), true, 'retained draft can still be selected and copied');
  await page.evaluate(() => window.overlayResponseFixture(true));
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await response.inputValue(), 'Stale dataset draft', 'grade-only confirmation keeps unsaved response text');
  assert.equal(await response.isEditable(), false);
  await page.evaluate(() => window.showResponseFixture(true));
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await response.inputValue(), 'Updated baseline response', 'replacement dataset drops stale response drafts');
  assert.equal(await responseGrade.inputValue(), '', 'replacement dataset drops stale grade draft');
  await page.evaluate(() => window.showResponseFixture(true, true));
  await page.locator('.homework-table tbody tr').first().getByRole('button').click();
  assert.equal(await page.locator('.homework-teacher-response textarea').count(), 0, 'read-only views cannot edit responses');
  assert.match(await page.locator('.homework-teacher-response').innerText(), /Updated baseline response/);

  for (const fallback of [false, true]) {
    await page.evaluate(useFallback => window.showGroupFixture(useFallback), fallback);
    await page.locator(`[data-group-fixture="${fallback ? 'fallback' : 'normalized'}"] .homework-table tbody tr small`).filter({ hasText: 'Группа Альфа' }).waitFor();
    const groupFilter = page.getByRole('combobox', { name: 'Группа домашних заданий', exact: true });
    assert.deepEqual(await groupFilter.locator('option').allTextContents(), ['Все группы', 'Группа Альфа', 'Группа Бета']);
    assert.equal(await page.locator('.homework-table tbody tr').count(), 4);
    const search = page.getByRole('searchbox', { name: 'Поиск домашнего задания', exact: true });
    await search.fill('группа альфа');
    assert.equal(await page.locator('.homework-table tbody tr').count(), 1, 'official group labels are searchable in both normalizers');
    assert.match(await page.locator('.homework-table tbody tr').innerText(), /Тема Альфа/);
    await search.fill('');
    await groupFilter.selectOption('Группа Бета');
    assert.equal(await page.locator('.homework-table tbody tr').count(), 1, 'official group labels filter submissions');
    assert.equal(await page.locator('.homework-table tbody tr small').first().innerText(), 'Группа Бета', 'official group is displayed below the student');
    await groupFilter.selectOption('');
    const unknown = page.locator('.homework-table tbody tr').filter({ hasText: /Тема без группы|Тема с неоднозначной группой/ });
    assert.equal(await unknown.count(), 2);
    for (const row of await unknown.all()) assert.doesNotMatch(await row.innerText(), /Группа Альфа|Группа Бета/, 'same student names and structured groups cannot supply a guessed label');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile table must scroll inside its own wrapper');
  assert.ok(await page.locator('.homework-scroll').evaluate(el => el.scrollWidth > el.clientWidth), 'mobile overflow belongs to table wrapper');
  assert.deepEqual(errors, []);
  console.log('PASS: response drafts, explicit grade/save, busy/error/success, dataset invalidation, read-only response; compact details, duplicate-name identity filtering, all filtered pages selected, grade 12 bulk callback, filter reset, inline grade, pending/error/partial states, official groups display/search/filter in both normalizers, missing/ambiguous groups and mobile table overflow.');
} finally { await browser?.close(); await server.close(); }

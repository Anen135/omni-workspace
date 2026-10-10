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
    style.textContent = (await import('/src/styles.css?inline')).default
      + (await import('/src/workspace.css?inline')).default
      + (await import('/src/homework.css?inline')).default;
    document.head.append(style);
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = ReactDOM;
    const { HomeworkTable } = await import('/src/HomeworkTable.tsx');
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
    const onGrade = async (selected, mark) => {
      window.gradeCalls.push({ keys: selected.map(item => item.key), studentIds: selected.map(item => item.studentId), mark });
      if (window.gradingMode === 'pending') await new Promise(resolve => { window.releaseGrade = resolve; });
      if (window.gradingMode === 'error') throw new Error('Вымышленная ошибка сохранения');
      const keys = selected.map(item => item.key);
      return { confirmedKeys: window.gradingMode === 'partial' ? keys.slice(0, 1) : keys };
    };
    createRoot(document.getElementById('root')).render(React.createElement(HomeworkTable, {
      section: { data: [], error: null }, render: value => React.createElement('span', null, value.answer_text || 'файл'), items,
      grading: { busy: false, onGrade },
    }));
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

  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile table must scroll inside its own wrapper');
  assert.ok(await page.locator('.homework-scroll').evaluate(el => el.scrollWidth > el.clientWidth), 'mobile overflow belongs to table wrapper');
  assert.deepEqual(errors, []);
  console.log('PASS: compact details, duplicate-name identity filtering, all filtered pages selected, grade 12 bulk callback, filter reset, inline grade, pending/error/partial states and mobile table overflow.');
} finally { await browser?.close(); await server.close(); }

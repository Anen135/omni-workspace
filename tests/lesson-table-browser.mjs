import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir } from 'node:fs/promises';
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5199, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('http://127.0.0.1:5199/');
  await page.setContent('<div id="fixture" class="live-workspace"><div class="lesson-workspace"><section class="panel lesson-students" id="root"></section></div></div>');
  await page.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = (await import('/src/styles/styles.css?inline')).default + (await import('/src/app/workspace.css?inline')).default + (await import('/src/components/data/table.css?inline')).default + (await import('/src/features/lesson/reward-allocation.css?inline')).default;
    document.head.append(style);
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { StudentTable } = await import('/src/features/lesson/StudentTable.tsx');
    const { stageLessonBulk, stageLessonRewardTargets } = await import('/src/features/lesson/lesson-bulk.ts');
    const empty = () => ({ attendance: {}, marks: {}, rewards: {} });
    const base = Array.from({ length: 30 }, (_, index) => ({ id_stud: String(index + 1), id_vizit: String(100 + index), fio_stud: `Student ${String(index + 1).padStart(2, '0')}`, was: 1, mark4: 8, mark2: 9, prize: 0 }));
    window.requests = [];
    window.fetch = async (...args) => { window.requests.push(args); throw new Error('No requests expected in lesson-table fixture'); };
    function Fixture() {
      const [draft, setDraft] = React.useState(empty);
      const [revision, setRevision] = React.useState(0);
      const context = React.useMemo(() => ({}), [revision]);
      window.replaceLesson = () => { setRevision(value => value + 1); setDraft(empty()); };
      window.lessonDraft = draft;
      const items = base.map(row => ({ ...row, was: draft.attendance[row.id_stud]?.was ?? row.was, mark2: draft.marks[`${row.id_stud}:2`]?.mark ?? row.mark2, mark4: draft.marks[`${row.id_stud}:4`]?.mark ?? row.mark4, prize: draft.rewards[row.id_stud]?.reward ?? row.prize }));
      return React.createElement(StudentTable, { items, busy: false, onOpen: () => {}, lessonView: true, selectionContext: context, contextToken: String(revision),
        marks: { unavailable: '', allowDraft: true, onChange: () => {} }, rewards: { unavailable: '', onChange: () => {} }, attendance: { unavailable: '', saving: false, onChange: () => {}, onAll: () => {} },
        draftRewardIds: new Set(Object.keys(draft.rewards)),
        onBulkChange: (rows, change) => { const next = stageLessonBulk(base, draft, rows.map(row => row.id_stud), change); setDraft(next); },
        onRewardAllocation: targets => setDraft(stageLessonRewardTargets(base, draft, targets)),
      });
    }
    createRoot(document.getElementById('root')).render(React.createElement(Fixture));
  });
  const bulk = page.locator('.table-bulk-editor');
  await page.getByRole('checkbox', { name: 'Выбрать ученика: Student 01', exact: true }).check();
  await bulk.getByRole('button', { name: 'Заполнить столбец (1)', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Работа на уроке: Student 01', exact: true }).innerText(), '12');
  assert.equal(await page.getByRole('button', { name: 'Работа на уроке: Student 02', exact: true }).innerText(), '8');
  assert.equal(await page.getByRole('checkbox', { name: 'Выбрать ученика: Student 01', exact: true }).isChecked(), true);
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Выбрать ученика: Student 26', exact: true }).check();
  await bulk.getByLabel('Столбец для массового редактирования').selectOption('mark2');
  await bulk.getByLabel('Единое значение').fill('11');
  await bulk.getByRole('button', { name: 'Заполнить столбец (2)', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => Object.keys(window.lessonDraft.marks).sort()), ['1:2', '1:4', '26:2']);
  await bulk.getByLabel('Область массового редактирования').selectOption('filtered');
  await bulk.getByLabel('Столбец для массового редактирования').selectOption('mark4');
  await bulk.getByLabel('Единое значение').fill('12');
  await bulk.getByRole('button', { name: 'Заполнить столбец (30)', exact: true }).click();
  assert.equal(await page.evaluate(() => Object.values(window.lessonDraft.marks).filter(change => change.type === 4 && change.mark === 12).length), 30, 'all-filtered spans every page');
  await page.getByLabel('Поиск ученика').fill('Student 03');
  assert.equal(await page.locator('tbody input[type=checkbox]:checked').count(), 0, 'filter change clears selection');
  await bulk.getByLabel('Столбец для массового редактирования').selectOption('reward');
  await bulk.getByLabel('Единое значение').selectOption('3');
  await bulk.getByRole('button', { name: 'Заполнить столбец (1)', exact: true }).click();
  assert.equal(await page.evaluate(() => window.lessonDraft.rewards['3'].reward), 3);
  await page.getByLabel('Поиск ученика').fill('');
  await bulk.getByRole('button', { name: 'Заполнить столбец (30)', exact: true }).click();
  assert.match(await bulk.getByRole('alert').innerText(), /5 топкойнов/);
  assert.deepEqual(await page.evaluate(() => Object.keys(window.lessonDraft.rewards)), ['3'], 'over-budget batch stages nothing, including earlier rows');
  await page.getByRole('checkbox', { name: 'Выбрать ученика: Student 01', exact: true }).check();
  await page.evaluate(() => window.replaceLesson());
  await page.waitForFunction(() => Object.keys(window.lessonDraft.marks).length === 0);
  assert.equal(await page.locator('tbody input[type=checkbox]:checked').count(), 0, 'remote context replacement clears keys synchronously');
  assert.equal(await bulk.getByRole('alert').count(), 0, 'a failed bulk action from the prior lesson does not leak into the new lesson');
  assert.deepEqual(await page.evaluate(() => window.requests), []);
  await mkdir('.omni-browser/lesson-bulk', { recursive: true });
  await page.screenshot({ path: '.omni-browser/lesson-bulk/desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.omni-browser/lesson-bulk/narrow.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: lesson shared bulk editing across pages, subset, context invalidation, atomic reward budget, draft-only and narrow layout.');
} finally { await browser?.close(); await server.close(); }

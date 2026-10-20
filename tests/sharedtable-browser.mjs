import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Fictional rows exercise the reusable controls without contacting Omni.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5196, strictPort: true,
  watch: { ignored: ['**/dist*/**', '**/.omni-browser/**'] } } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5196/');
  await page.setContent('<div id="root"></div>');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { DataTable } = await import('/src/components/data/DataTable.tsx');
    const { TableBulkEditor } = await import('/src/components/data/TableBulkEditor.tsx');
    const root = ReactDOM.createRoot(document.getElementById('root'));
    window.tableCalls = [];
    window.tableMode = 'success';
    const fields = [
      { id: 'mark', label: 'Grade', input: { kind: 'number', min: 1, max: 12, step: 1 },
        validate: value => value.trim() && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12 ? '' : 'Invalid grade',
        unavailableReason: row => row.blocked ? 'Read only row' : '' },
      { id: 'attendance', label: 'Attendance', input: { kind: 'select', options: [{ value: 'yes', label: 'Present' }, { value: 'no', label: 'Absent' }] },
        validate: value => ['yes', 'no'].includes(value) ? '' : 'Invalid attendance', unavailableReason: () => '' },
    ];
    function Fixture({ mode, contextKey }) {
      const rows = React.useMemo(() => Array.from({ length: mode === 'oversized' ? 101 : 7 }, (_, index) => ({
        id: String(index), name: 'Row ' + index, blocked: mode === 'unavailable' && index === 6,
      })), [mode]);
      const [selectedKeys, setSelectedKeys] = React.useState(new Set());
      const eligibleKeys = new Set(rows.filter(row => !row.blocked).map(row => row.id));
      return React.createElement(React.Fragment, null,
        React.createElement(DataTable, {
          rows: rows.slice(0, 5), getRowKey: row => row.id, caption: 'Fixture table',
          columns: [{ id: 'name', heading: 'Name', ariaSort: 'ascending', cell: row => row.name }],
          selection: { selectedKeys, eligibleKeys, getKey: row => row.id, locked: false,
            onToggle: (row, checked) => setSelectedKeys(previous => { const next = new Set(previous); if (checked) next.add(row.id); else next.delete(row.id); return next; }),
            onToggleAll: checked => setSelectedKeys(new Set(checked ? eligibleKeys : [])),
          },
          renderAfterRow: row => row.id === '0' && React.createElement('tr', { className: 'detail' }, React.createElement('td', { colSpan: 2 }, 'Detail content')),
        }),
        React.createElement(TableBulkEditor, {
          fields, filteredRows: rows, selectedRows: rows.filter(row => selectedKeys.has(row.id)), locked: false,
          applyLabel: 'Apply', defaultValue: '12', contextKey,
          onApply: async (submitted, field, value) => {
            window.tableCalls.push({ ids: submitted.map(row => row.id), field, value });
            if (window.tableMode === 'pending') await new Promise(resolve => { window.releaseTable = resolve; });
            if (window.tableMode === 'error') throw new Error('Readback failed');
          },
        }),
      );
    }
    let currentMode;
    let contextKey;
    const renderFixture = () => root.render(React.createElement(Fixture, { key: currentMode, mode: currentMode, contextKey }));
    window.showTableFixture = mode => { currentMode = mode; contextKey = {}; renderFixture(); };
    window.replaceTableContext = () => { contextKey = {}; renderFixture(); };
    window.showTableFixture('normal');
  });
  const header = page.locator('thead input[type=checkbox]');
  const apply = page.getByRole('button', { name: /^Apply/ });
  const scope = page.getByRole('combobox', { name: 'Область массового редактирования' });
  const column = page.getByRole('combobox', { name: 'Столбец для массового редактирования' });
  const number = page.getByRole('spinbutton');
  await header.waitFor();
  assert.equal(await page.locator('th[aria-sort=ascending]').innerText(), 'Name');
  assert.equal(await page.locator('.detail td').getAttribute('colspan'), '2');
  assert.equal(await apply.isDisabled(), true, 'nothing selected cannot be applied');
  await header.check();
  assert.equal(await scope.locator('option').first().innerText(), 'Выбранным строкам (7)', 'selection spans rows beyond the rendered page');
  await page.locator('tbody input[type=checkbox]').first().uncheck();
  assert.equal(await header.evaluate(input => input.indeterminate), true);
  await number.fill('13');
  assert.equal(await apply.isDisabled(), true, 'invalid numeric value cannot submit');
  await number.fill('11');
  await page.evaluate(() => { window.tableMode = 'pending'; });
  await apply.evaluate(button => { button.click(); button.click(); });
  await page.waitForFunction(() => window.tableCalls.length === 1);
  assert.equal(await page.getByRole('button', { name: 'Сохранение…' }).isDisabled(), true);
  assert.equal(await scope.isDisabled(), true, 'pending work locks scope and field controls');
  assert.equal(await column.isDisabled(), true);
  assert.deepEqual(await page.evaluate(() => window.tableCalls[0]), { ids: ['1', '2', '3', '4', '5', '6'], field: 'mark', value: '11' });
  await page.evaluate(() => { window.releaseTable(); window.tableMode = 'success'; });
  await apply.waitFor();
  await header.uncheck();
  await scope.selectOption('filtered');
  await apply.click();
  await page.waitForFunction(() => window.tableCalls.length === 2);
  assert.equal((await page.evaluate(() => window.tableCalls[1])).ids.length, 7, 'explicit filtered scope includes every page without selecting checkboxes');
  await column.selectOption('attendance');
  await page.getByRole('combobox', { name: 'Значение', exact: true }).selectOption('no');
  await apply.click();
  await page.waitForFunction(() => window.tableCalls.length === 3);
  assert.equal((await page.evaluate(() => window.tableCalls[2])).value, 'no');

  await page.evaluate(() => window.showTableFixture('unavailable'));
  await scope.selectOption('filtered');
  assert.equal(await apply.isDisabled(), true, 'one unavailable target rejects the whole batch');
  assert.match(await page.locator('.table-bulk-help').innerText(), /Недоступно: 1.*Read only row/);
  assert.equal(await page.evaluate(() => window.tableCalls.length), 3, 'unavailable rows are never silently omitted');
  await column.selectOption('attendance');
  assert.equal(await apply.isEnabled(), true, 'eligibility follows the explicitly selected field');
  await page.evaluate(() => { window.tableMode = 'error'; });
  await apply.click();
  await page.getByRole('alert').filter({ hasText: 'Readback failed' }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Значение', exact: true }).inputValue(), 'yes', 'failure retains the current draft');
  await page.evaluate(() => window.replaceTableContext());
  await page.getByRole('alert').filter({ hasText: 'Readback failed' }).waitFor({ state: 'detached' });
  assert.equal(await column.inputValue(), 'attendance', 'context replacement retains the chosen column');
  assert.equal(await page.getByRole('combobox', { name: 'Значение', exact: true }).inputValue(), 'yes', 'context replacement retains the entered value');

  await page.evaluate(() => { window.tableMode = 'pending'; window.releaseTable = null; });
  await apply.click();
  await page.waitForFunction(() => typeof window.releaseTable === 'function');
  await page.evaluate(() => window.replaceTableContext());
  assert.equal(await page.getByRole('button', { name: 'Сохранение…' }).isDisabled(), true, 'context replacement cannot release the pending operation lock');
  assert.equal(await scope.isDisabled(), true);
  await page.evaluate(() => { window.tableMode = 'error'; window.releaseTable(); });
  await apply.waitFor();
  assert.equal(await page.getByRole('alert').count(), 0, 'a delayed old-context rejection never appears in the new context');
  assert.equal(await scope.inputValue(), 'filtered', 'scope remains unchanged after context replacement');
  await apply.click();
  await page.getByRole('alert').filter({ hasText: 'Readback failed' }).waitFor();
  assert.equal(await page.evaluate(() => window.tableCalls.length), 6, 'a same-context rejection remains visible and never retries');

  await page.evaluate(() => window.showTableFixture('oversized'));
  await scope.selectOption('filtered');
  assert.equal(await apply.isDisabled(), true, '101 targets cannot be split or submitted');
  assert.match(await page.getByRole('alert').innerText(), /не более 100/);
  assert.equal(await page.evaluate(() => window.tableCalls.length), 6, 'oversized batch performs no callbacks');
  assert.deepEqual(errors, []);
  console.log('PASS: shared table semantic headers/details, filtered selection and indeterminate state; explicit scopes, numeric/select fields, invalid/unavailable/cap100 rejection, retained drafts and double-submit lock.');
} finally { await browser?.close(); await server.close(); }

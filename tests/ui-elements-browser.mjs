import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5198, strictPort: true } });
let browser;
try {
  await server.listen();
  await mkdir('tmp', { recursive: true });
  await writeFile('tmp/ui-sort-harness.html', `<!doctype html><div id="root"></div><script type="module">
    import React, { useState } from 'react';
    import { createRoot } from 'react-dom/client';
    import { DataTable } from '/src/components/data/DataTable.tsx';
    const h = React.createElement;
    const repeated = { id: 'a', value: 10 };
    const rows = [repeated, { id: 'b', value: 2 }, repeated];
    function Harness() {
      const [clicked, setClicked] = useState('');
      const columns = [
        { id: 'value', kind: 'data', heading: 'Значение', value: row => row.value, cell: row => row.value },
        { id: 'action', kind: 'action', control: 'button', heading: 'Действие', cell: (row, index) => h('button', { onClick: () => setClicked(row.id + ':' + index) }, 'Исходный индекс ' + index) },
      ];
      return h(React.Fragment, null, h(DataTable, { rows, columns, getRowKey: (row, index) => row.id + index,
        label: 'Автономная таблица', renderAfterRow: (row, index) => h('tr', { 'data-detail': row.id + ':' + index }, h('td', { colSpan: 2 }, 'Карточка ' + index)) }),
        h('output', { 'aria-label': 'Результат действия' }, clicked));
    }
    createRoot(document.getElementById('root')).render(h(Harness));
  </script>`);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('**/api/omni/**', route => {
    const action = route.request().url().split('/').at(-1);
    requests.push(action);
    assert.equal(action, 'status', 'UI fixtures never send academic requests');
    return route.fulfill({ json: { connected: false } });
  });
  await page.goto('http://127.0.0.1:5198/');
  await page.getByRole('button', { name: 'Справка', exact: true }).click();
  const link = page.getByRole('button', { name: 'Тесты UI элементов', exact: true });
  assert.equal(await link.isVisible(), false, 'developer entry is collapsed by default');
  await page.locator('summary').filter({ hasText: 'Для разработчика' }).click();
  await link.click();
  const table = page.getByRole('table', { name: 'Универсальная таблица: тестовые данные' });
  assert.equal(await table.locator('tbody tr').count(), 6);
  assert.equal(await page.locator('nav').getByRole('button', { name: 'Тесты UI элементов' }).count(), 0);
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(3).innerText(), '0');
  assert.equal(await table.locator('thead button').count(), 5, 'all data columns receive sort controls');
  assert.equal(await table.getByRole('columnheader', { name: 'Действия', exact: true }).locator('button').count(), 0, 'action-only columns are not sortable');
  const gradeHeading = table.getByRole('button', { name: 'Оценка', exact: true });
  await gradeHeading.click();
  assert.equal(await table.getByRole('columnheader', { name: 'Оценка' }).getAttribute('aria-sort'), 'ascending');
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(3).innerText(), '0');
  await gradeHeading.focus();
  await page.keyboard.press('Enter');
  assert.equal(await table.getByRole('columnheader', { name: 'Оценка' }).getAttribute('aria-sort'), 'descending');
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(3).innerText(), '11', 'sort covers the complete dataset before pagination');
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  assert.equal(await table.locator('tbody tr').last().locator('td').nth(3).innerText(), '—', 'missing data remains last even descending');
  await table.getByRole('button', { name: 'Группа', exact: true }).click();
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(2).innerText(), 'UI-101');
  await page.getByText('Страница 1 из 2', { exact: true }).waitFor();
  await table.getByRole('button', { name: 'Состояние', exact: true }).click();
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(4).innerText(), 'Недоступен для выбора');
  await table.getByRole('button', { name: 'Ученик', exact: true }).click();

  const all = page.getByRole('checkbox', { name: 'Выбрать все доступные тестовые строки' });
  await page.getByLabel('Группа', { exact: true }).selectOption('UI-101');
  await page.getByLabel('Оценка: от', { exact: true }).fill('4');
  await page.getByLabel('Оценка: до', { exact: true }).fill('10');
  assert.equal(await table.locator('tbody tr').count(), 4, 'field and inclusive range filters combine');
  await page.getByLabel('Дата: от', { exact: true }).fill('2026-10-07');
  await page.getByLabel('Дата: до', { exact: true }).fill('2026-10-09');
  assert.equal(await table.locator('tbody tr').count(), 2, 'date range composes with group/grade');
  await page.getByLabel('Доступен для выбора', { exact: true }).selectOption('true');
  await page.getByLabel('Заполненность оценки', { exact: true }).selectOption('filled');
  assert.equal(await table.locator('tbody tr').count(), 2);
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByLabel('Оценка: от', { exact: true }).fill('0');
  await page.getByLabel('Оценка: до', { exact: true }).fill('0');
  assert.equal(await table.locator('tbody tr').count(), 1, 'zero bounds are active');
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByLabel('Доступен для выбора', { exact: true }).selectOption('false');
  assert.equal(await table.locator('tbody tr').count(), 1, 'false is a real filter value');
  assert.equal(await all.isDisabled(), true, 'unavailable matching rows cannot be selected');
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByLabel('Заполненность оценки', { exact: true }).selectOption('empty');
  assert.equal(await table.locator('tbody tr').count(), 1);
  assert.equal(await table.locator('tbody tr').first().locator('td').nth(3).innerText(), '—');
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByLabel('Группа', { exact: true }).selectOption('UI-102');
  await all.check();
  await page.getByRole('status').filter({ hasText: 'Выбрано: 5' }).waitFor();
  await page.getByRole('button', { name: 'Снять выбор', exact: true }).click();
  await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
  await page.getByLabel('Строк на странице', { exact: true }).selectOption('12');
  assert.equal(await table.locator('tbody tr').count(), 12);
  assert.equal(await page.getByRole('button', { name: 'Далее', exact: true }).isDisabled(), true);
  await page.getByLabel('Строк на странице', { exact: true }).selectOption('6');

  await all.check();
  await page.getByRole('status').filter({ hasText: 'Выбрано: 11' }).waitFor();
  await page.getByRole('checkbox', { name: 'Выбрать: Тестовый ученик 01' }).uncheck();
  assert.equal(await all.evaluate(node => node.indeterminate), true);
  await page.getByRole('button', { name: 'Подробнее: Тестовый ученик 01' }).click();
  await table.getByText('Тестовая карточка ui-1.', { exact: false }).waitFor();
  await page.getByRole('checkbox', { name: 'Заблокировать действия' }).check();
  assert.equal(await all.isDisabled(), true);
  assert.equal(await gradeHeading.isDisabled(), true, 'locked table disables sort controls');
  assert.equal(await page.getByRole('button', { name: 'Снять выбор' }).isDisabled(), true);
  await page.getByRole('checkbox', { name: 'Заблокировать действия' }).uncheck();
  await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await table.getByText('Тестовый ученик 07', { exact: true }).waitFor();
  await page.getByLabel('Поиск тестовых строк').fill('UI-102');
  assert.equal(await table.locator('tbody tr').count(), 6);
  await page.getByRole('checkbox', { name: 'Пустая таблица' }).check();
  assert.equal(await table.locator('tbody tr').count(), 0);
  await page.getByRole('status').filter({ hasText: 'Тестовых строк нет.' }).waitFor();
  await page.getByRole('checkbox', { name: 'Пустая таблица' }).uncheck();
  await page.getByLabel('Поиск тестовых строк').fill('');
  await page.getByRole('button', { name: 'Включить тёмную тему' }).click();
  await page.screenshot({ path: 'tmp/ui-elements-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.getByLabel('Раздел', { exact: true }).inputValue(), 'ui-tests');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'tmp/ui-elements-mobile.png', animations: 'disabled' });
  await page.reload();
  await table.waitFor();
  await page.getByRole('button', { name: 'Вернуться в справку' }).click();
  await page.getByRole('heading', { name: 'Справка', exact: true }).waitFor();
  await page.goto('http://127.0.0.1:5198/tmp/ui-sort-harness.html');
  const standalone = page.getByRole('table', { name: 'Автономная таблица' });
  await standalone.getByRole('button', { name: 'Значение', exact: true }).click();
  assert.equal(await standalone.locator('tbody tr').first().locator('td').first().innerText(), '2');
  await standalone.getByRole('button', { name: 'Исходный индекс 1', exact: true }).click();
  assert.equal(await page.getByLabel('Результат действия').innerText(), 'b:1', 'sorting does not retarget row callbacks');
  assert.deepEqual(await standalone.locator('[data-detail]').evaluateAll(nodes => nodes.map(node => node.dataset.detail)), ['b:1', 'a:0', 'a:2'], 'expanded rows preserve identities and stable duplicate order');
  await standalone.getByRole('button', { name: 'Значение', exact: true }).click();
  assert.equal(await standalone.locator('tbody tr').first().locator('td').first().innerText(), '10');
  assert.deepEqual(errors, []);
  assert.ok(requests.every(action => action === 'status'));
  console.log('PASS: hidden help entry, real DataTable fixtures, selection/mixed/locked/empty/details/filter/paging, saved route, dark/mobile and no academic requests.');
} finally { await browser?.close(); await server.close(); }

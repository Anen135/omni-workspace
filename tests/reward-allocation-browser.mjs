import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Fictional full roster: callbacks only record local draft targets, never transport writes.
const { outputFiles } = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { RewardAllocation } from './src/features/lesson/RewardAllocation';
    const root = createRoot(document.getElementById('root'));
    const initial = () => ({
      items: [12, 10, 7].map((mark4, i) => ({ id_stud: i + 1, fio_stud: 'Student ' + (i + 1), was: 1, mark4, prize: 0 })),
      studentAverages: new Map([['1', '10']]), draftRewardIds: new Set(),
      disabled: false, contextToken: 'lesson-a',
      onApply: (targets, replace) => {
        if (window.rejectApply) throw new Error('Draft changed; retry explicitly.');
        window.applied.push({ targets, replace });
      },
    });
    let props = initial();
    window.applied = [];
    const render = () => flushSync(() => root.render(React.createElement(RewardAllocation, props)));
    window.update = patch => { props = { ...props, ...patch }; render(); };
    window.reset = () => { props = initial(); render(); };
    render();
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"development"' },
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.setContent('<main id="root"></main>');
  await page.addStyleTag({ content: (await readFile('src/styles/styles.css', 'utf8')).replace(/^@import[^;]+;/, '') + await readFile('src/app/workspace.css', 'utf8') + await readFile('src/components/data/table.css', 'utf8') + await readFile('src/features/lesson/reward-allocation.css', 'utf8') });
  await page.addScriptTag({ content: outputFiles[0].text });
  const apply = page.getByRole('button', { name: 'Распределить топкойны', exact: true });
  const gear = page.getByRole('button', { name: 'Настройки распределения топкойнов', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Настройки распределения топкойнов', exact: true });
  assert.equal(await page.locator('.panel.reward-allocation').count(), 0, 'no permanent reward card');
  assert.equal(await page.locator('table').count(), 0, 'settings table is not in page flow');
  await apply.click();
  assert.deepEqual(await page.evaluate(() => window.applied), [{ targets: [{ id: '1', coins: 3 }, { id: '2', coins: 2 }], replace: false }], 'one click computes and applies');
  await page.evaluate(() => { window.rejectApply = true; });
  await apply.click();
  assert.equal(await page.getByRole('alert').textContent(), 'Draft changed; retry explicitly.');
  assert.equal((await page.evaluate(() => window.applied)).length, 1, 'failure never retries');
  await page.evaluate(() => { window.rejectApply = false; });
  await gear.click();
  assert.equal(await dialog.locator('table').isVisible(), false, 'details are collapsed initially');
  await dialog.getByText('Подробности расчёта', { exact: true }).click();
  assert.deepEqual(await dialog.locator('tbody tr').evaluateAll(rows => rows.map(row => row.cells[3].textContent)), ['3', '2', '0']);
  await dialog.getByLabel('Минимальный балл для топкойнов').fill('11');
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  assert.equal((await page.evaluate(() => window.applied)).length, 1, 'changing settings never applies');
  await apply.click();
  assert.deepEqual((await page.evaluate(() => window.applied)).at(-1).targets, [{ id: '1', coins: 3 }]);
  await gear.click();
  await dialog.getByLabel('Минимальный балл для топкойнов').fill('');
  await page.keyboard.press('Escape');
  assert.equal(await apply.isDisabled(), true);
  assert.match(await page.getByRole('status').textContent(), /от 1 до 12/);
  assert.equal(await gear.evaluate(element => element === document.activeElement), true);
  await gear.click();
  await dialog.getByLabel('Минимальный балл для топкойнов').fill('7');
  await dialog.getByLabel('Источник балла для топкойнов').selectOption('average');
  await page.evaluate(() => window.update({ studentAveragesLoading: true }));
  await page.keyboard.press('Escape');
  assert.equal(await apply.isDisabled(), true);
  assert.match(await page.getByRole('status').textContent(), /Дождитесь загрузки/);
  await page.evaluate(() => window.update({ studentAveragesLoading: false, studentAveragesError: 'Fixture averages failed' }));
  assert.equal(await apply.isDisabled(), true);
  await page.evaluate(() => window.update({ studentAveragesError: '', studentAverages: new Map([['1', '12']]) }));
  await apply.click();
  assert.deepEqual((await page.evaluate(() => window.applied)).at(-1).targets, [{ id: '1', coins: 3 }], 'click uses fresh averages');
  await gear.click();
  await dialog.getByLabel('Заменить существующие награды и ручной черновик', { exact: true }).check();
  await dialog.getByLabel('Источник балла для топкойнов').selectOption('mark4');
  await page.evaluate(() => window.update({ items: [{ id_stud: 1, fio_stud: 'Student 1', was: 1, mark4: 5, prize: 2 }] }));
  await page.keyboard.press('Escape');
  await apply.click();
  assert.deepEqual((await page.evaluate(() => window.applied)).at(-1), { targets: [{ id: '1', coins: 0 }], replace: true });
  await gear.click();
  await page.evaluate(() => window.update({ contextToken: 'lesson-b', items: [{ id_stud: 1, was: 1, mark4: 12, prize: 0 }], draftRewardIds: new Set(['1']) }));
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await apply.isDisabled(), true, 'context reset restores preservation of manual removal');
  await gear.click();
  assert.equal(await dialog.getByLabel('Заменить существующие награды и ручной черновик', { exact: true }).isChecked(), false);
  assert.equal(await dialog.getByLabel('Минимальный балл для топкойнов').inputValue(), '7');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.update({ items: [{ id_stud: 1, prize: 99 }] }));
  assert.equal(await apply.isDisabled(), true);
  assert.match(await page.getByRole('status').textContent(), /Неизвестные топкойны/);
  await page.evaluate(() => window.update({ items: [{ id_stud: 1, was: 1, mark4: 12, prize: 0 }], draftRewardIds: new Set(), disabled: true }));
  assert.equal(await apply.isDisabled(), true);
  await gear.click();
  assert.equal(await dialog.isVisible(), true, 'settings remain accessible while action is blocked');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await mkdir('.omni-browser/rewards', { recursive: true });
  await page.screenshot({ path: '.omni-browser/rewards/settings-narrow.png' });
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
    assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true);
  }
  await page.keyboard.press('Escape');
  assert.equal(await gear.evaluate(element => element === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('PASS quick full-group reward allocation, settings-only modal, latest inputs, explicit replacement, source errors, disabled/context paths, no retries and narrow keyboard layout');
} finally { await browser.close(); }

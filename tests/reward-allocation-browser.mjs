import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Isolated fictional roster; onApply records a draft callback and has no transport.
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
        if (window.rejectApply) throw new Error('Draft changed; refresh the proposal.');
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
  await page.setContent('<main id="root"></main>');
  await page.addStyleTag({ content: await readFile('src/styles/styles.css', 'utf8') + await readFile('src/app/workspace.css', 'utf8') + await readFile('src/features/lesson/reward-allocation.css', 'utf8') });
  await page.addScriptTag({ content: outputFiles[0].text });
  await page.getByRole('button', { name: 'Распределить топкойны', exact: true }).click();
  const calculate = page.getByRole('button', { name: 'Рассчитать предложение', exact: true });
  const apply = page.getByRole('button', { name: 'В черновик', exact: true });
  await calculate.click();
  assert.deepEqual(await page.locator('tbody tr').evaluateAll(rows => rows.map(row => row.cells[3].textContent)), ['3', '2', '0']);
  assert.equal(await apply.isEnabled(), true);
  await page.evaluate(() => { window.rejectApply = true; });
  await apply.click();
  assert.equal(await page.getByRole('alert').textContent(), 'Draft changed; refresh the proposal.');
  assert.equal(await apply.isEnabled(), true, 'rejected draft update retains the preview');
  assert.equal(await page.locator('tbody tr').count(), 3);
  assert.deepEqual(await page.evaluate(() => window.applied), []);
  await page.evaluate(() => { window.rejectApply = false; });
  await calculate.click();
  assert.equal(await page.getByRole('alert').count(), 0, 'recalculation clears the draft rejection');

  for (const change of ['mark', 'context', 'average', 'manual']) {
    await page.evaluate(change => {
      if (change === 'mark') window.update({ items: [11, 10, 7].map((mark4, i) => ({ id_stud: i + 1, was: 1, mark4, prize: 0 })) });
      if (change === 'context') window.update({ contextToken: 'lesson-b' });
      if (change === 'average') window.update({ studentAverages: new Map([['1', '12']]) });
      if (change === 'manual') window.update({ draftRewardIds: new Set(['1']) });
    }, change);
    assert.equal(await apply.isDisabled(), true, `${change} invalidates preview before click`);
    assert.equal(await page.getByRole('status').textContent(), 'Данные урока изменились. Рассчитайте предложение заново.');
    await calculate.click();
  }
  assert.deepEqual(await page.evaluate(() => window.applied), []);
  await page.getByLabel('Минимальный балл для топкойнов').fill('9');
  assert.equal(await apply.count(), 0, 'changing options removes preview');
  await calculate.click();
  await page.evaluate(() => window.update({ disabled: true }));
  assert.equal(await apply.isDisabled(), true);
  await page.evaluate(() => window.reset());
  await calculate.click();
  await apply.click();
  assert.deepEqual(await page.evaluate(() => window.applied), [{ targets: [{ id: '1', coins: 3 }, { id: '2', coins: 2 }], replace: false }]);
  assert.equal(await apply.count(), 0, 'applying consumes preview');

  await page.getByLabel('Заменить существующие награды и ручной черновик', { exact: true }).check();
  await page.evaluate(() => window.update({ items: [{ id_stud: 1, fio_stud: 'Student 1', was: 1, mark4: 5, prize: 2 }] }));
  await calculate.click();
  await apply.click();
  assert.deepEqual((await page.evaluate(() => window.applied)).at(-1), { targets: [{ id: '1', coins: 0 }], replace: true });

  await page.evaluate(() => window.update({ items: [{ id_stud: 1, prize: 99 }] }));
  await calculate.click();
  assert.equal(await page.getByRole('alert').count(), 1);
  assert.equal(await apply.count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('PASS reward allocation preview, rejected draft callback, stale data/options, draft-only apply, replacement, invalid data and mobile layout');
} finally {
  await browser.close();
}

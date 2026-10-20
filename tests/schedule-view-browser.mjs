import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { scheduleFixture } from './fixtures/schedule-view-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const originalFile = path => execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' });
const { outputFiles } = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { flushSync } from 'react-dom';
    import { ScheduleView } from './src/features/schedule/ScheduleView';
    const root = createRoot(document.getElementById('root'));
    const fixture = ${JSON.stringify(scheduleFixture)};
    window.openedLessons = [];
    let props = { data: fixture, today: '2026-10-19', busy: false,
      onOpen: (date, slot) => window.openedLessons.push({ date, slot }),
      lessonEstimate: lesson => lesson.slot === '1' ? { amount: 0, initial: true } : lesson.slot === '2' ? { amount: 1200, initial: false } : { amount: null, initial: false },
    };
    window.updateSchedule = patch => { props = { ...props, ...patch }; flushSync(() => root.render(React.createElement(ScheduleView, props))); };
    window.updateSchedule({});
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
  plugins: baseline ? [{ name: 'baseline-schedule', setup(builder) {
    builder.onLoad({ filter: /[\\/]schedule[\\/](ScheduleView\.tsx|schedule-layout\.ts)$/ }, args => {
      const path = args.path.replaceAll('\\', '/').split('/').at(-1);
      return { contents: originalFile(`src/features/schedule/${path}`), loader: path.endsWith('tsx') ? 'tsx' : 'ts' };
    });
  } }] : [],
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<div id="root" class="panel" style="margin:20px;min-width:0"></div>');
  await page.addStyleTag({ content: await readFile('src/styles/styles.css', 'utf8') + await readFile('src/app/workspace.css', 'utf8') + (baseline ? originalFile('src/features/schedule/schedule.css') : await readFile('src/features/schedule/schedule.css', 'utf8')) });
  await page.addScriptTag({ content: outputFiles[0].text });
  await mkdir('tmp', { recursive: true });
  const phase = baseline ? 'before' : 'after';
  await page.screenshot({ path: `tmp/schedule-${phase}-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `tmp/schedule-${phase}-narrow.png`, fullPage: true });
  if (baseline) {
    const clipped = await page.locator('.schedule-card').evaluateAll(cards => cards.filter(card => card.scrollHeight > card.clientHeight).length);
    console.log(`BASELINE ${clipped} clipped timed cards; desktop/narrow screenshots saved.`);
  } else {
    assert.equal(await page.locator('.schedule-day-label').count(), 7);
    assert.equal(await page.locator('.schedule-card').count(), 6);
    assert.equal(await page.locator('.schedule-unscheduled article').count(), 4);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page itself does not overflow');
    const region = page.getByRole('region', { name: 'Недельная сетка расписания' });
    assert.equal(await region.getAttribute('tabindex'), '0', 'keyboard users can scroll the week');
    assert.equal(await region.evaluate(node => node.scrollWidth > node.clientWidth), true);
    const cardGeometry = await page.locator('.schedule-card').evaluateAll(cards => cards.map(card => {
      const rect = card.getBoundingClientRect();
      return { key: card.dataset.lessonKey, start: card.dataset.start, end: card.dataset.end, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height, clipped: card.scrollHeight > card.clientHeight + 1 };
    }));
    assert.equal(cardGeometry.some(card => card.clipped), false, 'full subjects, metadata and actions fit every card');
    assert.equal(await page.locator('.schedule-card').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect();
      const action = card.querySelector('button').getBoundingClientRect();
      return action.top >= bounds.top && action.bottom <= bounds.bottom && action.left >= bounds.left && action.right <= bounds.right;
    })), true, 'bottom actions remain fully inside the cards');
    assert.equal(await page.locator('.schedule-time-line').evaluateAll(lines => lines.every(line => {
      const rail = document.querySelector('.schedule-hours time[data-minute="' + line.dataset.minute + '"]');
      return Math.abs(line.getBoundingClientRect().top - rail.getBoundingClientRect().top) <= 1;
    })), true, 'every shared gridline is aligned with its time-rail label');
    const simultaneous = cardGeometry.filter(card => card.start === '435');
    assert.equal(simultaneous.length, 3);
    assert.ok(simultaneous.every(card => Math.abs(card.top - simultaneous[0].top) <= 1), 'same real time is aligned across lanes and days');
    const firstDay = cardGeometry.filter(card => card.key.startsWith('2026-10-19:'));
    for (let i = 0; i < firstDay.length; i++) for (let j = i + 1; j < firstDay.length; j++) {
      const a = firstDay[i], b = firstDay[j];
      assert.ok(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1, 'cards never intersect');
    }
    assert.ok(cardGeometry.find(card => card.key === '2026-10-21:4').height > 0, 'late event remains in the grid');
    assert.equal(await page.locator('.schedule-card').filter({ hasText: '≈ 0 ₽' }).count(), 2, 'zero estimates are visible');
    assert.equal(await page.locator('.schedule-card').filter({ hasText: '≈ 1 200 ₽' }).count(), 1);
    assert.equal(await page.locator('.schedule-card-estimate').count(), 3, 'unknown estimates are omitted');
    assert.match(await page.locator('.schedule-card-estimate').first().getAttribute('title'), /начальн.*настройк/i);
    const open = page.locator('.schedule-card').first().getByRole('button', { name: /Открыть урок/ });
    await open.focus(); await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.openedLessons), [{ date: '2026-10-19', slot: '1' }]);
    await page.evaluate(() => window.updateSchedule({ busy: true }));
    assert.equal(await open.isDisabled(), true);
    await page.evaluate(() => window.updateSchedule({ busy: false }));
    await page.getByRole('button', { name: 'Список', exact: true }).click();
    assert.equal(await page.locator('.schedule-list article').count(), 10);
    assert.equal(await page.locator('.schedule-list article').filter({ hasText: 'Нулевой интервал' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'agenda fits a narrow viewport');
    assert.equal(await page.locator('.schedule-list article').evaluateAll(cards => cards.some(card => card.scrollHeight > card.clientHeight + 1)), false);
    await page.screenshot({ path: 'tmp/schedule-after-agenda-narrow.png', fullPage: true });
    await page.evaluate(() => window.updateSchedule({ data: { dates: { 1: '2026-10-19' }, daysShort: { 1: 'Пн' }, body: { 1: { 1: { name_spec: 'Только без времени' } } } }, lessonEstimate: undefined }));
    await page.getByRole('button', { name: 'Неделя', exact: true }).click();
    assert.equal(await page.locator('.schedule-card').count(), 0);
    assert.equal(await page.locator('.schedule-unscheduled article').count(), 1, 'untimed-only week remains visible');
    assert.equal(await page.locator('.schedule-card-estimate').count(), 0, 'parent estimate integration is optional');
    await page.evaluate(() => window.updateSchedule({ data: { dates: { 1: '2026-10-19' }, body: {} } }));
    assert.equal(await page.getByRole('heading', { name: 'На эту неделю занятий нет' }).count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS schedule content-sized aligned timeline, short/overlap/early/late/untimed cases, keyboard open, busy state, estimate metadata and narrow agenda/overflow');
  }
} finally { await browser.close(); }

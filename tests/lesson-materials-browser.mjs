import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Isolated fictional lesson data; only read-only method-package calls are mocked.
const fixture = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LessonBanner } from '/src/app/components/LessonOverview';
import { LessonThemeEditor } from '/src/features/lesson/LessonThemeEditor';
import { LessonMaterialsDialog } from '/src/features/lesson/LessonMaterialsDialog';
import { attendanceDraftKey } from '/src/features/lesson/attendance';
import '/src/styles/styles.css';
import '/src/app/live.css';
import '/src/app/workspace.css';
import '/src/features/lesson/lesson-materials.css';
const section = data => ({ data, error: null });
const account = { id: '101', branch: 'Fixture branch', name: 'Fixture teacher' };
const presents = { cur_date: '2026-10-21', cur_group: 10, cur_lenta: 0, cur_schedule: 50, scheduleType: 'planned',
  can_set_theme: true, students: [{ id_stud: 1, was: 1, theme: 'Saved theme', public_week_id: 701 }], homework: { public_material_id: 501 } };
const themes = [
  { public_week_id: 701, package_id: 42, week: 7, theme: 'Prospective week seven', has_homework: true },
  { public_week_id: 702, package_id: 43, week: 8, theme: 'Prospective week eight', has_labwork: true },
  { public_week_id: 703, theme: 'Unbound theme' },
];
const initialLesson = { account, presents, materials: section([{ title: 'Issued file for saved lesson', download_url: 'https://example.invalid/issued.pdf' }, { title: 'Issued image for saved lesson', download_url: 'https://example.invalid/issued.png' }]), homework: section([{ theme: 'Issued homework for saved lesson' }]) };
function Fixture() {
  const [context, setContext] = useState({ account, presents });
  const [lesson, setLesson] = useState(initialLesson);
  const [draft, setDraft] = useState();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState();
  const token = attendanceDraftKey(context.account.id, context.account.branch, context.presents);
  window.resetLesson = () => { setContext({ account, presents }); setLesson(initialLesson); setDraft(undefined); setOpen(false); setTheme(undefined); };
  window.replaceLesson = () => setContext({ account, presents: { ...presents, cur_schedule: 51, cur_lenta: 1 } });
  window.openMaterials = selected => { setTheme(selected); setOpen(true); };
  window.currentReadCalls ??= 0;
  window.draftCalls ??= [];
  return <div className="live-workspace"><main style={{ marginLeft: 0, width: '100%' }}><div className="page-content lesson-workspace">
    <LessonBanner account={context.account} fetchedAt="2026-10-21T10:00:00Z" date="2026-10-21" students={presents.students} theme="Saved theme" draft={draft && { attendance: {}, marks: {}, theme: draft }} estimate={{ amount: 1400.5, initial: true }}>
      <LessonThemeEditor embedded contextKey={token} busy={false} unavailable="" currentTheme="Saved theme" draft={draft}
        onLoad={() => window.delayThemeLoad ? new Promise(resolve => { window.releaseThemeLoad = () => resolve({ presents: context.presents, themes }); }) : Promise.resolve({ presents: context.presents, themes })}
        onSave={async choice => { window.draftCalls.push(choice); setDraft(choice); }}
        onPreviewTheme={selected => { setTheme(selected); setOpen(true); }}/>
      <button className="button secondary" onClick={() => { setTheme(undefined); setOpen(true); }}>Материалы занятия</button>
    </LessonBanner>
    <LessonMaterialsDialog open={open} contextToken={token} account={context.account} currentLesson={lesson} theme={theme} onClose={() => setOpen(false)}
      onLoadCurrent={() => { window.currentReadCalls++; setLesson({ ...initialLesson, presents: context.presents }); }}/>
  </div></main></div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5208, strictPort: true,
  watch: { ignored: ['**/dist*/**', '**/tmp/**', '**/.omni-browser/**'] } }, plugins: [{
  name: 'lesson-materials-fixture', resolveId(id) { if (id === '/lesson-materials-fixture.tsx') return id; },
  load(id) { if (id === '/lesson-materials-fixture.tsx') return fixture; },
}] });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [], requests = [];
  let mode = 'normal';
  let releasePackage;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  const stream = 'BT /F1 24 Tf 40 700 Td (Lesson material PDF) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.route('https://example.invalid/**', route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    contentType: route.request().url().endsWith('.pdf') ? 'application/pdf' : 'image/png',
    body: route.request().url().endsWith('.pdf') ? pdf : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }));
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    const input = route.request().postDataJSON();
    requests.push({ action, input });
    assert.equal(action, 'method-package', 'the viewer must never issue a mutation or invent a command');
    const responseMode = mode;
    if (responseMode === 'pending') await new Promise(resolve => { releasePackage = resolve; });
    await route.fulfill({ json: {
      account: { id: responseMode === 'wrong-account' ? '102' : '101', branch: 'Fixture branch' },
      materials: { error: null, data: {
        7: { theme: 'Week seven', data: { 2: [{ public_materials_id: 71, theme: 'Prospective lesson material' }], 1: [{ public_materials_id: 72, theme: 'Prospective homework material' }] } },
        8: { theme: 'Week eight', data: { 2: [{ public_materials_id: 81, theme: 'Other week material' }] } },
      } }, themes: { data: [], error: null },
    } });
  });
  await page.route('**/lesson-materials-fixture.html', route => route.fulfill({ contentType: 'text/html', body: '<html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script type="module" src="/lesson-materials-fixture.tsx"></script></html>' }));
  await page.goto('http://127.0.0.1:5208/lesson-materials-fixture.html');
  const editor = page.getByRole('region', { name: 'Тема урока', exact: true });
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click();
  const select = page.getByRole('combobox', { name: 'Тема из методпакета', exact: true });
  await select.waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Тема урока', exact: true }).count(), 0, 'embedded editor has no duplicate title');
  assert.equal(await page.getByText('Текущая тема: Saved theme', { exact: true }).count(), 0);
  assert.equal(await page.locator('.lesson-estimate').innerText(), 'Начальные ставки\n≈ 1 400,50 ₽');
  await page.getByRole('button', { name: 'В черновик', exact: true }).click();
  assert.equal((await page.evaluate(() => window.draftCalls))[0].previousTheme, 'Saved theme');
  assert.equal((await page.evaluate(() => window.draftCalls))[0].publicWeekId, '701');
  assert.equal(requests.length, 0, 'staging a theme invokes only the local draft callback');
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click();
  await page.getByRole('button', { name: 'Материалы выбранной темы', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Материалы занятия', exact: true });
  await dialog.waitFor();
  await dialog.getByRole('heading', { name: 'Prospective lesson material', exact: true }).waitFor();
  assert.deepEqual(requests[0], { action: 'method-package', input: { spec: '42' } });
  assert.equal(await dialog.getByText('Issued file for saved lesson', { exact: true }).count(), 1);
  assert.equal(await dialog.getByText('Issued homework for saved lesson', { exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('heading', { name: 'Prospective homework material', exact: true }).count(), 1);
  assert.equal(await dialog.getByRole('heading', { name: 'Other week material', exact: true }).count(), 0, 'only the exact selected week is included');
  await mkdir('tmp/lesson-materials', { recursive: true });
  const files = dialog.locator('.lesson-issued-materials .file-preview');
  const imageFile = files.nth(1);
  const pdfFile = files.first();
  const assertTopLayer = async () => {
    assert.equal(await dialog.locator('.file-preview-hover').evaluate(tooltip => {
      const box = tooltip.getBoundingClientRect();
      tooltip.style.pointerEvents = 'auto';
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      tooltip.style.pointerEvents = '';
      return tooltip.contains(top);
    }), true, 'the decoded hover preview paints above the native lesson dialog');
  };
  await imageFile.getByRole('button', { name: 'Превью', exact: true }).hover();
  await dialog.locator('.file-preview-hover img').waitFor();
  await dialog.locator('.file-preview-hover img').evaluate(image => image.decode());
  await assertTopLayer();
  await page.screenshot({ path: 'tmp/lesson-materials/image-hover.png' });
  await imageFile.getByRole('button', { name: 'Превью', exact: true }).click();
  await imageFile.locator('.file-preview-full img').evaluate(image => image.decode());
  assert.equal(await imageFile.locator('.file-preview-full img').isVisible(), true);
  await imageFile.getByRole('button', { name: 'Свернуть превью', exact: true }).click();
  await pdfFile.getByRole('button', { name: 'Превью', exact: true }).hover();
  await dialog.locator('.file-preview-hover canvas[data-rendered="true"]').waitFor();
  await assertTopLayer();
  await page.screenshot({ path: 'tmp/lesson-materials/pdf-hover.png' });
  await pdfFile.getByRole('button', { name: 'Превью', exact: true }).click();
  await pdfFile.locator('.file-preview-full canvas[data-rendered="true"]').waitFor();
  assert.equal(await pdfFile.locator('.file-preview-full canvas').isVisible(), true);
  await pdfFile.getByRole('button', { name: 'Свернуть превью', exact: true }).click();
  await page.screenshot({ path: 'tmp/lesson-materials/desktop.png' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  await select.selectOption('703');
  await page.getByRole('button', { name: 'Материалы выбранной темы', exact: true }).click();
  await dialog.getByRole('status').filter({ hasText: 'точную привязку' }).waitFor();
  assert.equal(requests.length, 1, 'missing package/week never falls back to title, course or public_week_id');
  await page.keyboard.press('Escape');

  mode = 'wrong-account';
  await select.selectOption('702');
  await page.getByRole('button', { name: 'Материалы выбранной темы', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Аккаунт изменился' }).waitFor();
  assert.equal(await dialog.locator('.method-card').count(), 0, 'a different account cannot populate the preview');
  await page.keyboard.press('Escape');

  mode = 'pending';
  await select.selectOption('701');
  await page.getByRole('button', { name: 'Материалы выбранной темы', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.lesson-materials-dialog [role=status]')?.textContent.includes('Загружаем'));
  while (!releasePackage) await new Promise(resolve => setTimeout(resolve, 10));
  await page.evaluate(() => window.replaceLesson());
  assert.equal(await dialog.getByText('Issued file for saved lesson', { exact: true }).count(), 0, 'issued files from another lesson disappear synchronously');
  mode = 'normal';
  releasePackage();
  await dialog.getByRole('heading', { name: 'Prospective lesson material', exact: true }).waitFor();
  assert.equal(await dialog.getByRole('alert').count(), 0, 'the stale old-context result is ignored');
  await dialog.getByRole('button', { name: 'Загрузить выданные материалы', exact: true }).click();
  await dialog.getByText('Issued file for saved lesson', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.currentReadCalls), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await dialog.evaluate(element => element.getBoundingClientRect().width <= innerWidth), true);
  await page.screenshot({ path: 'tmp/lesson-materials/mobile-dialog.png' });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.resetLesson(); window.delayThemeLoad = true; });
  await page.getByRole('button', { name: 'Выбрать тему', exact: true }).click();
  await page.waitForFunction(() => typeof window.releaseThemeLoad === 'function');
  await page.evaluate(() => { window.replaceLesson(); window.releaseThemeLoad(); });
  await page.waitForTimeout(50);
  assert.equal(await select.count(), 0, 'a delayed theme list cannot populate a replacement lesson');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'the merged banner fits narrow lesson-workspace layout');
  await page.screenshot({ path: 'tmp/lesson-materials/mobile-banner.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: embedded theme draft-only controls, banner estimate, issued/prospective separation, exact package/week, missing binding, account/context rejection, stale theme load and narrow layout.');
} finally { await browser?.close(); await server.close(); }

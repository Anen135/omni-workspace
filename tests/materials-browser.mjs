import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Isolated UI test: uses only fictional responses and never connects to Omni.
const server = await createServer({
  configFile: false,
  server: { host: '127.0.0.1', port: 5184, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  page.setDefaultTimeout(10000);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  const section = data => ({ data, error: null });
  const account = { id: '101', name: 'Тестовый преподаватель', branch: 'Тест', timezone: 'Europe/Moscow' };
  let failPackage = false;
  let wrongAccount = false;
  let hasLesson = false;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const stream = 'BT /F1 24 Tf 40 700 Td (PDF preview test) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.route('https://example.com/**', route => /\.pdf|issued-file/.test(route.request().url())
    ? route.fulfill({ contentType: 'application/pdf', body: pdf })
    : route.fulfill({ contentType: 'image/png', body: png }));
  const materials = {
    1: { data: { 2: [
      { id: '100', public_materials_id: '201', theme: 'Методичка до урока', description: 'Подготовка к занятию', file_url: 'https://fs.top-academy.ru/api/v1/files/test-fixture', closed: '1' },
      { id: '100', public_materials_id: '202', theme: 'Памятка преподавателя', url: 'https://example.com/guide', content: { blocks: [null, { type: 'paragraph', data: { text: '<b>Текст методички</b><img src=x onerror="window.injected=true">' } }] } },
    ] } },
    2: { data: { 1: [{ id: '101', public_materials_id: '203', theme: 'Домашняя практика', description: 'Упражнение', url: 'javascript:alert(1)' }] } },
  };
  await page.route('**/api/omni/**', async route => {
    const action = route.request().url().split('/').at(-1);
    const input = route.request().postDataJSON();
    requests.push({ action, input });
    if (action === 'file-preview') {
      assert.equal(input.url, 'https://fs.top-academy.ru/api/v1/files/test-fixture');
      assert.equal(route.request().headers()['x-omni-client'], 'workspace');
      return route.fulfill({ contentType: 'application/pdf', body: pdf });
    }
    let body;
    if (action === 'status') body = { connected: true };
    else if (action === 'snapshot') body = {
      account, teachers: section([]), schedule: section({}), presents: section(hasLesson ? { cur_group: '1', cur_lenta: '1', cur_date: '2026-09-21' } : {}), groups: section([]),
      homework: section([]), newHomework: section([{ filename: 'answer.png', download_url_stud: 'https://example.com/answer.png' }, { filename: 'document.pdf', download_url_stud: 'https://example.com/document.pdf' }]), counts: { homework: 2, practice: 0 }, fetchedAt: new Date().toISOString(),
    };
    else if (action === 'lesson') body = { account, presents: { cur_group: '1', cur_lenta: '1', cur_date: '2026-09-21' }, materials: section([{ download_url: 'https://example.com/issued-file' }]), homework: section([]) };
    else if (action === 'materials-catalog') body = {
      account, forms: section([{ id_form: 4, name_form: 'Форма A' }, { id_form: 5, name_form: 'Пустая форма' }]),
      types: section([{ id: 1, name: 'Домашние задания' }, { id: 2, name: 'Уроки' }]),
      directions: section(input.form === '4' ? [{ id: 16, dir_name: 'Направление A' }] : []),
      packages: section(input.form === '4' ? [{ id: 42, name_spec: 'Тестовый курс' }, { id: 43, name_spec: 'Пустой курс' }] : []),
    };
    else if (action === 'method-package') body = {
      account: wrongAccount ? { ...account, id: '102' } : account,
      materials: failPackage ? { data: null, error: 'Тестовая ошибка загрузки' } : section(input.spec === '43' ? {} : materials),
      themes: section([{ week: 1, theme_week: 'Подготовка' }, { week: 2, theme_week: 'Практика' }]),
    };
    else throw new Error(`Unexpected API request: ${action}`);
    await route.fulfill({ json: body });
  });
  await page.goto('http://127.0.0.1:5184/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Мой урок' }).waitFor();
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  const form = page.getByLabel('Форма обучения', { exact: true });
  const course = page.getByLabel('Методпакет', { exact: true });
  const refresh = page.getByRole('button', { name: 'Обновить методички' });
  await form.selectOption('4');
  await page.getByLabel('Направление', { exact: true }).selectOption('16');
  await course.selectOption('42');
  await page.getByRole('heading', { name: 'Методичка до урока' }).waitFor();
  assert.equal(await page.locator('.method-card').count(), 3);
  assert.equal(await page.getByRole('link', { name: 'Открыть файл' }).getAttribute('href'), 'https://fs.top-academy.ru/api/v1/files/test-fixture');
  assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
  const pdfToggle = page.locator('.method-card').filter({ hasText: 'Методичка до урока' }).getByRole('button', { name: 'Превью', exact: true });
  assert.equal(await pdfToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.file-preview-full').count(), 0);
  await pdfToggle.hover();
  await page.getByRole('tooltip').waitFor();
  await page.getByRole('tooltip').locator('canvas[data-rendered="true"]').waitFor();
  await pdfToggle.click();
  assert.equal(await page.getByRole('tooltip').count(), 0);
  await page.locator('.file-preview-full canvas[data-rendered="true"]').waitFor();
  await page.locator('.file-preview-full canvas').scrollIntoViewIfNeeded();
  await page.locator('.file-preview-full').screenshot({ path: 'tmp/pdf-preview-check.png' });
  await page.getByRole('button', { name: 'Свернуть превью', exact: true }).click();
  assert.equal(await page.locator('.file-preview-full').count(), 0);
  await page.getByText('Читать содержимое', { exact: true }).click();
  await page.getByText('Текст методички', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.getByLabel('Тип материала', { exact: true }).selectOption('2');
  assert.equal(await page.locator('.method-card').count(), 2);
  await page.getByRole('searchbox').fill('Памятка');
  assert.equal(await page.locator('.method-card').count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.locator('.teaching-materials').evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await course.selectOption('43');
  await page.getByText('В этом методпакете пока нет материалов', { exact: true }).waitFor();
  await course.selectOption('42');
  await page.getByRole('heading', { name: 'Методичка до урока' }).waitFor();
  failPackage = true;
  await refresh.click();
  await page.getByRole('alert').filter({ hasText: 'Тестовая ошибка загрузки' }).waitFor();
  assert.equal(await page.locator('.method-card').count(), 0);
  failPackage = false;
  await refresh.click();
  await page.getByRole('heading', { name: 'Методичка до урока' }).waitFor();
  await form.selectOption('5');
  await page.getByText('Для выбранной формы методпакеты не найдены', { exact: true }).waitFor();
  assert.equal(await page.locator('.method-card').count(), 0);
  assert.equal(await course.inputValue(), '');
  assert.equal(await page.getByLabel('Направление', { exact: true }).inputValue(), '');
  await form.selectOption('4');
  // Homework previews use the same controls and do not require a lesson.
  await page.getByRole('button', { name: 'Домашние задания', exact: true }).click();
  const imageToggle = page.locator('.file-preview').first().getByRole('button', { name: 'Превью', exact: true });
  await imageToggle.hover();
  await page.getByRole('tooltip').waitFor();
  await page.waitForFunction(() => document.querySelector('.file-preview-hover img')?.naturalWidth > 0);
  const tooltip = await page.getByRole('tooltip').boundingBox();
  assert.ok(tooltip.x >= 0 && tooltip.y >= 0 && tooltip.x + tooltip.width <= 1440);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('tooltip').count(), 0);
  await imageToggle.click();
  await page.waitForFunction(() => document.querySelector('.file-preview-full img')?.naturalWidth > 0);
  await page.getByRole('button', { name: 'Свернуть превью', exact: true }).click();
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await form.selectOption('4');
  wrongAccount = true;
  await course.selectOption('42');
  await page.getByRole('alert').filter({ hasText: 'Аккаунт изменился' }).waitFor();
  assert.equal(await page.locator('.teaching-materials').count(), 0);
  assert.ok(!requests.some(request => request.action === 'lesson'));
  assert.ok(requests.some(request => request.action === 'materials-catalog' && request.input.direction === '16'));
  wrongAccount = false;
  hasLesson = true;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Мой урок' }).waitFor();
  await page.getByRole('button', { name: 'Материалы', exact: true }).click();
  await page.getByRole('button', { name: 'Загрузить выданные материалы', exact: true }).click();
  await page.locator('.remote-attachment').getByRole('button', { name: 'Превью', exact: true }).click();
  await page.locator('.remote-attachment canvas[data-rendered="true"]').waitFor();
  await page.goto('http://127.0.0.1:5184/#demo', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Проверка ДЗ/ }).click();
  await page.locator('input[type=file]').setInputFiles({ name: 'local.png', mimeType: 'image/png', buffer: png });
  await page.locator('.local-file-preview').getByRole('button', { name: 'Превью', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.local-file-preview .file-preview-full img')?.naturalWidth > 0);
  await page.locator('input[type=file]').setInputFiles({ name: 'local.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  assert.equal(await page.locator('.local-file-preview .file-preview-full').count(), 0);
  await page.locator('.local-file-preview').getByRole('button', { name: 'Превью', exact: true }).click();
  await page.locator('.local-file-preview canvas[data-rendered="true"]').waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: catalogue, filters, errors, account isolation, mobile layout; collapsed image/PDF controls, cursor previews and inline expansion.');
} finally {
  await browser?.close();
  await server.close();
}

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Fictional attachments only; all Academy preview requests are fulfilled locally.
const server = await createServer({ configFile: false, server: { host: '127.0.0.1', port: 5195, strictPort: true, watch: { ignored: ['**/.omni-browser/**'] } } });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const stream = 'BT /F1 24 Tf 40 700 Td (Homework PDF fixture) Tj ET';
const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
const xref = pdf.length;
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const previewRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fs.top-academy.ru/**', route => route.abort());
  await page.route('https://example.com/student.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('**/api/omni/**', async route => {
    if (!route.request().url().endsWith('/file-preview')) return route.fulfill({ json: { connected: false } });
    const input = route.request().postDataJSON();
    previewRequests.push(input.url);
    assert.equal(route.request().headers()['x-omni-client'], 'workspace');
    if (input.url.endsWith('/student-png')) return route.fulfill({ contentType: 'image/png', body: png });
    if (input.url.endsWith('/student-pdf')) return route.fulfill({ contentType: 'application/pdf', body: pdf });
    if (input.url.endsWith('/student-unsupported')) return route.fulfill({ status: 400, json: { error: { message: 'Формат файла не поддерживается для превью.' } } });
    throw new Error('Unexpected fictional preview request');
  });
  await page.goto('http://127.0.0.1:5195/');
  await page.setContent('<div id="root" class="live-workspace"></div>');
  await page.evaluate(async () => {
    const style = document.createElement('style');
    style.textContent = (await import('/src/styles/styles.css?inline')).default
      + (await import('/src/app/workspace.css?inline')).default
      + (await import('/src/features/homework/homework.css?inline')).default
      + (await import('/src/components/files/file-preview.css?inline')).default;
    document.head.append(style);
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { HomeworkTable } = await import('/src/features/homework/HomeworkTable.tsx');
    const { homeworkItems } = await import('/src/features/homework/homework.ts');
    const { DataValue } = await import('/src/components/data/RemoteData.tsx');
    const root = ReactDOM.createRoot(document.getElementById('root'));
    window.showHomeworkAttachment = (suffix, teacherType = 'zip') => {
      const teacherName = `teacher.${teacherType}`;
      const teacherMime = teacherType === 'pdf' ? 'application/pdf' : 'application/zip';
      const source = {
        id: 501, id_domzad_teach: 601, id_stud: 701, ospr: 0, fio_stud: 'Вымышленный ученик', group: 'Тестовая группа', theme: 'Вложение ученика',
        download_url: `https://example.com/${teacherName}`, filename: teacherName, file_name: teacherName, original_name: teacherName, mime_type: teacherMime, content_type: teacherMime, mime: teacherMime,
        download_url_stud: suffix === 'direct-png' ? 'https://example.com/student.png' : suffix === 'direct-zip' ? 'https://example.com/student.zip' : `https://fs.top-academy.ru/api/v1/files/student-${suffix}`,
      };
      root.render(React.createElement(HomeworkTable, {
        key: suffix, section: { data: { homework: [source] }, error: null }, items: homeworkItems({ homework: [source] }),
        render: value => React.createElement(DataValue, { value }),
      }));
    };
    window.showHomeworkAttachment('png');
  });
  async function studentAttachment() {
    await page.getByRole('button', { name: 'Открыть работу', exact: true }).click();
    return page.locator('.homework-details > section').filter({ has: page.getByRole('heading', { name: 'Файл студента', exact: true }) });
  }
  let attachment = await studentAttachment();
  await attachment.getByRole('button', { name: 'Превью', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.file-preview-full img')?.naturalWidth > 0);
  assert.equal(await attachment.locator('img').evaluate(image => image.naturalWidth), 1, 'Academy PNG bytes decode through HomeworkTable and DataValue despite unrelated teacher ZIP metadata');
  assert.equal(await page.locator('.homework-details > section').filter({ has: page.getByRole('heading', { name: 'Задание', exact: true }) }).getByRole('button', { name: 'Превью', exact: true }).count(), 0, 'teacher ZIP remains unsupported');
  assert.deepEqual(previewRequests, ['https://fs.top-academy.ru/api/v1/files/student-png']);

  await page.evaluate(() => window.showHomeworkAttachment('direct-png', 'pdf'));
  await page.getByRole('button', { name: 'Открыть работу', exact: true }).waitFor();
  attachment = await studentAttachment();
  await attachment.getByRole('button', { name: 'Превью', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.file-preview-full img')?.naturalWidth > 0);
  assert.equal(await attachment.locator('img').evaluate(image => image.naturalWidth), 1, 'student PNG URL is not misclassified as the teacher PDF');
  assert.equal(previewRequests.length, 1, 'direct images keep the direct preview path');

  await page.evaluate(() => window.showHomeworkAttachment('pdf'));
  await page.getByRole('button', { name: 'Открыть работу', exact: true }).waitFor();
  attachment = await studentAttachment();
  await attachment.getByRole('button', { name: 'Превью', exact: true }).click();
  await attachment.locator('canvas[data-rendered="true"]').waitFor();
  assert.equal(previewRequests.at(-1), 'https://fs.top-academy.ru/api/v1/files/student-pdf');

  await page.evaluate(() => window.showHomeworkAttachment('direct-zip'));
  await page.getByRole('button', { name: 'Открыть работу', exact: true }).waitFor();
  attachment = await studentAttachment();
  assert.equal(await attachment.getByRole('button', { name: 'Превью', exact: true }).count(), 0, 'unsupported student ZIP does not gain a preview');
  assert.equal(await attachment.getByRole('link', { name: 'Открыть файл', exact: true }).getAttribute('href'), 'https://example.com/student.zip');

  await page.evaluate(() => window.showHomeworkAttachment('unsupported'));
  await page.getByRole('button', { name: 'Открыть работу', exact: true }).waitFor();
  attachment = await studentAttachment();
  await attachment.getByRole('button', { name: 'Превью', exact: true }).click();
  await attachment.getByText('Формат файла не поддерживается для превью.', { exact: true }).waitFor();
  assert.equal(await attachment.getByRole('link', { name: 'Открыть файл', exact: true }).getAttribute('href'), 'https://fs.top-academy.ru/api/v1/files/student-unsupported');
  assert.deepEqual(errors, []);
  console.log('PASS: raw homework attachment metadata isolation, Academy/direct PNG decode, PDF canvas and unsupported-file links/error.');
} finally { await browser?.close(); await server.close(); }

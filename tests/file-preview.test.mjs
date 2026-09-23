import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedPreviewUrl, loadFilePreview } from '../server/file-preview.mjs';

const source = 'https://fs.top-academy.ru/api/v1/files/test-file';
test('preview restricts sources and redirect destinations', async () => {
  for (const url of ['http://fs.top-academy.ru/api/v1/files/a', 'https://fs.top-academy.ru.evil.test/api/v1/files/a', 'https://user:pass@fs.top-academy.ru/api/v1/files/a', 'https://storage.yandexcloud.net/other-bucket/a', 'http://127.0.0.1/a']) assert.equal(allowedPreviewUrl(url), false);
  let calls = 0;
  await assert.rejects(loadFilePreview(source, async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
  }), /Недопустимый/);
  assert.equal(calls, 1);
});
test('extensionless attachment redirects are fetched without cookies and detected by bytes', async () => {
  const file = await loadFilePreview(source, async (url, options) => {
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    return url === source ? new Response(null, { status: 302, headers: { location: 'https://storage.yandexcloud.net/top-academy-services-omni/materials/file.pdf' } })
      : new Response('%PDF-1.4\nfixture', { headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment' } });
  });
  assert.equal(file.type, 'application/pdf');
  assert.equal(file.data.toString(), '%PDF-1.4\nfixture');
});
test('preview rejects HTML challenges, oversized files and redirect loops', async () => {
  await assert.rejects(loadFilePreview(source, async () => new Response('<html>challenge</html>')), /формат/);
  await assert.rejects(loadFilePreview(source, async () => new Response('x', { headers: { 'content-length': '999999999' } })), /50 МБ/);
  await assert.rejects(loadFilePreview(source, async () => new Response(null, { status: 302, headers: { location: source } })), /перенаправлений/);
});

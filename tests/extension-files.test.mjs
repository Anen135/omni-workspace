import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFile } from '../extension/files.mjs';
const url = 'https://fs.top-academy.ru/api/v1/files/fixture';
test('extension previews validate sources, final URLs, content and size without sending credentials', async () => {
  const original = globalThis.fetch;
  const response = (body, finalUrl = url, headers = {}) => {
    const result = new Response(body, { headers });
    Object.defineProperty(result, 'url', { value: finalUrl });
    return result;
  };
  let fixture;
  globalThis.fetch = async (_, options) => { assert.equal(options.credentials, 'omit'); return fixture; };
  try {
    await assert.rejects(previewFile('https://evil.test/file'), /Недопустимый/);
    fixture = response('%PDF-1.4 test');
    assert.deepEqual(await previewFile(url), { type: 'application/pdf', base64: btoa('%PDF-1.4 test') });
    fixture = response('%PDF-1.4 test', 'https://evil.test/file');
    await assert.rejects(previewFile(url), /Хранилище/);
    fixture = response('<html>challenge</html>');
    await assert.rejects(previewFile(url), /Формат/);
    fixture = response('too large', url, { 'content-length': String(9 * 1024 * 1024) });
    await assert.rejects(previewFile(url), /8 МБ/);
  } finally { globalThis.fetch = original; }
});

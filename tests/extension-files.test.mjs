import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFile } from '../extension/files.mjs';
const url = 'https://fs.top-academy.ru/api/v1/files/fixture';
test('extension previews validate sources and content without credentials or a file size limit', async () => {
  const original = globalThis.fetch;
  const response = (body, finalUrl = url, headers = {}, status = 200) => {
    const result = new Response(body, { headers, status });
    Object.defineProperty(result, 'url', { value: finalUrl });
    return result;
  };
  let fixture;
  globalThis.fetch = async (_, options) => { assert.equal(options.credentials, 'omit'); return fixture; };
  try {
    await assert.rejects(previewFile('https://evil.test/file'), /Недопустимый/);
    fixture = response('%PDF-1.4 test');
    assert.deepEqual(await previewFile(url), { type: 'application/pdf', base64: btoa('%PDF-1.4 test') });
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), char => char.charCodeAt(0));
    fixture = response(png, url, { 'content-type': 'application/octet-stream' });
    const image = await previewFile(url);
    assert.equal(image.type, 'image/png');
    assert.deepEqual(Uint8Array.from(atob(image.base64), char => char.charCodeAt(0)), png);
    for (const bucket of ['top-academy-services-omni', 'top-academy-services-msapi']) {
      const destination = `https://storage.yandexcloud.net/${bucket}/homework/fixture.PNG`;
      fixture = response(png, destination, { 'content-type': 'application/octet-stream' }, 206);
      const redirected = await previewFile(url);
      assert.equal(redirected.type, 'image/png');
      assert.deepEqual(Uint8Array.from(atob(redirected.base64), char => char.charCodeAt(0)), png);
    }
    for (const destination of [
      'https://storage.yandexcloud.net/top-academy-services-msapi-other/fixture.PNG',
      'https://storage.yandexcloud.net/top-academy-services-msapi/%2e%2e/other-bucket/fixture.PNG',
      'https://storage.yandexcloud.net/other-bucket/fixture.PNG',
      'http://storage.yandexcloud.net/top-academy-services-msapi/fixture.PNG',
      'https://user:pass@storage.yandexcloud.net/top-academy-services-msapi/fixture.PNG',
      'https://storage.yandexcloud.net:8443/top-academy-services-msapi/fixture.PNG',
    ]) {
      fixture = response(png, destination);
      await assert.rejects(previewFile(url), /Хранилище/);
    }
    fixture = response('%PDF-1.4 test', 'https://evil.test/file');
    await assert.rejects(previewFile(url), /Хранилище/);
    fixture = response('<html>challenge</html>');
    await assert.rejects(previewFile(url), /Формат/);
    const largePdf = new Uint8Array(9 * 1024 * 1024);
    largePdf.set(new TextEncoder().encode('%PDF-1.4'));
    fixture = response(largePdf, url, { 'content-length': String(largePdf.length) });
    const preview = await previewFile(url);
    assert.equal(preview.type, 'application/pdf');
    assert.equal(atob(preview.base64).length, largePdf.length);
  } finally { globalThis.fetch = original; }
});

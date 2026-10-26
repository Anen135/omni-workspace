import { fileSourcePermissions } from '../shared/file-sources.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { allowedFile } from '../extension/policy.mjs';
import { previewFile } from '../extension/files.mjs';
import { allowedPreviewUrl, loadFilePreview } from '../server/file-preview.mjs';

const source = 'https://fs.top-academy.ru/api/v1/files/png-fixture';
const destination = 'https://s3.twcstorage.ru/top-academy-services-msapi/homework/fixture.png';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');

test('TWC permits only the observed exact Academy bucket over HTTPS', async () => {
  for (const allowed of [allowedFile, allowedPreviewUrl]) {
    assert.equal(allowed(destination), true);
    for (const blocked of [
      'https://s3.twcstorage.ru/top-academy-services-msapi',
      'https://s3.twcstorage.ru/top-academy-services-msapi-other/a.png',
      'https://s3.twcstorage.ru/top-academy-services-omni/a.png',
      'https://s3.twcstorage.ru/other/a.png',
      'https://s3.twcstorage.ru/top-academy-services-msapi/%2e%2e/other/a.png',
      'https://s3.twcstorage.ru/top-academy-services-msapi%2fa.png',
      'https://s3.twcstorage.ru.evil.test/top-academy-services-msapi/a.png',
      'https://child.s3.twcstorage.ru/top-academy-services-msapi/a.png',
      'http://s3.twcstorage.ru/top-academy-services-msapi/a.png',
      'https://user:password@s3.twcstorage.ru/top-academy-services-msapi/a.png',
      'https://s3.twcstorage.ru:8443/top-academy-services-msapi/a.png',
    ]) assert.equal(allowed(blocked), false, blocked);
  }
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual([...manifest.host_permissions, ...fileSourcePermissions()].filter(value => value.includes('twcstorage')), ['https://s3.twcstorage.ru/top-academy-services-msapi/*']);
});

test('bridge follows TWC redirect and identifies PNG without Content-Type', async () => {
  const calls = [];
  const file = await loadFilePreview(source, async (url, options) => {
    calls.push(url);
    assert.equal(options.credentials, 'omit');
    return url === source ? new Response(null, { status: 302, headers: { location: destination } }) : new Response(png);
  });
  assert.deepEqual(calls, [source, destination]);
  assert.equal(file.type, 'image/png');
  assert.deepEqual(file.data, png);
});

test('extension accepts TWC PNG without MIME and continues rejecting HTML', async () => {
  const original = globalThis.fetch;
  let body = png;
  globalThis.fetch = async (_, options) => {
    assert.equal(options.credentials, 'omit');
    const response = new Response(body);
    Object.defineProperty(response, 'url', { value: destination });
    return response;
  };
  try {
    const file = await previewFile(source);
    assert.equal(file.type, 'image/png');
    assert.deepEqual(Buffer.from(file.base64, 'base64'), png);
    body = Buffer.from('<html>not an image</html>');
    await assert.rejects(previewFile(source));
  } finally { globalThis.fetch = original; }
});

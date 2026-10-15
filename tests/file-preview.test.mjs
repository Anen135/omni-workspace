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
test('preview permits exact old and msapi bucket prefixes but refuses similar paths and authorities', async () => {
  for (const bucket of ['top-academy-services-omni', 'top-academy-services-msapi']) {
    assert.equal(allowedPreviewUrl(`https://storage.yandexcloud.net/${bucket}/homework/fixture.PNG`), true);
    for (const url of [
      `https://storage.yandexcloud.net/${bucket}`,
      `https://storage.yandexcloud.net/${bucket}-other/fixture.PNG`,
      `https://storage.yandexcloud.net/${bucket}.evil/fixture.PNG`,
      `https://storage.yandexcloud.net/other/${bucket}/fixture.PNG`,
      `https://storage.yandexcloud.net/${bucket}%2Ffixture.PNG`,
      `https://storage.yandexcloud.net/${bucket}%5Cfixture.PNG`,
      `https://storage.yandexcloud.net/${bucket}/%2e%2e/other-bucket/fixture.PNG`,
      `http://storage.yandexcloud.net/${bucket}/fixture.PNG`,
      `https://user:pass@storage.yandexcloud.net/${bucket}/fixture.PNG`,
      `https://storage.yandexcloud.net:8443/${bucket}/fixture.PNG`,
      `https://storage.yandexcloud.net.evil.test/${bucket}/fixture.PNG`,
    ]) {
      assert.equal(allowedPreviewUrl(url), false, url);
      let calls = 0;
      await assert.rejects(loadFilePreview(source, async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location: url } });
      }), /Недопустимый/);
      assert.equal(calls, 1, 'a blocked redirect is rejected before fetching its destination');
    }
  }
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
test('extensionless PNG attachments retain bytes and are recognized without image response headers', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const result = await loadFilePreview(source, async (_, options) => {
    assert.equal(options.credentials, 'omit');
    return new Response(png, { headers: { 'content-type': 'application/octet-stream' } });
  });
  assert.equal(result.type, 'image/png');
  assert.deepEqual(result.data, png);
});
test('PNG attachments follow 302 redirects to both Academy buckets and recognize octet-stream 206 content', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  for (const bucket of ['top-academy-services-omni', 'top-academy-services-msapi']) {
    const destination = `https://storage.yandexcloud.net/${bucket}/homework/fixture.PNG`;
    const calls = [];
    const result = await loadFilePreview(source, async (url, options) => {
      calls.push(url);
      assert.equal(options.redirect, 'manual');
      assert.equal(options.credentials, 'omit');
      return url === source ? new Response(null, { status: 302, headers: { location: destination } })
        : new Response(png, { status: 206, headers: { 'content-type': 'application/octet-stream' } });
    });
    assert.deepEqual(calls, [source, destination]);
    assert.equal(result.type, 'image/png');
    assert.deepEqual(result.data, png);
  }
});

test('preview rejects HTML challenges, oversized files and redirect loops', async () => {
  await assert.rejects(loadFilePreview(source, async () => new Response('<html>challenge</html>')), /формат/);
  await assert.rejects(loadFilePreview(source, async () => new Response('x', { headers: { 'content-length': '999999999' } })), /50 МБ/);
  await assert.rejects(loadFilePreview(source, async () => new Response(null, { status: 302, headers: { location: source } })), /перенаправлений/);
});

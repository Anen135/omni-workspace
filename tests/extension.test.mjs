import { fileSourcePermissions } from '../shared/file-sources.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { trustedSender, validateMessage, allowedFile, officialUrl } from '../extension/policy.mjs';
const id = 'abcdefghijklmnopabcdefghijklmnop';
const ui = `chrome-extension://${id}/index.html`;
const official = 'https://omni.top-academy.ru/';
test('extension accepts only its own top-level official Omni document and launcher', () => {
  assert.equal(trustedSender({ id, url: official, tab: { id: 7, url: official }, frameId: 0, documentId: 'fixture-doc' }, id, ui), true);
  assert.equal(trustedSender({ id, url: ui }, id, ui), true);
  for (const sender of [
    { id, url: official, frameId: 0 },
    { id, url: official, tab: { id: 7, url: official }, frameId: 0 },
    { id, url: official, tab: { id: 7, url: 'https://omni.top-academy.ru.evil.test/' }, frameId: 0 },
    { id, url: official, tab: { id: 7, url: official }, frameId: 1 },
    { id, url: official, tab: { url: official }, frameId: 0 },
    { id: 'other', url: ui, frameId: 0 },
    { id, url: ui, frameId: 2 },
    { id, url: `chrome-extension://${id}/other.html`, frameId: 0 },
    { id, url: 'https://evil.test/index.html', tab: { id: 7, url: 'https://evil.test/' }, frameId: 0 },
  ]) assert.equal(trustedSender(sender, id, ui), false);
});
test('extension permits bounded teacher switching but no arbitrary URL, script or login', () => {
  assert.doesNotThrow(() => validateMessage({ action: 'capabilities', input: {} }));
  assert.doesNotThrow(() => validateMessage({ action: 'switch-account', input: {} }));
  for (const input of [{ url: '/auth/logout' }, { username: 'fixture', password: 'fixture' }, [], null]) assert.throws(() => validateMessage({ action: 'switch-account', input }));
  assert.throws(() => validateMessage({ action: 'capabilities', input: { url: 'https://example.com' } }));
  assert.doesNotThrow(() => validateMessage({ action: 'switch-teacher', input: { teacherId: '2', accountId: '1' } }));
  for (const input of [{ teacherId: '2' }, { teacherId: '../x', accountId: '1' }, { teacherId: '2', accountId: '1', url: '/other' }]) assert.throws(() => validateMessage({ action: 'switch-teacher', input }));
  assert.doesNotThrow(() => validateMessage({ action: 'group', input: { group: '1' } }));
  for (const message of [{ action: 'eval', input: {} }, { action: 'login', input: { username: 'x', password: 'x' } }, { action: 'group', input: { group: '1', url: '/auth/logout' } }, { action: 'status', extra: true }, { action: 'file-preview', input: { url: 'http://127.0.0.1/private' } }]) assert.throws(() => validateMessage(message));
  assert.equal(officialUrl('https://omni.top-academy.ru.evil.test/'), false);
  assert.equal(officialUrl('https://omni.top-academy.ru/login/index'), true);
  assert.equal(allowedFile('https://storage.yandexcloud.net/other-bucket/file.pdf'), false);
  assert.equal(allowedFile('https://fs.top-academy.ru/api/v1/files/fixture'), true);
});

test('extension file previews allow only the two explicit Academy storage buckets', async () => {
  for (const bucket of ['top-academy-services-omni', 'top-academy-services-msapi']) {
    const url = `https://storage.yandexcloud.net/${bucket}/homework/fixture.PNG`;
    assert.equal(allowedFile(url), true);
    assert.doesNotThrow(() => validateMessage({ action: 'file-preview', input: { url } }));
    for (const blocked of [
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
      assert.equal(allowedFile(blocked), false, blocked);
      assert.throws(() => validateMessage({ action: 'file-preview', input: { url: blocked } }));
    }
  }
  const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.host_permissions, ['https://omni.top-academy.ru/*']);
  assert.deepEqual([...manifest.host_permissions, ...fileSourcePermissions()], [
    'https://omni.top-academy.ru/*', 'https://fs.top-academy.ru/api/v1/files/*',
    'https://storage.yandexcloud.net/top-academy-services-omni/*',
    'https://storage.yandexcloud.net/top-academy-services-msapi/*',
    'https://s3.twcstorage.ru/top-academy-services-msapi/*',
  ]);
});

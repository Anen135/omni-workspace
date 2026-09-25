import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustedSender, validateMessage, allowedFile, officialUrl } from '../extension/policy.mjs';
const id = 'abcdefghijklmnopabcdefghijklmnop';
const ui = `chrome-extension://${id}/index.html`;
test('extension only accepts its own top-level bundled interface', () => {
  assert.equal(trustedSender({ id, url: ui, frameId: 0 }, id, ui), true);
  for (const sender of [{ id, url: 'https://omni.top-academy.ru/' }, { id: 'other', url: ui }, { id, url: ui, frameId: 2 }, { id, url: `chrome-extension://${id}/other.html` }, { id, url: 'https://evil.test/index.html' }]) assert.equal(trustedSender(sender, id, ui), false);
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

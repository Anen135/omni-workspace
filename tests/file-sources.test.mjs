import { test } from 'node:test';
import assert from 'node:assert/strict';
import config from '../config/file-sources.json' with { type: 'json' };
import { allowedFileSource, fileSourcePermissions, isFileSourceHost, validateFileSources } from '../shared/file-sources.mjs';

test('configured sources provide exact preview routes and browser permissions', () => {
  const permissions = [];
  for (const source of config.sources) {
    assert.equal(isFileSourceHost(source.host), true);
    assert.equal(isFileSourceHost(`other.${source.host}`), false);
    for (const prefix of source.pathPrefixes) {
      const url = `https://${source.host}${prefix}fixture`;
      assert.equal(allowedFileSource(url), true);
      assert.equal(allowedFileSource(url + '?download=1#preview'), true);
      assert.equal(allowedFileSource(`https://${source.host}:443${prefix}fixture`), true);
      assert.equal(allowedFileSource(`http://${source.host}${prefix}fixture`), false);
      assert.equal(allowedFileSource(`https://user:pass@${source.host}${prefix}fixture`), false);
      assert.equal(allowedFileSource(`https://${source.host}:8443${prefix}fixture`), false);
      assert.equal(allowedFileSource(`https://${source.host}${prefix.slice(0, -1)}-other/fixture`), false);
      if (source.fileId) assert.equal(allowedFileSource(url + '/nested'), false);
      permissions.push(`https://${source.host}${prefix}*`);
    }
  }
  assert.deepEqual(fileSourcePermissions(), permissions);
  assert.equal(allowedFileSource(null), false);
});

test('invalid or broad configuration fails closed', () => {
  const source = { host: 'files.example.com', pathPrefixes: ['/academy/'] };
  for (const invalid of [
    null, {}, { sources: [] }, { sources: [source], extra: true },
    { sources: [source, source] },
    ...['*', '*.example.com', 'https://example.com', 'example.com:443', 'EXAMPLE.COM'].map(host => ({ sources: [{ ...source, host }] })),
    ...['/', '/academy', 'academy/', '/academy/*/', '/academy/../', '/academy/%2f/', '/academy/?x/'].map(prefix => ({ sources: [{ ...source, pathPrefixes: [prefix] }] })),
    { sources: [{ ...source, pathPrefixes: ['/academy/', '/academy/'] }] },
    { sources: [{ ...source, fileId: 'true' }] },
    { sources: [{ ...source, extra: true }] },
  ]) assert.throws(() => validateFileSources(invalid));
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadMaterialsCatalog, loadMethodPackage } from '../server/teaching-materials.mjs';
import { validateInput } from '../server/omni-bridge.mjs';
import { materialLink, materialTopics } from '../src/teaching-materials.ts';

test('preparation materials load without a current lesson, group or date', async () => {
  const calls = [];
  const section = async (path, data) => { calls.push([path, data]); return { data: [], error: null }; };
  await loadMaterialsCatalog(section);
  assert.deepEqual(calls.map(([path]) => path), ['/bind/get-public-form', '/bind/get-materials-type']);
  calls.length = 0;
  await loadMethodPackage(section, { spec: '42' });
  assert.deepEqual(calls, [['/bind/get-materials', { spec: '42' }], ['/bind/get-count-week', { spec: '42' }]]);
});

test('catalogue scopes packages to the selected form and optional direction', async () => {
  const calls = [];
  const section = async (path, data) => { calls.push([path, data]); return { data: [], error: null }; };
  await loadMaterialsCatalog(section, { form: '4', direction: '16' });
  assert.deepEqual(calls.slice(-2), [['/bind/get-public-direction', { form: '4' }], ['/bind/get-public-spec', { form: '4', direction: '16', arc: 0 }]]);
});

test('materials API accepts only bounded identifiers and known parameters', () => {
  for (const input of [{}, { form: '4' }, { form: 4, direction: 16 }]) assert.doesNotThrow(() => validateInput('materials-catalog', input));
  assert.doesNotThrow(() => validateInput('method-package', { spec: '42' }));
  for (const spec of [null, '', 0, -1, 1.5, true, [], {}, '1/../../', '1234567890123']) assert.throws(() => validateInput('method-package', { spec }), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('method-package', {}), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('materials-catalog', { direction: 16 }), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('method-package', { spec: 42, url: 'https://example.com' }), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('materials-catalog', { form: 4, arc: 1 }), { code: 'BAD_INPUT' });
});

test('material IDs distinguish files sharing one week ID and preserve teacher materials', () => {
  const topics = materialTopics({ 2: { data: { 2: [{ id: '100', public_materials_id: '201', theme: 'Урок', file_url: 'https://example.com/lesson.pdf?view_key=example' }, { id: '100', public_materials_id: '202', theme: 'Памятка преподавателя', closed: '1', url: 'https://example.com/guide' }] } }, 1: { theme: 'Введение', data: {} } }, [{ week: 2, theme_week: 'Вторая тема' }]);
  assert.deepEqual(topics.map(topic => topic.week), ['1', '2']);
  assert.equal(topics[1].title, 'Вторая тема');
  assert.equal(topics[1].materials.length, 2);
  assert.equal(new Set(topics[1].materials.map(material => material.key)).size, 2);
  assert.equal(topics[1].materials[0].file, 'https://example.com/lesson.pdf?view_key=example');
});

test('links reject active schemes and credentials while preserving signed URLs', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'file:///secret', 'https://user:pass@example.com', 'plain-filename.pdf', '//example.com', '/\\example.com']) assert.equal(materialLink(url), null, url);
  assert.equal(materialLink('/files/test.pdf?view_key=demo#page=2'), 'https://omni.top-academy.ru/files/test.pdf?view_key=demo#page=2');
  assert.equal(materialLink('https://example.com/video?v=example'), 'https://example.com/video?v=example');
});

test('empty material responses stay empty', () => {
  for (const value of [null, undefined, [], {}]) assert.deepEqual(materialTopics(value, null), []);
});

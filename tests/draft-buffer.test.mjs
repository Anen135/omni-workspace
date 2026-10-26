import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDraftBuffer, DRAFT_BUFFER_STORAGE_KEY, validLessonDraft, validateDraftBufferRequest } from '../extension/draft-buffer.mjs';
import { validateMessage } from '../extension/policy.mjs';

const key = JSON.stringify(['1', 'Fixture branch', '2026-10-26', '2', '0', '3']);
const draft = () => ({ attendance: { '4': { stud: '4', was: 1, previousWas: 0, visit: '5' } }, marks: {}, rewards: {} });
const doc = (documentId = 'a', tabId = 1) => ({ tab: { id: tabId }, documentId });
function fixture() {
  let data = {}, time = 1000000000, serial = 0;
  const live = new Set(['a', 'b']);
  const probes = [];
  const storage = { get: async () => structuredClone(data), set: async value => { data = structuredClone(value); } };
  const scripting = { executeScript: async request => { probes.push(request.target); if (!live.has(request.target.documentIds[0])) throw new Error(`No document with id ${request.target.documentIds[0]} in tab with id ${request.target.tabId}`); return [{ result: true }]; } };
  const buffer = createDraftBuffer({ storage, scripting, now: () => time, revision: () => `r${++serial}` });
  return { buffer, storage, scripting, live, probes, get data() { return data; }, set data(value) { data = value; }, advance: ms => { time += ms; } };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);
test('strict buffer schema keeps only original lesson change fields', () => {
  assert.equal(validLessonDraft(draft()), true);
  assert.equal(validLessonDraft({ ...draft(), students: [{ name: 'No names' }] }), false);
  assert.equal(validLessonDraft({ ...draft(), attendance: { 4: { ...draft().attendance[4], name: 'No names' } } }), false);
  assert.equal(validLessonDraft({ ...draft(), marks: { '4:2': { stud: '4', type: 2, mark: 7, previousMark: 'secret', visit: '5' } } }), false);
  assert.equal(validLessonDraft({ ...draft(), theme: { theme: 'Topic', previousTheme: '', publicWeekId: '9', issueHomework: false, issueLabwork: true } }), true);
  for (const input of [{ op: 'put', key, draft: draft(), password: 'x' }, { op: 'put', key: '[]', draft: draft() }, { op: 'claim', key }, { op: 'list', key }, { op: 'checkpoint', key, revision: 'r1' }]) assert.throws(() => validateDraftBufferRequest(input));
  assert.doesNotThrow(() => validateMessage({ action: 'draft-buffer', input: { op: 'put', key, draft: draft() } }));
});
test('atomic revisions, ownership and private envelopes', async () => {
  const f = fixture();
  const entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  assert.equal(Object.hasOwn(entry, 'owner'), false);
  assert.deepEqual(await f.buffer({ op: 'list' }, doc('b')), [entry]);
  await rejects(f.buffer({ op: 'put', key, draft: draft() }, doc()), 'DRAFT_STALE');
  const [first, second] = await Promise.allSettled([f.buffer({ op: 'claim', key, revision: entry.revision }, doc()), f.buffer({ op: 'claim', key, revision: entry.revision }, doc())]);
  assert.equal(first.status, 'fulfilled');
  assert.equal(second.reason.code, 'DRAFT_STALE');
  await rejects(f.buffer({ op: 'remove', key, revision: entry.revision }, doc()), 'DRAFT_STALE');
});
test('another live document is BUSY, vanished document can be claimed only with pinned proof', async () => {
  const f = fixture();
  const entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  await rejects(f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b', 2)), 'BUSY');
  await rejects(f.buffer({ op: 'put', key, draft: draft(), revision: entry.revision }, doc('b', 2)), 'BUSY');
  f.live.delete('a');
  const claimed = await f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b', 2));
  assert.equal(claimed.state, 'ready');
  assert.deepEqual(f.probes.at(-1), { tabId: 1, documentIds: ['a'] });
  await rejects(f.buffer({ op: 'checkpoint', key, revision: claimed.revision, state: 'uncertain' }, doc()), 'BUSY');
});
test('uncertain never automatically claims; explicit review can recover vanished owner', async () => {
  const f = fixture();
  let entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  entry = await f.buffer({ op: 'checkpoint', key, revision: entry.revision, state: 'uncertain' }, doc());
  f.live.delete('a');
  await rejects(f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b')), 'DRAFT_REVIEW_REQUIRED');
  const claimed = await f.buffer({ op: 'claim', key, revision: entry.revision, manual: true }, doc('b'));
  assert.equal(claimed.state, 'uncertain');
  assert.equal(await f.buffer({ op: 'remove', key, revision: claimed.revision }, doc('b')), null);
});
test('ambiguous owner-probe failures preserve ownership and return BUSY', async () => {
  const f = fixture();
  const entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  for (const message of ['Cannot access contents of url', 'Extension context invalidated.', 'document vanished', 'No document with id other in tab with id 1', 'No tab with id: 2']) {
    f.scripting.executeScript = async () => { throw new Error(message); };
    await rejects(f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b', 2)), 'BUSY');
    await rejects(f.buffer({ op: 'claim', key, revision: entry.revision, manual: true }, doc('b', 2)), 'BUSY');
    assert.deepEqual(f.data[DRAFT_BUFFER_STORAGE_KEY].entries[0].owner, { tabId: 1, documentId: 'a' });
  }
  f.scripting.executeScript = async () => { throw new Error('No tab with id: 1'); };
  assert.equal((await f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b', 2))).state, 'ready');
});
test('release requires claim for checkpoint/remove and preserves uncertainty', async () => {
  const f = fixture();
  let entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  entry = await f.buffer({ op: 'checkpoint', key, revision: entry.revision, state: 'review', release: true }, doc());
  assert.equal(f.data[DRAFT_BUFFER_STORAGE_KEY].entries[0].owner, null);
  await rejects(f.buffer({ op: 'remove', key, revision: entry.revision }, doc()), 'DRAFT_NOT_OWNER');
  await rejects(f.buffer({ op: 'claim', key, revision: entry.revision }, doc()), 'DRAFT_REVIEW_REQUIRED');
  await rejects(f.buffer({ op: 'put', key, revision: entry.revision, draft: draft() }, doc()), 'DRAFT_REVIEW_REQUIRED');
  entry = await f.buffer({ op: 'claim', key, revision: entry.revision, manual: true }, doc('b'));
  entry = await f.buffer({ op: 'checkpoint', key, revision: entry.revision, state: 'ready', release: true }, doc('b'));
  assert.equal((await f.buffer({ op: 'put', key, revision: entry.revision, draft: draft() }, doc())).state, 'ready');
});
test('expiry and corrupt/unknown storage fail closed before liveness execution', async () => {
  const f = fixture();
  const entry = await f.buffer({ op: 'put', key, draft: draft() }, doc());
  f.advance(7 * 24 * 60 * 60 * 1000);
  assert.deepEqual(await f.buffer({ op: 'list' }, doc()), []);
  await rejects(f.buffer({ op: 'claim', key, revision: entry.revision }, doc('b')), 'DRAFT_EXPIRED');
  assert.equal(f.probes.length, 0);
  f.data = { [DRAFT_BUFFER_STORAGE_KEY]: { version: 999, entries: [] } };
  await rejects(f.buffer({ op: 'list' }, doc()), 'DRAFT_STORAGE_INVALID');
  f.data = { [DRAFT_BUFFER_STORAGE_KEY]: { version: 1, entries: [{ ...entry, owner: { tabId: 1, documentId: 'a' }, response: {} }] } };
  await rejects(f.buffer({ op: 'list' }, doc()), 'DRAFT_STORAGE_INVALID');
});
test('storage errors are isolated and do not poison subsequent operations', async () => {
  const f = fixture();
  const get = f.storage.get, set = f.storage.set;
  f.storage.get = async () => { throw new Error('quota read'); };
  await rejects(f.buffer({ op: 'list' }, doc()), 'DRAFT_STORAGE_ERROR');
  f.storage.get = get;
  f.storage.set = async () => { throw new Error('quota write'); };
  await rejects(f.buffer({ op: 'put', key, draft: draft() }, doc()), 'DRAFT_STORAGE_ERROR');
  assert.deepEqual(await f.buffer({ op: 'list' }, doc()), []);
  f.storage.set = set;
  assert.equal((await f.buffer({ op: 'put', key, draft: draft() }, doc())).key, key);
});
test('entry count and byte limits reject new writes without evicting recovery data', async () => {
  const f = fixture();
  for (let index = 1; index <= 50; index++) await f.buffer({ op: 'put', key: JSON.stringify(['1', 'Fixture branch', '2026-10-26', '2', '0', String(index)]), draft: draft() }, doc());
  await rejects(f.buffer({ op: 'put', key: JSON.stringify(['1', 'Fixture branch', '2026-10-26', '2', '0', '51']), draft: draft() }, doc()), 'DRAFT_BUFFER_FULL');
  assert.equal((await f.buffer({ op: 'list' }, doc())).length, 50);
  const large = draft();
  large.theme = { theme: 'я'.repeat(2001), previousTheme: '', publicWeekId: null, issueHomework: false, issueLabwork: false };
  assert.equal(validLessonDraft(large), false);
  const g = fixture();
  const big = { attendance: Object.fromEntries(Array.from({ length: 500 }, (_, index) => [String(index + 1), { stud: String(index + 1), was: 1, previousWas: 0, visit: '5' }])), marks: {}, rewards: {} };
  let count = 0;
  for (let index = 1; index <= 50; index++) {
    try { await g.buffer({ op: 'put', key: JSON.stringify(['1', 'Fixture branch', '2026-10-26', '2', '0', String(index)]), draft: big }, doc()); count++; }
    catch (error) { assert.equal(error.code, 'DRAFT_BUFFER_FULL'); break; }
  }
  assert.ok(count < 50);
  assert.equal((await g.buffer({ op: 'list' }, doc())).length, count);
});

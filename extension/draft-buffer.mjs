// Extension-private recovery data. This module never calls an Omni endpoint.
export const DRAFT_BUFFER_STORAGE_KEY = 'lessonDraftBuffer';
const VERSION = 1;
const RETENTION = 7 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 1024 * 1024;
const states = ['ready', 'uncertain', 'review'];
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const fields = (value, required, optional = []) => object(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...required, ...optional].includes(key));
const id = value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value);
const text = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
const nullableId = value => value === null || id(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const bad = () => fail('BAD_INPUT', 'Invalid lesson draft buffer data.');
const bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export function validDraftKey(key) {
  if (typeof key !== 'string' || key.length > 1000) return false;
  try {
    const parts = JSON.parse(key);
    return Array.isArray(parts) && parts.length === 6 && JSON.stringify(parts) === key && id(parts[0]) && text(parts[1], 200) && date(parts[2]) && id(parts[3]) && typeof parts[4] === 'string' && /^\d{1,12}$/.test(parts[4]) && id(parts[5]);
  } catch { return false; }
}
export function validLessonDraft(draft) {
  if (!fields(draft, ['attendance', 'marks'], ['rewards', 'theme', 'needsReload']) || draft.needsReload !== undefined && typeof draft.needsReload !== 'boolean') return false;
  const entries = value => object(value) && Object.keys(value).length <= 500;
  if (!entries(draft.attendance) || !entries(draft.marks) || draft.rewards !== undefined && !entries(draft.rewards)) return false;
  for (const [key, change] of Object.entries(draft.attendance)) {
    if (!fields(change, ['stud', 'was', 'previousWas', 'visit']) || !id(change.stud) || key !== change.stud || ![0, 1, 2].includes(change.was) || ![null, 0, 1, 2].includes(change.previousWas) || !nullableId(change.visit)) return false;
  }
  for (const [key, change] of Object.entries(draft.marks)) {
    if (!fields(change, ['stud', 'type', 'mark', 'previousMark', 'visit']) || !id(change.stud) || ![2, 4].includes(change.type) || key !== `${change.stud}:${change.type}` || !Number.isInteger(change.mark) || change.mark < 1 || change.mark > 100 || !(change.previousMark === null || typeof change.previousMark === 'string' && /^\d{1,3}(?:\.\d+)?$/.test(change.previousMark) && change.previousMark.length <= 16) || !nullableId(change.visit)) return false;
  }
  for (const [key, change] of Object.entries(draft.rewards || {})) {
    if (!fields(change, ['stud', 'reward', 'previousReward', 'visit']) || !id(change.stud) || key !== change.stud || ![1, 2, 3, 4].includes(change.reward) || ![null, '1', '2', '3'].includes(change.previousReward) || !nullableId(change.visit)) return false;
  }
  if (draft.theme !== undefined && (!fields(draft.theme, ['theme', 'publicWeekId', 'issueHomework', 'issueLabwork', 'previousTheme']) || !text(draft.theme.theme, 2000) || !draft.theme.theme.trim() || !text(draft.theme.previousTheme, 2000) || !nullableId(draft.theme.publicWeekId) || typeof draft.theme.issueHomework !== 'boolean' || typeof draft.theme.issueLabwork !== 'boolean')) return false;
  return bytes(draft) <= 128 * 1024;
}
export function validateDraftBufferRequest(input) {
  if (!fields(input, ['op'], ['key', 'draft', 'state', 'revision', 'manual', 'release']) || !['list', 'put', 'claim', 'checkpoint', 'remove'].includes(input.op)) bad();
  const allowed = { list: ['op'], put: ['op', 'key', 'draft', 'state', 'revision'], claim: ['op', 'key', 'revision', 'manual'], checkpoint: ['op', 'key', 'draft', 'state', 'revision', 'release'], remove: ['op', 'key', 'revision'] }[input.op];
  if (Object.keys(input).some(key => !allowed.includes(key)) || input.op !== 'list' && !validDraftKey(input.key)) bad();
  if (input.draft !== undefined && !validLessonDraft(input.draft) || input.state !== undefined && !states.includes(input.state) || input.revision !== undefined && !text(input.revision, 100) || input.revision === '' || input.manual !== undefined && typeof input.manual !== 'boolean' || input.release !== undefined && typeof input.release !== 'boolean') bad();
  if (input.op === 'put' && !validLessonDraft(input.draft) || ['claim', 'checkpoint', 'remove'].includes(input.op) && !input.revision || input.op === 'checkpoint' && !states.includes(input.state)) bad();
  if (bytes(input) > 130 * 1024) bad();
}
const publicEntry = ({ owner: _owner, ...entry }) => entry;
const sameOwner = (a, b) => a.tabId === b.tabId && a.documentId === b.documentId;
// Chromium scripting_utils.cc: only these errors prove this exact target vanished.
// Permission denial, shutdown and transport failures leave ownership intact.
const missingOwner = (error, owner) => [
  `No tab with id: ${owner.tabId}`,
  `No tab with id: ${owner.tabId}.`,
  `No document with id ${owner.documentId} in tab with id ${owner.tabId}`,
].includes(error?.message);
export function createDraftBuffer({ storage, scripting, now = Date.now, revision = () => crypto.randomUUID() }) {
  let queue = Promise.resolve();
  async function execute(input, sender) {
    validateDraftBufferRequest(input);
    const owner = { tabId: sender.tab?.id, documentId: sender.documentId };
    if (!Number.isInteger(owner.tabId) || !text(owner.documentId, 200) || !owner.documentId) fail('FORBIDDEN', 'A live Omni document is required.');
    let saved;
    try { saved = (await storage.get(DRAFT_BUFFER_STORAGE_KEY))[DRAFT_BUFFER_STORAGE_KEY]; }
    catch { fail('DRAFT_STORAGE_ERROR', 'Could not read the private draft buffer.'); }
    const time = now();
    const store = saved === undefined ? { version: VERSION, entries: [] } : saved;
    if (!fields(store, ['version', 'entries']) || store.version !== VERSION || !Array.isArray(store.entries) || store.entries.length > 50 || bytes(store) > MAX_BYTES) fail('DRAFT_STORAGE_INVALID', 'Unsupported or invalid private draft buffer.');
    const keys = new Set();
    for (const entry of store.entries) {
      if (!fields(entry, ['key', 'draft', 'state', 'revision', 'updatedAt', 'owner']) || !validDraftKey(entry.key) || keys.has(entry.key) || !validLessonDraft(entry.draft) || !states.includes(entry.state) || !text(entry.revision, 100) || !entry.revision || !Number.isFinite(entry.updatedAt) || entry.updatedAt > time || entry.owner !== null && (!fields(entry.owner, ['tabId', 'documentId']) || !Number.isInteger(entry.owner.tabId) || !text(entry.owner.documentId, 200) || !entry.owner.documentId)) fail('DRAFT_STORAGE_INVALID', 'Invalid private draft buffer entry.');
      keys.add(entry.key);
    }
    const entries = store.entries.filter(entry => time - entry.updatedAt < RETENTION);
    if (input.op === 'list') return entries.map(publicEntry);
    const existing = entries.find(entry => entry.key === input.key);
    if (!existing && store.entries.some(entry => entry.key === input.key)) fail('DRAFT_EXPIRED', 'The saved lesson draft has expired.');
    if (existing && input.revision !== existing.revision || !existing && (input.revision || input.op !== 'put')) fail('DRAFT_STALE', 'The saved lesson draft has changed.');
    if (existing && !existing.owner && ['checkpoint', 'remove'].includes(input.op)) fail('DRAFT_NOT_OWNER', 'Claim this saved lesson draft first.');
    if (existing?.owner && !sameOwner(existing.owner, owner)) {
      // No leases: only failure to address the exact previous document proves it vanished.
      let alive = true;
      try { await scripting.executeScript({ target: { tabId: existing.owner.tabId, documentIds: [existing.owner.documentId] }, world: 'ISOLATED', func: () => true }); }
      catch (error) { alive = !missingOwner(error, existing.owner); }
      if (alive) fail('BUSY', 'This lesson draft is in use by another document.');
      if (input.op !== 'claim' || existing.state !== 'ready' && !input.manual) fail('DRAFT_REVIEW_REQUIRED', 'Review and explicitly restore this saved draft.');
    }
    if (input.op === 'claim' && existing.state !== 'ready' && !input.manual) fail('DRAFT_REVIEW_REQUIRED', 'Review and explicitly restore this saved draft.');
    if (input.op === 'remove') {
      await persist(entries.filter(entry => entry !== existing));
      return null;
    }
    if (input.op === 'put' && existing && existing.state !== 'ready') fail('DRAFT_REVIEW_REQUIRED', 'Review and explicitly restore this saved draft.');
    const next = { key: input.key, draft: input.draft ?? existing.draft, state: input.state ?? existing?.state ?? 'ready', revision: revision(), updatedAt: time, owner: input.release ? null : owner };
    const updated = [...entries.filter(entry => entry !== existing), next];
    if (updated.length > 50 || bytes({ version: VERSION, entries: updated }) > MAX_BYTES) fail('DRAFT_BUFFER_FULL', 'The private lesson draft buffer is full.');
    await persist(updated);
    return publicEntry(next);
  }
  async function persist(entries) {
    try { await storage.set({ [DRAFT_BUFFER_STORAGE_KEY]: { version: VERSION, entries } }); }
    catch { fail('DRAFT_STORAGE_ERROR', 'Could not save the private draft buffer.'); }
  }
  return (input, sender) => {
    const operation = queue.then(() => execute(input, sender));
    queue = operation.catch(() => {});
    return operation;
  };
}

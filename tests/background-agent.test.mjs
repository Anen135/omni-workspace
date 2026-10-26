import { test } from 'node:test';
import assert from 'node:assert/strict';

// Drives the real extension/background.mjs against a fake chrome.* and a fake isolated world.
// The `func` passed to chrome.scripting.executeScript is the production function, executed here.
const origin = 'https://omni.top-academy.ru';
const calls = { inject: 0, func: 0 };
const world = { agent: undefined, nextBuild: 'dev', dispatched: [] };
let onMessage;
const noopEvent = { addListener() {}, removeListener() {} };
const localData = {};
globalThis.chrome = {
  runtime: { id: 'ext', getURL: path => `chrome-extension://ext/${path}`, getManifest: () => ({ version: '1' }), onMessage: { addListener: listener => { onMessage = listener; } } },
  action: { onClicked: noopEvent },
  storage: {
    session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    local: {
      get: async key => Object.hasOwn(localData, key) ? { [key]: structuredClone(localData[key]) } : {},
      set: async values => { Object.assign(localData, structuredClone(values)); },
      setAccessLevel: async options => { assert.deepEqual(options, { accessLevel: 'TRUSTED_CONTEXTS' }); },
    },
  },
  tabs: { get: async id => ({ id, url: `${origin}/`, status: 'complete' }), query: async () => [], sendMessage: async () => {}, onUpdated: noopEvent, onRemoved: noopEvent },
  windows: { update: async () => {} },
  scripting: {
    async executeScript(options) {
      const documentId = options.target.documentIds?.[0];
      if (options.files) {
        assert.deepEqual(options.files, ['agent.js']);
        calls.inject++;
        world.agent = { build: world.nextBuild, dispatch: async (action, input) => { world.dispatched.push([action, input]); return { students: [] }; } };
        return [{ documentId }];
      }
      calls.func++;
      const saved = { agent: globalThis.OmniDesktopAgent, location: globalThis.location };
      globalThis.OmniDesktopAgent = world.agent; globalThis.location = { origin, pathname: '/' };
      try { return [{ documentId, result: await options.func(...(options.args || [])) }]; }
      finally { globalThis.OmniDesktopAgent = saved.agent; globalThis.location = saved.location; }
    },
  },
};
await import('../extension/background.mjs');

const sender = { id: 'ext', url: `${origin}/`, frameId: 0, documentId: 'doc-1', tab: { id: 7, url: `${origin}/` } };
// busy is released in .finally() right after sendResponse, so let that settle before the next command.
const send = async message => { const response = await new Promise(resolve => { onMessage(message, sender, resolve); }); await new Promise(resolve => setImmediate(resolve)); return response; };
const reset = () => { calls.inject = 0; calls.func = 0; world.agent = undefined; world.nextBuild = 'dev'; world.dispatched = []; };

test('agent is injected on demand and then reused by later commands', async () => {
  reset();
  assert.deepEqual(await send({ action: 'group', input: { group: '1' } }), { data: { students: [] } });
  assert.equal(calls.inject, 1, 'first command injects the bundle once');
  assert.equal(calls.func, 2, 'the command is retried once after the injection');
  assert.deepEqual(await send({ action: 'group', input: { group: '2' } }), { data: { students: [] } });
  assert.deepEqual(await send({ action: 'group', input: { group: '3' } }), { data: { students: [] } });
  assert.equal(calls.inject, 1, 'later commands do not inject again');
  assert.equal(calls.func, 4, 'one executeScript call per later command');
  assert.deepEqual(world.dispatched.map(([, input]) => input.group), ['1', '2', '3'], 'each command ran exactly once');
});

test('an agent left by another build is replaced before the command runs', async () => {
  reset();
  world.agent = { build: 'older-build', dispatch: async () => { throw new Error('stale agent must not run'); } };
  assert.deepEqual(await send({ action: 'group', input: { group: '1' } }), { data: { students: [] } });
  assert.equal(calls.inject, 1);
  assert.equal(world.dispatched.length, 1);
});

test('a missing agent after injection fails instead of looping or running anything', async () => {
  reset();
  world.nextBuild = 'wrong-build';
  const response = await send({ action: 'group', input: { group: '1' } });
  assert.ok(response.error);
  assert.equal(calls.inject, 1, 'at most one injection per command');
  assert.equal(world.dispatched.length, 0);
});

test('file previews never touch the page', async () => {
  reset();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => { const response = new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), { status: 200 }); Object.defineProperty(response, 'url', { value: String(url) }); return response; };
  try {
    const response = await send({ action: 'file-preview', input: { url: 'https://fs.top-academy.ru/api/v1/files/abc123' } });
    assert.equal(response.data?.type, 'application/pdf');
  } finally { globalThis.fetch = originalFetch; }
  assert.equal(calls.inject + calls.func, 0, 'no executeScript for file previews');
});

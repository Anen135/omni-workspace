import { officialOrigin, officialUrl, trustedSender, validateMessage } from './policy.mjs';
import { previewFile } from './files.mjs';
import { switchTeacherInPage } from './switch-teacher.mjs';
const uiUrl = chrome.runtime.getURL('index.html');
let busy = false;
const previews = new Map();
let activePreviews = 0;
async function invalidateSession() {
  previews.clear();
  const revision = crypto.randomUUID();
  await chrome.storage.session.set({ sessionRevision: revision });
  const tabs = await chrome.tabs.query({ url: officialOrigin + '/*' });
  await Promise.allSettled(tabs.map(tab => chrome.tabs.sendMessage(tab.id, { action: 'session-revision', revision }, { frameId: 0 })));
}
function loadPreview(url) {
  if (previews.has(url)) return previews.get(url);
  if (activePreviews >= 2) return Promise.reject(Object.assign(new Error('Дождитесь загрузки других превью.'), { code: 'BUSY' }));
  activePreviews++;
  const operation = previewFile(url).finally(() => {
    activePreviews--;
    // Share the hover download with inline expansion, but do not retain files indefinitely.
    setTimeout(() => { if (previews.get(url) === operation) previews.delete(url); }, 10000);
  });
  if (previews.size >= 4) previews.delete(previews.keys().next().value);
  previews.set(url, operation);
  return operation;
}

async function openWorkspace(preferred) {
  const tabs = await chrome.tabs.query({ url: officialOrigin + '/*' });
  let tab = tabs.find(tab => tab.id === preferred?.id) || tabs.find(tab => tab.active) || tabs[0];
  if (!tab) tab = await chrome.tabs.create({ url: officialOrigin + '/', active: true });
  else {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  try { await chrome.tabs.sendMessage(tab.id, { action: 'workspace-ping' }, { frameId: 0 }); }
  catch {
    // Declarative content scripts do not run retroactively in tabs which were
    // already open when the extension was installed or reloaded.
    try { await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', files: ['content.js'] }); } catch { /* Its next document will load the declarative script. */ }
  }
  return tab;
}
chrome.action.onClicked.addListener(tab => { void openWorkspace(tab).catch(() => {}); });

async function dispatch({ action, input = {} }, sender) {
  const logoutKey = Number.isInteger(sender.tab?.id) ? `logoutWarning:${sender.tab.id}` : '';
  if (action === 'capabilities') {
    if (logoutKey && officialUrl(sender.url) && new URL(sender.url).pathname.startsWith('/login')) await chrome.storage.session.remove(logoutKey);
    return { version: chrome.runtime.getManifest().version, teacherSwitch: true, accountSwitch: true, attendance: true, lessonTheme: true, lessonMark: true, sessionRevision: (await chrome.storage.session.get('sessionRevision')).sessionRevision || '' };
  }
  if (!officialUrl(sender.url)) {
    if (action !== 'connect') throw Object.assign(new Error('Откройте Omni.'), { code: 'FORBIDDEN' });
    await openWorkspace();
    return { connected: false, state: 'loading' };
  }
  const tab = await chrome.tabs.get(sender.tab.id);
  if (!officialUrl(tab.url)) throw Object.assign(new Error('Откройте Omni.'), { code: 'AUTH_REQUIRED' });
  if (action === 'file-preview') return loadPreview(input.url);
  const target = { tabId: tab.id, documentIds: [sender.documentId] };
  // Pin every command, including logout, to the document which sent it.
  const injections = await chrome.scripting.executeScript({ target, world: 'ISOLATED', files: ['agent.js'] });
  const documentId = injections[0]?.documentId;
  if (!documentId) throw new Error('Страница Omni изменилась. Повторите запрос.');
  if (action === 'switch-account') {
    await chrome.storage.session.remove(logoutKey);
    await invalidateSession();
    // This is Omni's own logout navigation, not cookie deletion or password handling.
    await new Promise((resolve, reject) => {
      let finished = false;
      const failedLogout = () => Object.assign(new Error('Omni не подтвердил выход. Завершите выход на этой странице и войдите в другой аккаунт.'), { code: 'LOGOUT_UNCONFIRMED' });
      const finish = error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer); chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed);
        if (error?.code === 'LOGOUT_UNCONFIRMED') void chrome.storage.session.set({ [logoutKey]: error.message }).then(() => reject(error), () => reject(error));
        else if (error) reject(error);
        else void chrome.storage.session.remove(logoutKey).then(resolve, reject);
      };
      const updated = (id, change, current) => {
        if (id !== tab.id || change.status !== 'complete' || !officialUrl(current.url)) return;
        if (new URL(current.url).pathname.startsWith('/login')) finish();
        else finish(failedLogout());
      };
      const removed = id => { if (id === tab.id) finish(new Error('Вкладка Omni закрыта.')); };
      const timer = setTimeout(() => finish(failedLogout()), 30000);
      chrome.tabs.onUpdated.addListener(updated);
      chrome.tabs.onRemoved.addListener(removed);
      chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [documentId] }, world: 'ISOLATED', func: () => { location.assign('/auth/logout'); } }).catch(finish);
    });
    return { connected: false, state: 'login' };
  }
  if (tab.status !== 'complete') {
    if (action === 'status' || action === 'connect') return { connected: false, state: 'loading' };
    throw Object.assign(new Error('Дождитесь загрузки вкладки Omni.'), { code: 'AUTH_REQUIRED' });
  }
  if (action === 'switch-teacher') {
    const invoke = async (target, verifyOnly) => {
      const responses = await chrome.scripting.executeScript({ target, world: 'MAIN', func: switchTeacherInPage, args: [input, verifyOnly] });
      const response = responses[0]?.result;
      if (response?.error) throw Object.assign(new Error(response.error.message), { code: response.error.code });
      if (!response?.data) throw new Error('Omni не подтвердил переключение.');
      return response.data;
    };
    const result = await invoke({ tabId: tab.id, documentIds: [documentId] }, false);
    if (!result.switched) return result;
    await invalidateSession();
    await new Promise((resolve, reject) => {
      const finish = (error) => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed); error ? reject(error) : resolve(); };
      const updated = (id, change) => { if (id === tab.id && change.status === 'complete') finish(); };
      const removed = id => { if (id === tab.id) finish(new Error('Вкладка Omni закрыта.')); };
      const timer = setTimeout(() => finish(new Error('Вкладка Omni не загрузилась.')), 30000);
      chrome.tabs.onUpdated.addListener(updated);
      chrome.tabs.onRemoved.addListener(removed);
      chrome.tabs.reload(tab.id).catch(finish);
    });
    const current = await chrome.tabs.get(tab.id);
    if (!officialUrl(current.url)) throw Object.assign(new Error('Откройте официальный вход Omni.'), { code: 'AUTH_REQUIRED' });
    return invoke({ tabId: tab.id, frameIds: [0] }, true);
  }
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id, documentIds: [documentId] }, world: 'ISOLATED',
    func: async (action, inputJson) => {
      if (location.origin !== 'https://omni.top-academy.ru') return { error: { code: 'AUTH_REQUIRED', message: 'Откройте Omni.' } };
      // executeScript can omit null-valued object fields; preserve explicit
      // unknown attendance/visit values through a JSON string envelope.
      try {
        const data = await globalThis.OmniDesktopAgent.dispatch(action, JSON.parse(inputJson));
        if ((action === 'status' || action === 'connect') && data.connected) {
          // A signed-in URL alone is not proof that the session is still valid.
          const profile = await fetch('/profile/get-profile', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000), headers: {
            'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '',
            'Id-Local-Hash': sessionStorage.getItem('IdLocalHash') || '',
          }, body: '{}' });
          if ([401, 403].includes(profile.status) || new URL(profile.url).pathname.startsWith('/login')) return { data: { connected: false, state: 'login' } };
          if (!profile.ok) throw new Error('Omni не подтвердил сессию.');
          const identity = (await profile.json())?.teach_info;
          if (!identity?.id_teach || typeof identity.fio_teach !== 'string') throw new Error('Omni не подтвердил профиль.');
        }
        return { data };
      }
      catch (error) { return { error: { code: error.code || 'EXTENSION_ERROR', message: error.code ? error.message : 'Не удалось выполнить запрос Omni.' } }; }
    }, args: [action, JSON.stringify(input)],
  });
  const result = results[0]?.result;
  if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  if (!result || !Object.hasOwn(result, 'data')) throw new Error('Omni не вернул ответ.');
  if (['connect', 'status'].includes(action)) {
    if (result.data.state === 'login') await chrome.storage.session.remove(logoutKey);
    else {
      const warning = (await chrome.storage.session.get(logoutKey))[logoutKey];
      if (typeof warning === 'string') result.data.warning = warning;
    }
  }
  if (['connect', 'status'].includes(action) && result.data.state === 'login' && !new URL(tab.url).pathname.startsWith('/login')) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id, documentIds: [documentId] }, world: 'ISOLATED', func: () => { if (!location.pathname.startsWith('/login')) location.assign('/login/index'); } });
  }
  return result.data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender, chrome.runtime.id, uiUrl)) { sendResponse({ error: { code: 'FORBIDDEN', message: 'Источник команды не разрешён.' } }); return false; }
  try { validateMessage(message); }
  catch (error) { sendResponse({ error: { code: 'BAD_INPUT', message: error.message || 'Некорректная команда расширения.' } }); return false; }
  if (!officialUrl(sender.url) && !['connect', 'capabilities'].includes(message.action)) { sendResponse({ error: { code: 'FORBIDDEN', message: 'Откройте Omni.' } }); return false; }
  const parallel = ['file-preview', 'capabilities'].includes(message.action);
  const tabId = sender.tab?.id;
  if (!parallel && busy) { sendResponse({ error: { code: 'BUSY', message: 'Дождитесь завершения предыдущего запроса.' } }); return false; }
  if (!parallel) busy = true;
  void dispatch(message, sender).then(data => sendResponse({ data }), error => {
    sendResponse({ error: {
      code: error.code || 'EXTENSION_ERROR', message: error.code ? error.message : message.action === 'file-preview' ? 'Не удалось загрузить превью (лимит 8 МБ). Откройте оригинал по ссылке.' : 'Не удалось связаться с Omni. Повторите запрос на этой странице.',
    } });
    if (error.code === 'AUTH_REQUIRED' && Number.isInteger(tabId)) {
      // Native login replaces the current document, never a companion tab.
      const target = { tabId, documentIds: [sender.documentId] };
      void chrome.scripting.executeScript({ target, world: 'ISOLATED', func: () => { if (location.origin === 'https://omni.top-academy.ru' && !location.pathname.startsWith('/login')) location.assign('/login/index'); } }).catch(() => {});
    }
  }).finally(() => { if (!parallel) busy = false; });
  return true;
});

import { officialOrigin, officialUrl, trustedSender, validateMessage } from './policy.mjs';
import { previewFile } from './files.mjs';
import { switchTeacherInPage } from './switch-teacher.mjs';
const uiUrl = chrome.runtime.getURL('index.html');
let busy = false;
const previews = new Map();
let activePreviews = 0;
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

chrome.action.onClicked.addListener(() => { void chrome.tabs.create({ url: uiUrl }); });

async function getTab(open) {
  const { omniTabId } = await chrome.storage.session.get('omniTabId');
  let tab;
  if (Number.isInteger(omniTabId)) {
    try { tab = await chrome.tabs.get(omniTabId); } catch { /* Closed tab; never pick an unrelated tab. */ }
  }
  if (tab && !officialUrl(tab.url)) tab = null;
  if (!tab && open) {
    tab = await chrome.tabs.create({ url: 'about:blank', active: true });
    await chrome.storage.session.set({ omniTabId: tab.id });
    tab = await chrome.tabs.update(tab.id, { url: officialOrigin + '/' });
  } else if (tab && open) {
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return tab;
}

async function dispatch({ action, input = {} }) {
  if (action === 'capabilities') return { version: chrome.runtime.getManifest().version, teacherSwitch: true, accountSwitch: true };
  if (action === 'file-preview') return loadPreview(input.url);
  const tab = await getTab(action === 'connect' || action === 'switch-account');
  if (!tab) {
    if (action === 'status') return { connected: false, state: 'disconnected' };
    throw Object.assign(new Error('Нажмите «Открыть официальный вход».'), { code: 'AUTH_REQUIRED' });
  }
  if (action === 'switch-account') {
    previews.clear();
    // This is Omni's own logout navigation, not cookie deletion or password handling.
    await new Promise((resolve, reject) => {
      const finish = error => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(updated); chrome.tabs.onRemoved.removeListener(removed); error ? reject(error) : resolve(); };
      const updated = (id, change, current) => { if (id === tab.id && change.status === 'complete' && officialUrl(current.url) && new URL(current.url).pathname.startsWith('/login')) finish(); };
      const removed = id => { if (id === tab.id) finish(new Error('Вкладка Omni закрыта.')); };
      const timer = setTimeout(() => finish(Object.assign(new Error('Omni не подтвердил выход. Завершите выход в официальной вкладке и войдите в другой аккаунт.'), { code: 'LOGOUT_UNCONFIRMED' })), 30000);
      chrome.tabs.onUpdated.addListener(updated);
      chrome.tabs.onRemoved.addListener(removed);
      chrome.tabs.update(tab.id, { url: officialOrigin + '/auth/logout', active: true }).catch(finish);
    });
    return { connected: false, state: 'login' };
  }
  if (tab.status !== 'complete') {
    if (action === 'status' || action === 'connect') return { connected: false, state: 'loading' };
    throw Object.assign(new Error('Дождитесь загрузки вкладки Omni.'), { code: 'AUTH_REQUIRED' });
  }
  const injections = await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, world: 'ISOLATED', files: ['agent.js'] });
  const documentId = injections[0]?.documentId;
  if (!documentId) throw new Error('Вкладка Omni изменилась. Повторите запрос.');
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
    previews.clear();
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
    func: async (action, input) => {
      if (location.origin !== 'https://omni.top-academy.ru') return { error: { code: 'AUTH_REQUIRED', message: 'Откройте Omni.' } };
      try { return { data: await globalThis.OmniDesktopAgent.dispatch(action, input) }; }
      catch (error) { return { error: { code: error.code || 'EXTENSION_ERROR', message: error.code ? error.message : 'Не удалось выполнить запрос Omni.' } }; }
    }, args: [action, input],
  });
  const result = results[0]?.result;
  if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  if (!result || !Object.hasOwn(result, 'data')) throw new Error('Omni не вернул ответ.');
  return result.data;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender, chrome.runtime.id, uiUrl)) { sendResponse({ error: { code: 'FORBIDDEN', message: 'Источник команды не разрешён.' } }); return false; }
  try { validateMessage(message); }
  catch (error) { sendResponse({ error: { code: 'BAD_INPUT', message: error.message || 'Некорректная команда расширения.' } }); return false; }
  const file = message.action === 'file-preview';
  if (!file && busy) { sendResponse({ error: { code: 'BUSY', message: 'Дождитесь завершения предыдущего запроса.' } }); return false; }
  if (!file) busy = true;
  void dispatch(message).then(data => sendResponse({ data }), error => sendResponse({ error: {
    code: error.code || 'EXTENSION_ERROR', message: error.code ? error.message : message.action === 'file-preview' ? 'Не удалось загрузить превью (лимит 8 МБ). Откройте оригинал по ссылке.' : 'Не удалось связаться с вкладкой Omni. Откройте официальный вход и повторите.',
  } })).finally(() => { if (!file) busy = false; });
  return true;
});

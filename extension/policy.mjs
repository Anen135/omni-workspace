import { validateInput } from '../server/bridge-protocol.mjs';
export const officialOrigin = 'https://omni.top-academy.ru';
const actions = new Set(['connect', 'status', 'snapshot', 'lesson', 'student', 'group', 'materials-catalog', 'method-package']);
export function officialUrl(value) {
  try { const u = new URL(value); return u.origin === officialOrigin && !u.username && !u.password; } catch { return false; }
}
export function trustedSender(sender, id, pageUrl) {
  if (sender.id !== id || sender.frameId && sender.frameId !== 0) return false;
  try { const url = new URL(sender.url); return url.origin === new URL(pageUrl).origin && url.protocol === 'chrome-extension:' && url.host === id && url.pathname === '/index.html'; } catch { return false; }
}
export function validateMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).some(key => !['action', 'input'].includes(key))) throw new Error('Некорректная команда.');
  if (JSON.stringify(message).length > 8192) throw new Error('Слишком большой запрос.');
  if (message.action === 'file-preview') {
    if (!message.input || Object.keys(message.input).length !== 1 || !allowedFile(message.input.url)) throw new Error('Недопустимый адрес файла.');
    return;
  }
  if (!actions.has(message.action)) throw new Error('Команда не поддерживается расширением.');
  validateInput(message.action, message.input ?? {});
}
export function allowedFile(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      url.hostname === 'fs.top-academy.ru' && /^\/api\/v1\/files\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.hostname === 'storage.yandexcloud.net' && url.pathname.startsWith('/top-academy-services-omni/'));
  } catch { return false; }
}

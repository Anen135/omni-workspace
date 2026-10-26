import { validateInput } from '../server/bridge-protocol.mjs';
import { validateDraftBufferRequest } from './draft-buffer.mjs';
export const officialOrigin = 'https://omni.top-academy.ru';
const actions = new Set(['connect', 'status', 'snapshot', 'homework-queue', 'schedule-range', 'lesson', 'student', 'group', 'switch-teacher', 'materials-catalog', 'method-package', 'teacher-dossier', 'set-attendance', 'lesson-themes', 'set-lesson-theme', 'set-lesson-mark', 'set-lesson-reward', 'set-homework-marks']);
export function officialUrl(value) {
  try { const u = new URL(value); return u.origin === officialOrigin && !u.username && !u.password; } catch { return false; }
}
export function trustedSender(sender, id, pageUrl) {
  if (sender.id !== id) return false;
  if (officialUrl(sender.url)) return sender.frameId === 0 && typeof sender.documentId === 'string' && sender.documentId.length > 0 && Number.isInteger(sender.tab?.id) && (!sender.tab.url || officialUrl(sender.tab.url));
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  // Older extension bookmarks remain launchers; they cannot execute API commands.
  try { const url = new URL(sender.url); return url.href === pageUrl && url.protocol === 'chrome-extension:' && url.host === id && url.pathname === '/index.html'; } catch { return false; }
}
export function validateMessage(message) {
  if (message?.action === 'draft-buffer') {
    if (Object.keys(message).some(key => !['action', 'input'].includes(key))) throw new Error('Invalid draft buffer message.');
    validateDraftBufferRequest(message.input);
    return;
  }
  if (!message || typeof message !== 'object' || Array.isArray(message) || Object.keys(message).some(key => !['action', 'input'].includes(key))) throw new Error('Некорректная команда.');
  if (JSON.stringify(message).length > (message.action === 'set-homework-marks' ? 65536 : message.action === 'set-attendance' ? 16384 : 8192)) throw new Error('Слишком большой запрос.');
  if (message.action === 'capabilities' || message.action === 'switch-account') {
    if (!message.input || typeof message.input !== 'object' || Array.isArray(message.input) || Object.keys(message.input).length) throw new Error('Некорректный запрос возможностей расширения.');
    return;
  }
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
      url.hostname === 'storage.yandexcloud.net' && (url.pathname.startsWith('/top-academy-services-omni/') || url.pathname.startsWith('/top-academy-services-msapi/')));
  } catch { return false; }
}

type ExtensionRuntime = {
  id?: string;
  sendMessage: (message: unknown) => Promise<{ data?: unknown; error?: { code: string; message: string } }>;
  onMessage?: {
    addListener: (listener: (message: { action?: string; revision?: unknown }, sender: { id?: string; tab?: unknown }) => void) => void;
    removeListener: (listener: (message: { action?: string; revision?: unknown }, sender: { id?: string; tab?: unknown }) => void) => void;
  };
};
export const isExtension = () => import.meta.env.MODE === 'extension' && location.origin === 'https://omni.top-academy.ru' && !!window.chrome;
let officialLoginRequired: (() => void) | undefined;
export function onOfficialLoginRequired(callback: () => void) { officialLoginRequired = callback; }
export function onExtensionSessionChange(callback: () => void): () => void {
  if (!isExtension()) return () => {};
  const runtime = (window.chrome as unknown as { runtime?: ExtensionRuntime })?.runtime;
  let revision: string | null = null;
  let disposed = false;
  let readVersion = 0;
  const accept = (value: unknown) => {
    const next = typeof value === 'string' ? value : '';
    if (revision !== null && revision !== next) callback();
    revision = next;
  };
  const listener = (message: { action?: string; revision?: unknown }, sender: { id?: string; tab?: unknown }) => {
    if (sender.id === runtime?.id && !sender.tab && message.action === 'session-revision') {
      readVersion++;
      // A newly loaded tab has no data to invalidate, but its first event still matters.
      if (revision === null) { revision = ''; }
      accept(message.revision);
    }
  };
  const check = () => {
    const version = ++readVersion;
    void runtime?.sendMessage({ action: 'capabilities', input: {} }).then(value => {
      if (!disposed && version === readVersion) accept((value.data as { sessionRevision?: unknown } | undefined)?.sessionRevision);
    }).catch(() => {});
  };
  runtime?.onMessage?.addListener(listener);
  check();
  const checkWhenVisible = () => { if (!document.hidden) check(); };
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', checkWhenVisible);
  return () => {
    disposed = true;
    runtime?.onMessage?.removeListener(listener);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', checkWhenVisible);
  };
}
const actionCapabilities = new Map<string, string>([
  ['switch-teacher', 'teacherSwitch'],
  ['switch-account', 'accountSwitch'],
  ['set-attendance', 'attendance'],
  ['lesson-themes', 'lessonTheme'],
  ['set-lesson-theme', 'lessonTheme'],
  ['set-lesson-mark', 'lessonMark'],
  ['set-lesson-reward', 'lessonReward'],
  ['set-homework-marks', 'homeworkMarks'],
]);

export async function extensionRequest<T>(action: string, input: unknown): Promise<T> {
  const runtime = (window.chrome as unknown as { runtime?: ExtensionRuntime })?.runtime;
  if (!isExtension() || !runtime) throw new Error('Откройте интерфейс через значок установленного расширения.');
  const capability = actionCapabilities.get(action);
  if (capability) {
    const capabilities = await runtime.sendMessage({ action: 'capabilities', input: {} });
    const supported = capabilities?.data as Record<string, boolean> | undefined;
    if (capabilities?.error || !supported?.[capability]) {
      throw Object.assign(new Error('Фоновый обработчик расширения устарел. Перезагрузите Omni Workspace на странице управления расширениями браузера, затем обновите страницу Omni или нажмите значок расширения.'), { code: 'EXTENSION_UPDATE_REQUIRED' });
    }
  }
  const result = await runtime.sendMessage({ action, input });
  if (result?.error) {
    if (['AUTH_REQUIRED', 'CHALLENGE'].includes(result.error.code)) officialLoginRequired?.();
    throw Object.assign(new Error(result.error.message), { code: result.error.code });
  }
  return result.data as T;
}

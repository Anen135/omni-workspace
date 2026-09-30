type ExtensionRuntime = { sendMessage: (message: unknown) => Promise<{ data?: unknown; error?: { code: string; message: string } }> };
type StorageChange = { newValue?: unknown };
type ExtensionStorage = {
  session?: { get: (key: string) => Promise<Record<string, unknown>> };
  onChanged?: {
    addListener: (listener: (changes: Record<string, StorageChange>, area: string) => void) => void;
    removeListener: (listener: (changes: Record<string, StorageChange>, area: string) => void) => void;
  };
};
export const isExtension = () => import.meta.env.MODE === 'extension' && location.protocol === 'chrome-extension:';
export function onExtensionSessionChange(callback: () => void): () => void {
  if (!isExtension()) return () => {};
  const storage = (window.chrome as unknown as { storage?: ExtensionStorage })?.storage;
  let revision: string | null = null;
  let disposed = false;
  let readVersion = 0;
  const accept = (value: unknown) => {
    const next = typeof value === 'string' ? value : '';
    if (revision !== null && revision !== next) callback();
    revision = next;
  };
  const listener = (changes: Record<string, StorageChange>, area: string) => {
    if (area === 'session' && Object.hasOwn(changes, 'sessionRevision')) {
      readVersion++;
      // A newly loaded tab has no data to invalidate, but its first event still matters.
      if (revision === null) { revision = ''; }
      accept(changes.sessionRevision.newValue);
    }
  };
  const check = () => {
    const version = ++readVersion;
    void storage?.session?.get('sessionRevision').then(value => {
      if (!disposed && version === readVersion) accept(value.sessionRevision);
    }).catch(() => {});
  };
  storage?.onChanged?.addListener(listener);
  check();
  const checkWhenVisible = () => { if (!document.hidden) check(); };
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', checkWhenVisible);
  return () => {
    disposed = true;
    storage?.onChanged?.removeListener(listener);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', checkWhenVisible);
  };
}
export async function extensionRequest<T>(action: string, input: unknown): Promise<T> {
  const runtime = (window.chrome as unknown as { runtime?: ExtensionRuntime })?.runtime;
  if (!isExtension() || !runtime) throw new Error('Откройте интерфейс через значок установленного расширения.');
  if (action === 'switch-teacher' || action === 'switch-account' || action === 'set-attendance') {
    const capabilities = await runtime.sendMessage({ action: 'capabilities', input: {} });
    const supported = capabilities?.data as { teacherSwitch?: boolean; accountSwitch?: boolean; attendance?: boolean } | undefined;
    if (capabilities?.error || !(action === 'set-attendance' ? supported?.attendance : action === 'switch-account' ? supported?.accountSwitch : supported?.teacherSwitch)) {
      throw Object.assign(new Error('Фоновый обработчик расширения устарел. Перезагрузите Omni Workspace на странице управления расширениями браузера, затем закройте старую вкладку интерфейса и откройте его заново через значок расширения. Обновления самой страницы недостаточно.'), { code: 'EXTENSION_UPDATE_REQUIRED' });
    }
  }
  const result = await runtime.sendMessage({ action, input });
  if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as T;
}

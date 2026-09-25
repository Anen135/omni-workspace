type ExtensionRuntime = { sendMessage: (message: unknown) => Promise<{ data?: unknown; error?: { code: string; message: string } }> };
export const isExtension = () => import.meta.env.MODE === 'extension' && location.protocol === 'chrome-extension:';
export async function extensionRequest<T>(action: string, input: unknown): Promise<T> {
  const runtime = (window.chrome as unknown as { runtime?: ExtensionRuntime })?.runtime;
  if (!isExtension() || !runtime) throw new Error('Откройте интерфейс через значок установленного расширения.');
  if (action === 'switch-teacher' || action === 'switch-account') {
    const capabilities = await runtime.sendMessage({ action: 'capabilities', input: {} });
    const supported = capabilities?.data as { teacherSwitch?: boolean; accountSwitch?: boolean } | undefined;
    if (capabilities?.error || !(action === 'switch-account' ? supported?.accountSwitch : supported?.teacherSwitch)) {
      throw Object.assign(new Error('Фоновый обработчик расширения устарел. Перезагрузите Omni Workspace на странице управления расширениями браузера, затем закройте старую вкладку интерфейса и откройте его заново через значок расширения. Обновления самой страницы недостаточно.'), { code: 'EXTENSION_UPDATE_REQUIRED' });
    }
  }
  const result = await runtime.sendMessage({ action, input });
  if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as T;
}

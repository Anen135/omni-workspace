type ExtensionRuntime = { sendMessage: (message: unknown) => Promise<{ data?: unknown; error?: { code: string; message: string } }> };
export const isExtension = () => import.meta.env.MODE === 'extension' && location.protocol === 'chrome-extension:';
export async function extensionRequest<T>(action: string, input: unknown): Promise<T> {
  const runtime = (window.chrome as unknown as { runtime?: ExtensionRuntime })?.runtime;
  if (!isExtension() || !runtime) throw new Error('Откройте интерфейс через значок установленного расширения.');
  const result = await runtime.sendMessage({ action, input });
  if (result?.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data as T;
}

type NativeWebView = {
  postMessage: (message: unknown) => void;
  addEventListener: (name: 'message', listener: (event: MessageEvent) => void) => void;
};
declare global {
  interface Window { __OMNI_DESKTOP__?: { version: number }; chrome?: { webview?: NativeWebView } }
}
export const isDesktop = () => window.__OMNI_DESKTOP__?.version === 1 && !!window.chrome?.webview;
const pending = new Map<string, { resolve: (data: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let listening = false;
export function desktopRequest<T>(action: string, input: unknown): Promise<T> {
  const native = window.chrome?.webview;
  if (!isDesktop() || !native) return Promise.reject(new Error('Desktop adapter unavailable'));
  if (!listening) {
    native.addEventListener('message', event => {
      const message = event.data;
      const operation = pending.get(message?.id);
      if (!operation) return;
      clearTimeout(operation.timer); pending.delete(message.id);
      if (message.result?.error) operation.reject(Object.assign(new Error(message.result.error.message), { code: message.result.error.code }));
      else operation.resolve(message.result?.data);
    });
    listening = true;
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Omni не ответил вовремя.')); }, 185000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    native.postMessage({ id, action, input });
  });
}

import { desktopRequest, isDesktop } from './desktop-client';
export type RemoteRecord = Record<string, unknown>;
export type Section = { data: unknown; error: string | null };
export type Account = { id: string; name: string; branch?: string; timezone?: string };
export type Snapshot = {
  account: Account; schedule: Section; presents: Section; groups: Section;
  homework: Section; newHomework: Section;
  teachers: Section;
  counts: { homework: number; practice: number }; fetchedAt: string;
};
export type RemoteLesson = { account: Account; presents: unknown; materials: Section; homework: Section };
export class ConnectionError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export async function omniRequest<Result>(action: string, input = {}): Promise<Result> {
  if (isDesktop()) {
    try { return await desktopRequest<Result>(action, input); }
    catch (error) { throw new ConnectionError((error as { code?: string }).code || 'DESKTOP_ERROR', error instanceof Error ? error.message : 'Ошибка подключения.'); }
  }
  let response: Response;
  try {
    response = await fetch(`/api/omni/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Omni-Client': 'workspace' },
      body: JSON.stringify(input), signal: AbortSignal.timeout(180000),
    });
  } catch { throw new ConnectionError('OFFLINE', 'Локальное подключение недоступно. Проверьте, что npm run dev запущен.'); }
  let result;
  try { result = await response.json(); } catch { throw new ConnectionError('OFFLINE', 'Сервер подключения не запущен. Используйте npm run dev или npm run preview.'); }
  if (!response.ok) throw new ConnectionError(result.error?.code || 'ERROR', result.error?.message || 'Не удалось получить данные Omni.');
  return result;
}
export function record(value: unknown): RemoteRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RemoteRecord : {};
}
export function rows(value: unknown): RemoteRecord[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object').map(record);
  const object = record(value);
  if (Object.keys(object).length && Object.values(object).every(item => item && typeof item === 'object')) return Object.values(object).map(record);
  return Object.keys(object).length ? [object] : [];
}
export function label(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

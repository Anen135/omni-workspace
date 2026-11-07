import { useMemo, useRef, useState, type RefObject } from 'react';
import { ConnectionError, omniRequest } from '../services/omni-client';
import type { LessonAccessData, LessonAccessTarget } from '../features/lesson/lesson-access';

export function useLessonAccess({ accountId, branch, generation, operation, sessionVersion, setBusy, failed, loadLesson }: {
  accountId: string; branch: string; generation: number; operation: RefObject<boolean>; sessionVersion: RefObject<number>;
  setBusy: (busy: boolean) => void; failed: (error: unknown) => void;
  loadLesson: (group?: string, slot?: string, date?: string) => Promise<void>;
}) {
  const context = useMemo(() => ({}), [accountId, branch, generation]);
  const active = useRef(context); active.current = context;
  const [selection, setSelection] = useState<{ context: object; target: LessonAccessTarget } | null>(null);
  const [uncertain, setUncertain] = useState<{ context: object; dates: string[] }>({ context, dates: [] });
  const blockedDates = uncertain.context === context ? uncertain.dates : [];
  async function execute(action: 'lesson-access' | 'request-lesson-access', input: { date?: string; message?: string } = {}) {
    if (!accountId || operation.current || active.current !== context) throw new Error('Дождитесь завершения операции.');
    if (input.date && blockedDates.includes(input.date)) throw new Error('Отправка этой даты не подтверждена. Проверьте запрос в оригинальном Omni.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true);
    try {
      const result = await omniRequest<LessonAccessData & { message?: string }>(action, { accountId, ...input });
      if (active.current !== context || version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      if (result.account.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился.');
      return result;
    } catch (error) {
      if (active.current === context && version === sessionVersion.current) {
        if (action === 'request-lesson-access' && input.date && (!(error instanceof ConnectionError) || !['BAD_INPUT', 'ACCESS_DATE_UNAVAILABLE', 'ACCESS_REQUEST_EXISTS', 'ACCESS_REJECTED', 'AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'EXTENSION_UPDATE_REQUIRED'].includes(error.code))) {
          setUncertain(current => ({ context, dates: [...new Set([...(current.context === context ? current.dates : []), input.date!])] }));
        }
        if (error instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(error.code)) failed(error);
      }
      throw error;
    } finally {
      if (version === sessionVersion.current) { operation.current = false; setBusy(false); }
    }
  }
  return {
    target: selection?.context === context ? selection.target : null,
    blockedDates,
    open: (target: LessonAccessTarget = {}) => { if (!operation.current) setSelection({ context, target }); },
    close: () => setSelection(null),
    load: () => execute('lesson-access'),
    send: (date: string, message: string) => execute('request-lesson-access', { date, message }),
    openApproved: (date: string) => {
      if (operation.current || active.current !== context) return;
      const target = selection?.context === context && selection.target.date === date ? selection.target : {};
      setSelection(null);
      void loadLesson(target.group, target.slot, date);
    },
  };
}

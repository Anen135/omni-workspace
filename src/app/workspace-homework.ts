import type { Dispatch, RefObject, SetStateAction } from 'react';
import { type HomeworkResponseDraft, type HomeworkReviewItem } from '../features/homework/homework';
import { ConnectionError, omniRequest, type Section, type Snapshot } from '../services/omni-client';


type Options = {
snapshot: Snapshot | null;
operation: RefObject<boolean>;
sessionVersion: RefObject<number>;
setBusy: Dispatch<SetStateAction<boolean>>;
setError: Dispatch<SetStateAction<string>>;
setHomeworkNeedsReload: Dispatch<SetStateAction<boolean>>;
ensureAccount: (account: { id: string; }) => void;
setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
setHomeworkSaved: Dispatch<SetStateAction<Record<string, { mark: number; comment?: string; }>>>;
failed: (reason: unknown) => void;
homeworkNeedsReload: boolean;
setHomeworkSaving: Dispatch<SetStateAction<boolean>>;
setRosterRevision: Dispatch<SetStateAction<number>>
};
export function createWorkspaceHomework({ snapshot, operation, sessionVersion, setBusy, setError, setHomeworkNeedsReload, ensureAccount, setSnapshot, setHomeworkSaved, failed, homeworkNeedsReload, setHomeworkSaving, setRosterRevision }: Options) {
  async function refreshHomework() {
    if (!snapshot || operation.current) return;
    const version = sessionVersion.current;
    const accountId = snapshot.account.id;
    const branch = snapshot.account.branch || '';
    operation.current = true; setBusy(true); setError(''); setHomeworkNeedsReload(true);
    try {
      const result = await omniRequest<{ account: { id: string; branch?: string }; newHomework: Section }>('homework-queue', { accountId });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account);
      if (result.account.branch !== undefined && result.account.branch !== branch) throw new ConnectionError('ACCOUNT_CHANGED', 'Филиал изменился. Обновите подключение.');
      if (result.newHomework.error) throw new Error(result.newHomework.error);
      setSnapshot(current => current?.account.id === accountId && (current.account.branch || '') === branch ? { ...current, newHomework: result.newHomework } : current);
      setHomeworkSaved({}); setHomeworkNeedsReload(false);
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function gradeHomework(items: HomeworkReviewItem[], mark: number, response?: HomeworkResponseDraft): Promise<{ confirmedKeys: string[] }> {
    if (!snapshot || operation.current || homeworkNeedsReload) throw new Error('Обновите список работ перед сохранением.');
    if (items.length > 100) throw new Error('За один раз можно оценить до 100 работ. Выберите меньше строк.');
    if (items.length > 1 && !window.confirm(`Поставить оценку ${mark} выбранным работам: ${items.length}?\nСтудентов: ${new Set(items.map(item => item.studentId)).size}. Работы вне выбора не изменятся.`)) throw new Error('Выставление оценок отменено.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setHomeworkSaving(true); setError('');
    try {
      const result = await omniRequest<{ account: { id: string }; confirmedKeys: string[]; error?: { code: string; message: string } }>('set-homework-marks', {
        accountId: snapshot.account.id, mark, ...(response ? { response } : {}),
        items: items.map(item => ({ key: item.key, previousMark: item.mark, submittedAt: item.submittedAt })),
      });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась. Обновите список работ.');
      ensureAccount(result.account);
      if (result.confirmedKeys.length) setHomeworkSaved(current => ({ ...current, ...Object.fromEntries(result.confirmedKeys.map(key => [key, { mark, ...(response ? { comment: response.comment } : {}) }])) }));
      if (result.error) {
        setHomeworkNeedsReload(true);
        const saved = result.confirmedKeys.length;
        const message = saved ? `${result.error.message} Подтверждено сохранение: ${saved} из ${items.length}. Состояние остальных работ не подтверждено, проверьте их в Omni.` : result.error.message;
        // The session itself is gone: reconnect instead of showing stale data. Marks which were
        // already confirmed stay recorded in homeworkSaved until the next reload.
        if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(result.error.code)) failed(new ConnectionError(result.error.code, message));
        else setError(message);
      }
      return { confirmedKeys: result.confirmedKeys };
    } catch (reason) {
      if (version === sessionVersion.current) { setHomeworkNeedsReload(true); failed(reason); }
      throw reason;
    } finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); setHomeworkSaving(false); setRosterRevision(value => value + 1); } }
  }

return { refreshHomework, gradeHomework };
}

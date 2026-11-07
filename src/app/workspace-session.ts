import type { Dispatch, RefObject, SetStateAction } from 'react';
import { attendanceDraftKey } from '../features/lesson/attendance';
import { type LessonDraft } from '../features/lesson/lesson-draft';
import { isExtension } from '../services/extension-client';
import { ConnectionError, label, omniRequest, record, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from '../services/omni-client';


type Options = {
week: number;
operation: RefObject<boolean>;
sessionVersion: RefObject<number>;
setBusy: Dispatch<SetStateAction<boolean>>;
setError: Dispatch<SetStateAction<string>>;
currentAccount: RefObject<string>;
lastBranch: RefObject<string>;
draft: LessonDraft;
presentData: RemoteRecord;
ensureAccount: (account: { id: string; }) => void;
draftKey: string;
setLessonDrafts: Dispatch<SetStateAction<Record<string, LessonDraft>>>;
setGroupStudents: Dispatch<SetStateAction<Section | null>>;
setGroupName: Dispatch<SetStateAction<string>>;
setGroupId: Dispatch<SetStateAction<string>>;
setDetail: Dispatch<SetStateAction<{ title: string; student: RemoteRecord; sections: Section[]; } | null>>;
reconcileDrafts: (account: string, branch: string, presents: RemoteRecord) => void;
setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
setChangingAccount: Dispatch<SetStateAction<boolean>>;
setLesson: Dispatch<SetStateAction<RemoteLesson | null>>;
setWeek: Dispatch<SetStateAction<number>>;
setAuthNeeded: Dispatch<SetStateAction<boolean>>;
setWaiting: Dispatch<SetStateAction<boolean>>;
setHomeworkSaved: Dispatch<SetStateAction<Record<string, { mark: number; comment?: string; }>>>;
setHomeworkNeedsReload: Dispatch<SetStateAction<boolean>>;
snapshot: Snapshot | null;
setConnectionState: Dispatch<SetStateAction<string>>;
failed: (reason: unknown) => void;
hasDrafts: boolean;
setNotice: Dispatch<SetStateAction<string>>;
setSwitchingTeacher: Dispatch<SetStateAction<boolean>>
};
export function createWorkspaceSession({ week, operation, sessionVersion, setBusy, setError, currentAccount, lastBranch, draft, presentData, ensureAccount, draftKey, setLessonDrafts, setGroupStudents, setGroupName, setGroupId, setDetail, reconcileDrafts, setSnapshot, setChangingAccount, setLesson, setWeek, setAuthNeeded, setWaiting, setHomeworkSaved, setHomeworkNeedsReload, snapshot, setConnectionState, failed, hasDrafts, setNotice, setSwitchingTeacher }: Options) {
  async function refresh(nextWeek = week) {
    if (operation.current || !Number.isInteger(nextWeek) || Math.abs(nextWeek) > 52) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<Snapshot>('snapshot', { week: nextWeek });
      if (version !== sessionVersion.current) return;
      const sameWorkspace = currentAccount.current === result.account.id && lastBranch.current === (result.account.branch || '');
      let selectedLesson: RemoteLesson | null = null;
      if (sameWorkspace && draft) {
        selectedLesson = await omniRequest<RemoteLesson>('lesson', { date: label(presentData.cur_date), group: label(presentData.cur_group), lenta: label(presentData.cur_lenta) });
        if (version !== sessionVersion.current) return;
        ensureAccount(selectedLesson.account);
        if (attendanceDraftKey(result.account.id, result.account.branch || '', record(selectedLesson.presents)) !== draftKey) throw new Error('Omni вернул другое занятие. Черновик и выбранный урок сохранены.');
      }
      if (!sameWorkspace) {
        setLessonDrafts({});
        setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null);
      }
      currentAccount.current = result.account.id; lastBranch.current = result.account.branch || '';
      reconcileDrafts(result.account.id, result.account.branch || '', record(selectedLesson?.presents ?? result.presents.data));
      setSnapshot(result); setChangingAccount(false); setLesson(selectedLesson); setWeek(nextWeek); setAuthNeeded(false); setWaiting(false);
      setHomeworkSaved({}); setHomeworkNeedsReload(false);
    } catch (reason) {
      if (version === sessionVersion.current) {
        if (isExtension() && !snapshot && reason instanceof ConnectionError && reason.code === 'BUSY') {
          setConnectionState('loading'); setWaiting(true);
        } else failed(reason);
      }
    }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function connect() {
    if (operation.current) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const state = await omniRequest<{ connected: boolean; state: string }>('connect');
      if (version !== sessionVersion.current) return;
      setConnectionState(state.state);
      if (!state.connected) setWaiting(true);
      else { operation.current = false; await refresh(); }
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function login(username: string, password: string) {
    if (operation.current) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError(''); setWaiting(false);
    try {
      await omniRequest('login', { username, password });
      if (version !== sessionVersion.current) return;
      operation.current = false;
      await refresh();
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { password = ''; if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function changeAccount() {
    if (operation.current || !window.confirm(`Выйти из текущего аккаунта Omni и войти в другой? Это изменит общую сессию Omni в этом профиле браузера.${hasDrafts ? ' Локальные черновики уроков будут удалены.' : ''}`)) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError(''); setWaiting(false); setChangingAccount(true);
    setLessonDrafts({});
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0);
    try {
      await omniRequest('switch-account');
      if (version !== sessionVersion.current) return;
      setConnectionState('login'); setAuthNeeded(true); setWaiting(true);
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function switchTeacher(teacherId: string) {
    if (!snapshot || operation.current || teacherId === snapshot.account.id) return;
    if (hasDrafts && !window.confirm('При смене преподавателя черновики уроков будут удалены. Продолжить?')) return;
    setLessonDrafts({});
    const version = sessionVersion.current;
    const accountId = snapshot.account.id;
    operation.current = true; setBusy(true); setSwitchingTeacher(true); setError('');
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0);
    try {
      const result = await omniRequest<{ account: { id: string } }>('switch-teacher', { teacherId, accountId });
      if (version !== sessionVersion.current) return;
      if (result.account.id !== teacherId) throw new ConnectionError('ACCOUNT_CHANGED', 'Omni не подтвердил выбранного преподавателя. Обновите подключение.');
      operation.current = false;
      await refresh(0);
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); setSwitchingTeacher(false); } }
  }

  function watchInitialStatus() {
    let cancelled = false;
    const version = sessionVersion.current;
    void omniRequest<{ connected: boolean; state?: string }>('status').then(state => {
      if (cancelled || version !== sessionVersion.current) return;
      if (state.connected) void refresh();
      else {
        setConnectionState(state.state || 'loading');
        setAuthNeeded(state.state === 'login');
        setWaiting(true);
      }
    }).catch(reason => {
      if (cancelled || version !== sessionVersion.current) return;
      if (isExtension() && reason instanceof ConnectionError && reason.code === 'BUSY') {
        setConnectionState('loading'); setWaiting(true);
      } else { setAuthNeeded(true); failed(reason); }
    });
    return () => { cancelled = true; };
  }

return { refresh, connect, login, changeAccount, switchTeacher, watchInitialStatus };
}

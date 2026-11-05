import { ConnectionError, label, omniRequest, record, type Account, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from '../services/omni-client';
import type { createRosterCache } from './roster-cache';
import type { WorkspaceTab } from './components/workspace-tabs';
type Detail = { title: string; student: RemoteRecord; sections: Section[] };
type NavigationOptions = { operation: { current: boolean }; sessionVersion: { current: number }; selectedDate: string; tab: WorkspaceTab; snapshot: Snapshot | null; rosterCache: ReturnType<typeof createRosterCache> | undefined; setBusy: (value: boolean) => void; setError: (value: string) => void; ensureAccount: (account: { id: string }) => void; reconcileDrafts: (account: string, branch: string, presents: RemoteRecord) => void; setLesson: (lesson: RemoteLesson) => void; setTab: (tab: WorkspaceTab) => void; failed: (reason: unknown) => void; setGroupStudents: (section: Section | null) => void; setGroupId: (id: string) => void; setGroupName: (name: string) => void; setDetail: (detail: Detail) => void };
export function createWorkspaceNavigation({ operation, sessionVersion, selectedDate, tab, snapshot, rosterCache, setBusy, setError, ensureAccount, reconcileDrafts, setLesson, setTab, failed, setGroupStudents, setGroupId, setGroupName, setDetail }: NavigationOptions) {
  async function loadLesson(group?: string, lenta?: string, date = selectedDate) {
    if (operation.current || !date) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<RemoteLesson>('lesson', {
        date, ...(group ? { group } : {}), ...(lenta !== undefined && lenta !== '' ? { lenta } : {}),
      });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account);
      const loaded = record(result.presents);
      if (loaded.cur_date !== date || group && String(loaded.cur_group) !== group || lenta !== undefined && lenta !== '' && String(loaded.cur_lenta) !== lenta) throw new Error('Omni вернул другое занятие. Выбранный урок не открыт — старые данные сохранены.');
      reconcileDrafts(snapshot?.account.id || result.account.id, snapshot?.account.branch || '', loaded);
      setLesson(result); if (tab === 'schedule' || date !== selectedDate) setTab('lesson');
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function openGroup(group: RemoteRecord, refresh = false) {
    const id = label(group.id_tgroups);
    if (!id || operation.current) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError(''); setGroupStudents(null);
    setGroupId(id); setGroupName(label(group.name_tgroups));
    try {
      const result = await rosterCache!.read(id, { priority: 'foreground' }, refresh);
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account); setGroupStudents({ data: result.students, error: null }); setGroupName(label(group.name_tgroups));
    } catch (reason) {
      if (version === sessionVersion.current) {
        setGroupStudents({ data: null, error: reason instanceof Error ? reason.message : 'Не удалось загрузить студентов.' });
        if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) failed(reason);
      }
    }
    finally { operation.current = false; setBusy(false); }
  }
  async function openStudent(student: RemoteRecord) {
    const id = label(student.id_stud);
    if (!id || operation.current) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<{ account: { id: string }; details: Section; attendance: Section }>('student', { stud: id });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account); setDetail({ title: label(student.fio_stud) || 'Студент', student, sections: [result.details, result.attendance] });
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  return { loadLesson, openGroup, openStudent };
}


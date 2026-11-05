import { useEffect, useMemo, useRef, useState } from 'react';
import { homeworkItems } from '../features/homework/homework';
import { attendanceDraftKey, attendanceHasTheme, attendanceLessonInfo, attendanceUnavailable } from '../features/lesson/attendance';
import { type LessonDraft } from '../features/lesson/lesson-draft';
import { presentLessons } from '../features/lesson/present-lessons';
import { scheduleDays } from '../features/schedule/schedule';
import { readConnectionInterval } from '../features/settings/WorkspaceSettings';
import { isExtension, onExtensionSessionChange } from '../services/extension-client';
import { bufferRequest, type BufferedLessonDraft } from '../services/lesson-draft-buffer';
import { ConnectionError, invalidatePendingOmniRequests, label, omniRequest, record, rows, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from '../services/omni-client';
import { workspaceTabs, type WorkspaceTab } from './components/workspace-tabs';
import { createRosterCache } from './roster-cache';
import { useLessonEstimates } from './useLessonEstimates';
import { useStudentAverages } from './useStudentAverages';
import type { WorkspaceConnectionProps } from './Workspace';
import { createWorkspaceHomework } from './workspace-homework';
import { createWorkspaceLessonDraft } from './workspace-lesson-draft';
import { createWorkspaceNavigation } from './workspace-navigation';
import { createWorkspaceSession } from './workspace-session';

const emptySection: Section = { data: null, error: null };

export function useWorkspaceController({ connectionForm, connectionPending = false, onNativeLogin }: WorkspaceConnectionProps) {
  const [connectionInterval, setConnectionInterval] = useState(readConnectionInterval);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lesson, setLesson] = useState<RemoteLesson | null>(null);
  const [materialsView, setMaterialsView] = useState<{ context: string; theme?: RemoteRecord } | null>(null);
  const [materialLesson, setMaterialLesson] = useState<{ context: string; lesson: RemoteLesson } | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>(() => {
    try { const saved = localStorage.getItem('omni.workspace.tab'); return saved === 'ui-tests' ? saved : workspaceTabs.find(item => item.key === saved)?.key || 'lesson'; } catch { return 'lesson'; }
  });
  useEffect(() => { try { localStorage.setItem('omni.workspace.tab', tab); } catch { /* Storage may be unavailable. */ } }, [tab]);
  const [workspaceBusy, setBusy] = useState(false);
  const [incomeBusy, setIncomeBusy] = useState(false);
  const workspaceLoading = workspaceBusy || incomeBusy;
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [connectionState, setConnectionState] = useState('');
  const [week, setWeek] = useState(0);
  const [groupStudents, setGroupStudents] = useState<Section | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [detail, setDetail] = useState<{ title: string; student: RemoteRecord; sections: Section[] } | null>(null);
  const [notice, setNotice] = useState('');
  const [switchingTeacher, setSwitchingTeacher] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const [homeworkSaved, setHomeworkSaved] = useState<Record<string, { mark: number; comment?: string }>>({});
  const [homeworkNeedsReload, setHomeworkNeedsReload] = useState(false);
  const [homeworkSaving, setHomeworkSaving] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [bufferedDrafts, setBufferedDrafts] = useState<BufferedLessonDraft[]>([]);
  const attemptedBuffers = useRef(new Set<string>());
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>({});
  const [rosterRevision, setRosterRevision] = useState(0);
  const operation = useRef(false);
  const currentAccount = useRef('');
  const lastBranch = useRef('');
  const sessionVersion = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const presentData = record(lesson?.presents ?? snapshot?.presents.data);
  const draftKey = attendanceDraftKey(snapshot?.account.id || '', snapshot?.account.branch || '', presentData);
  const draft = lessonDrafts[draftKey];
  useEffect(() => { setMaterialsView(null); setMaterialLesson(null); }, [draftKey, snapshot]);
  const hasDrafts = Object.keys(lessonDrafts).length > 0;
  useEffect(() => {
    if (!isExtension()) return;
    let cancelled = false;
    const version = sessionVersion.current;
    void bufferRequest({ op: 'list' }).then(entries => {
      if (!cancelled && version === sessionVersion.current) setBufferedDrafts(entries);
    }).catch(() => { if (!cancelled) setError('Не удалось прочитать локальный буфер черновиков.'); });
    return () => { cancelled = true; };
  }, [snapshot?.account.id, snapshot?.account.branch]);
  useEffect(() => {
    if (!snapshot) return;
    const entries = bufferedDrafts.filter(entry => {
      const context = JSON.parse(entry.key) as string[];
      return context[0] === snapshot.account.id && context[1] === (snapshot.account.branch || '');
    });
    if (!entries.length) return;
    setLessonDrafts(current => {
      const restored = { ...current };
      for (const entry of entries) if (!restored[entry.key]) restored[entry.key] = { ...entry.draft, needsReload: entry.state !== 'ready' };
      return restored;
    });
  }, [bufferedDrafts, snapshot?.account.id, snapshot?.account.branch]);

  const hasTheme = attendanceHasTheme(presentData);
  const currentTheme = label(attendanceLessonInfo(presentData)?.theme).trim() || (presentData.scheduleType === 'event' ? label(record(presentData.scheduleData).theme).trim() : '');
  const lessonStudents = rows(presentData.students);
  const dayLessons = presentLessons(presentData.schedule);
  const groups = rows(snapshot?.groups.data);
  const teachers = rows(snapshot?.teachers?.data);
  const rosterCache = useMemo(() => snapshot ? createRosterCache(snapshot.account) : undefined,
    [snapshot?.account.id, snapshot?.account.branch, snapshot?.groups, rosterRevision, sessionVersion.current]);
  const dossierRefreshKey = useMemo(() => ({ groups: snapshot?.groups, mutation: rosterRevision }), [snapshot?.groups, rosterRevision]);
  const queueGroups = new Set(homeworkItems(snapshot?.newHomework.data).map(item => item.groupName));
  const knownGroupNames = new Set(groups.map(group => label(group.name_tgroups)));
  const rosterGroups = [...queueGroups].some(name => !name || !knownGroupNames.has(name)) ? groups : groups.filter(group => queueGroups.has(label(group.name_tgroups)));
  const averageGroupIds = tab === 'lesson' ? [label(presentData.cur_group)].filter(id => /^[1-9]\d{0,11}$/.test(id)) : tab === 'homework' ? rosterGroups.map(group => label(group.id_tgroups)).filter(id => /^[1-9]\d{0,11}$/.test(id)) : [];
  const averages = useStudentAverages(snapshot, [...new Set(averageGroupIds)].sort(), !workspaceLoading, rosterCache);
  const studentAverages = averages.values;
  const busy = workspaceLoading;
  useEffect(() => {
    if (!isExtension() || !snapshot || busy || operation.current) return;
    const entry = bufferedDrafts.find(item => {
      const context = JSON.parse(item.key) as string[];
      return item.state === 'ready' && context[0] === snapshot.account.id && context[1] === (snapshot.account.branch || '')
        && !attemptedBuffers.current.has(`${sessionVersion.current}:${item.key}`);
    });
    if (entry) void saveLessonDraft(true, entry);
  }, [bufferedDrafts, snapshot, busy]);

  const incomeGeneration = sessionVersion.current;
  const selectedDate = label(presentData.cur_date || presentData.today);
  const schedule = record(snapshot?.schedule.data);
  const estimates = useLessonEstimates(snapshot?.account.id || '', snapshot?.account.branch || '', tab, schedule, presentData);
  const scheduleDates = scheduleDays(schedule).map(day => day.date);
  const reviewItems = useMemo(() => homeworkItems(snapshot?.newHomework.data).map(item =>
    Object.hasOwn(homeworkSaved, item.key) ? { ...item, mark: homeworkSaved[item.key].mark, source: { ...item.source, ...(homeworkSaved[item.key].comment !== undefined ? { comment: homeworkSaved[item.key].comment } : {}) }, canGrade: false } : item), [snapshot?.newHomework.data, homeworkSaved]);
  const scheduleRange = scheduleDates.length ? `${scheduleDates[0].split("-").reverse().join(".")} — ${scheduleDates[scheduleDates.length - 1].split("-").reverse().join(".")}` : "";
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: snapshot?.account.timezone || 'Europe/Moscow' }).format(new Date());
  function weekForDate(value: string) {
    const chosen = new Date(`${value}T12:00:00Z`); const now = new Date(`${today}T12:00:00Z`);
    const monday = (date: Date) => { const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date; };
    return Math.round((monday(chosen).getTime() - monday(now).getTime()) / 604800000);
  }

  function invalidateWorkspaceSession() {
    // New generations own their UI lock; the request queue still serializes transport.
    sessionVersion.current++;
    invalidatePendingOmniRequests();
    operation.current = false;
    setBusy(false); setIncomeBusy(false); setAttendanceSaving(false); setHomeworkSaving(false);
    setSwitchingTeacher(false); setChangingAccount(false);
    setHomeworkSaved({}); setHomeworkNeedsReload(false); setLessonDrafts({});
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0);
    setAuthNeeded(true);
  }
  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные.');
    if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) invalidateWorkspaceSession();
  }
  function ensureAccount(account: { id: string }) {
    if (currentAccount.current && currentAccount.current !== account.id) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт сменился. Обновите подключение.');
  }
  async function loadCurrentMaterials() {
    if (!snapshot || operation.current) return;
    const context = draftKey;
    const version = sessionVersion.current;
    const accountId = snapshot.account.id;
    const branch = snapshot.account.branch || '';
    operation.current = true; setBusy(true);
    try {
      const result = await omniRequest<RemoteLesson>('lesson', { date: selectedDate, group: label(presentData.cur_group), lenta: label(presentData.cur_lenta) });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account);
      if (result.account.branch !== undefined && result.account.branch !== branch || attendanceDraftKey(accountId, branch, record(result.presents)) !== context) throw new Error('Omni вернул материалы другого занятия. Обновите урок.');
      setMaterialLesson({ context, lesson: result });
    } catch (reason) { if (version === sessionVersion.current) { failed(reason); throw reason; } }
    finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  const attendanceReason = draft?.needsReload ? 'Перед следующей правкой загрузите урок заново.' : attendanceUnavailable(presentData);
  const { storeDraft, reconcileDrafts, stageMark, stageBulk, stageFill, stageRewardAllocation, stageReward, loadPreviousLesson, stagePreviousLesson, loadLessonThemes, stageTheme, markAttendance, clearLessonDraft, saveLessonDraft } = createWorkspaceLessonDraft({ week, setLessonDrafts, snapshot, operation, attendanceReason, lessonStudents, draftKey, averages, draft, studentAverages, setNotice, presentData, selectedDate, sessionVersion, setBusy, setError, failed, ensureAccount, bufferedDrafts, setBufferedDrafts, hasTheme, attemptedBuffers, setAttendanceSaving, setSnapshot, setLesson, setGroupStudents, setGroupId, setGroupName, setDetail, setRosterRevision });
  const { refresh, connect, login, changeAccount, switchTeacher, watchInitialStatus } = createWorkspaceSession({ week, operation, sessionVersion, setBusy, setError, currentAccount, lastBranch, draft, presentData, ensureAccount, draftKey, setLessonDrafts, setGroupStudents, setGroupName, setGroupId, setDetail, reconcileDrafts, setSnapshot, setChangingAccount, setLesson, setWeek, setAuthNeeded, setWaiting, setHomeworkSaved, setHomeworkNeedsReload, snapshot, setConnectionState, failed, hasDrafts, setNotice, setSwitchingTeacher });
  useEffect(() => {
    return onExtensionSessionChange(() => {
      invalidateWorkspaceSession();
      setError(''); setWaiting(true); setConnectionState('loading');
    });
  }, []);
  useEffect(watchInitialStatus, []);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (operation.current) return;
      const version = sessionVersion.current;
      void omniRequest<{ connected: boolean; state: string }>('status').then(state => {
        if (version !== sessionVersion.current) return;
        setConnectionState(state.state);
        if (state.connected) { setWaiting(false); void refresh(); }
      }).catch(() => {});
    }, connectionInterval * 1000);
    return () => clearInterval(timer);
  }, [waiting, connectionInterval]);
  useEffect(() => { if (detail) dialog.current?.showModal(); }, [detail]);
  useEffect(() => {
    if (!attendanceSaving && !homeworkSaving && !hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attendanceSaving, homeworkSaving, hasDrafts]);

  const { loadLesson, openGroup, openStudent } = createWorkspaceNavigation({ operation, sessionVersion, selectedDate, tab, snapshot, rosterCache, setBusy, setError, ensureAccount, reconcileDrafts, setLesson, setTab, failed, setGroupStudents, setGroupId, setGroupName, setDetail });
  function exportSnapshot() {
    if (!snapshot) return;
    const data = { source: 'omni', snapshot, lesson, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `omni-${selectedDate || 'snapshot'}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Снимок реальных данных экспортирован в файл.');
  }
  const { refreshHomework, gradeHomework } = createWorkspaceHomework({ snapshot, operation, sessionVersion, setBusy, setError, setHomeworkNeedsReload, ensureAccount, setSnapshot, setHomeworkSaved, failed, homeworkNeedsReload, setHomeworkSaving, setRosterRevision });
  const lessonTableContext = useMemo(() => ({ draftKey, students: presentData.students }), [draftKey, presentData.students]);

  const startup = isExtension() && !snapshot && !connectionForm && !changingAccount && (connectionPending || (!authNeeded && !waiting));
  const onIncomeLoading = (loading: boolean) => { if (snapshot && currentAccount.current === snapshot.account.id && lastBranch.current === (snapshot.account.branch || '') && sessionVersion.current === incomeGeneration) setIncomeBusy(loading); };
  return {
    session: { snapshot, teachers, busy, authNeeded, refresh, switchTeacher, changeAccount, connect, startup, error, setError, switchingTeacher, connectionInterval, setConnectionInterval, onNativeLogin, connectionForm, waiting, changingAccount, connectionState, login, sessionVersion, workspaceBusy },
    homework: { reviewItems, refreshHomework, homeworkNeedsReload, gradeHomework },
    lesson: { materialsView, draftKey, materialLesson, lesson, setMaterialsView, loadCurrentMaterials, attendanceSaving, draft, hasTheme, presentData, attendanceReason, bufferedDrafts, saveLessonDraft, clearLessonDraft, selectedDate, lessonStudents, currentTheme, estimates, loadLessonThemes, stageTheme, dayLessons, loadLesson, loadPreviousLesson, stagePreviousLesson, lessonTableContext, stageBulk, stageFill, stageRewardAllocation, stageMark, stageReward, markAttendance },
    page: { tab, setTab, failed, detail, dialog, setDetail, notice, setNotice, exportSnapshot, today, scheduleDates, scheduleRange, week, weekForDate, schedule, groupId, groups, groupName, groupStudents, openGroup, openStudent, studentAverages, averages, dossierRefreshKey, onIncomeLoading },
  };
}

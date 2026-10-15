import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ConnectionError, label, omniRequest, record, rows, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from '../services/omni-client';
import { ScheduleView } from '../features/schedule/ScheduleView';
import { TeachingMaterials } from '../features/materials/TeachingMaterials';
import { TeacherDossier } from '../features/dossier/TeacherDossier';
import { isDesktop } from '../services/desktop-client';
import { isExtension, onExtensionSessionChange } from '../services/extension-client';
import { StudentTable } from '../features/lesson/StudentTable';
import { homeworkItems, type HomeworkReviewItem } from '../features/homework/homework';
import { LessonThemeEditor, type ThemeChoice, type ThemeData } from '../features/lesson/LessonThemeEditor';
import { scheduleDays } from '../features/schedule/schedule';
import { presentLessons } from '../features/lesson/present-lessons';
import { PreviousLessonCopy } from '../features/lesson/PreviousLessonCopy';
import { copyLessonDraft, type CopySelection, type CopySource, type PreviousLessonData } from '../features/lesson/lesson-copy';
import { lessonRewardBudget, lessonRewardDraftAllowed, rewardLevel, rewardMaximum, rewardValue, type LessonReward } from '../features/lesson/lesson-reward';
import { attendanceStatus, attendanceVisit, attendanceUnavailable, attendanceHasTheme, attendanceLessonInfo, attendanceDraftKey, type AttendanceChange, type AttendanceStatus } from '../features/lesson/attendance';
import { emptyLessonDraft, hasLessonChanges, lessonDraftConflict, markValue, reconcileLessonDraft, stageAttendanceChange, stageMarkChange, stageRewardChange, type LessonDraft } from '../features/lesson/lesson-draft';
import { SectionView } from '../components/data/RemoteData';
import { ConnectionCard } from './components/ConnectionCard';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceMobileNav, WorkspacePageHeading } from './components/WorkspacePageHeading';
import { ScheduleToolbar } from './components/ScheduleToolbar';
import { LessonBanner, LessonSaveBar, LessonSelectors } from './components/LessonOverview';
import { LessonStudentsPanel } from './components/LessonStudentsPanel';
import { GroupStudentsPanel } from './components/GroupStudentsPanel';
import { HomeworkPanel } from './components/HomeworkPanel';
import { IssuedMaterialsPanel } from './components/IssuedMaterialsPanel';
import { StudentDetailDialog, TeacherSwitchingState, WorkspaceError, WorkspaceLoading, WorkspaceToast } from './components/WorkspaceFeedback';
import { WorkspaceQuickActions } from './components/WorkspaceQuickActions';
import type { WorkspaceTab } from './components/workspace-tabs';
import './live.css';
import './workspace.css';
import { HelpPage } from '../features/help/HelpPage';

const emptySection: Section = { data: null, error: null };

export function LiveWorkspace({ onDemo }: { onDemo: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lesson, setLesson] = useState<RemoteLesson | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>('lesson');
  const [workspaceBusy, setBusy] = useState(false);
  const [incomeBusy, setIncomeBusy] = useState(false);
  const busy = workspaceBusy || incomeBusy;
  const [error, setError] = useState('');
  const [authNeeded, setAuthNeeded] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [connectionState, setConnectionState] = useState('');
  const [week, setWeek] = useState(0);
  const [groupStudents, setGroupStudents] = useState<Section | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [detail, setDetail] = useState<{ title: string; sections: Section[] } | null>(null);
  const [notice, setNotice] = useState('');
  const [switchingTeacher, setSwitchingTeacher] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const [homeworkSaved, setHomeworkSaved] = useState<Record<string, number>>({});
  const [homeworkNeedsReload, setHomeworkNeedsReload] = useState(false);
  const [homeworkSaving, setHomeworkSaving] = useState(false);
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [lessonDrafts, setLessonDrafts] = useState<Record<string, LessonDraft>>({});
  const operation = useRef(false);
  const currentAccount = useRef('');
  const lastBranch = useRef('');
  const sessionVersion = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const presentData = record(lesson?.presents ?? snapshot?.presents.data);
  const draftKey = attendanceDraftKey(snapshot?.account.id || '', snapshot?.account.branch || '', presentData);
  const draft = lessonDrafts[draftKey];
  const hasDrafts = Object.keys(lessonDrafts).length > 0;
  const hasTheme = attendanceHasTheme(presentData);
  const currentTheme = label(attendanceLessonInfo(presentData)?.theme).trim() || (presentData.scheduleType === 'event' ? label(record(presentData.scheduleData).theme).trim() : '');
  const lessonStudents = rows(presentData.students);
  const dayLessons = presentLessons(presentData.schedule);
  const groups = rows(snapshot?.groups.data);
  const teachers = rows(snapshot?.teachers?.data);
  const selectedDate = label(presentData.cur_date || presentData.today);
  const schedule = record(snapshot?.schedule.data);
  const scheduleDates = scheduleDays(schedule).map(day => day.date);
  const reviewItems = useMemo(() => homeworkItems(snapshot?.newHomework.data).map(item =>
    Object.hasOwn(homeworkSaved, item.key) ? { ...item, mark: homeworkSaved[item.key], canGrade: false } : item), [snapshot?.newHomework.data, homeworkSaved]);
  const scheduleRange = scheduleDates.length ? `${scheduleDates[0].split("-").reverse().join(".")} — ${scheduleDates[scheduleDates.length - 1].split("-").reverse().join(".")}` : "";
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: snapshot?.account.timezone || 'Europe/Moscow' }).format(new Date());
  function weekForDate(value: string) {
    const chosen = new Date(`${value}T12:00:00Z`); const now = new Date(`${today}T12:00:00Z`);
    const monday = (date: Date) => { const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date; };
    return Math.round((monday(chosen).getTime() - monday(now).getTime()) / 604800000);
  }

  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные.');
    if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) {
      setLessonDrafts({});
      setAuthNeeded(true); setSnapshot(null); setLesson(null); setGroupStudents(null); setDetail(null);
      currentAccount.current = ''; lastBranch.current = '';
    }
  }
  function ensureAccount(account: { id: string }) {
    if (currentAccount.current && currentAccount.current !== account.id) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт сменился. Обновите подключение.');
  }
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
    finally { operation.current = false; setBusy(false); }
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
    finally { operation.current = false; setBusy(false); }
  }
  async function login(username: string, password: string) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(''); setWaiting(false);
    try {
      await omniRequest('login', { username, password });
      operation.current = false;
      await refresh();
    } catch (reason) { failed(reason); }
    finally { password = ''; operation.current = false; setBusy(false); }
  }
  async function changeAccount() {
    if (operation.current || !window.confirm(`Выйти из текущего аккаунта Omni и войти в другой? Это изменит общую сессию Omni в этом профиле браузера.${hasDrafts ? ' Локальные черновики уроков будут удалены.' : ''}`)) return;
    operation.current = true; setBusy(true); setError(''); setWaiting(false); setChangingAccount(true);
    setLessonDrafts({});
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0); setTab('lesson');
    try {
      await omniRequest('switch-account');
      setConnectionState('login'); setAuthNeeded(true); setWaiting(true);
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function switchTeacher(teacherId: string) {
    if (!snapshot || operation.current || teacherId === snapshot.account.id) return;
    if (hasDrafts && !window.confirm('При смене преподавателя черновики уроков будут удалены. Продолжить?')) return;
    setLessonDrafts({});
    const accountId = snapshot.account.id;
    operation.current = true; setBusy(true); setSwitchingTeacher(true); setError('');
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0); setTab('lesson');
    try {
      const result = await omniRequest<{ account: { id: string } }>('switch-teacher', { teacherId, accountId });
      if (result.account.id !== teacherId) throw new ConnectionError('ACCOUNT_CHANGED', 'Omni не подтвердил выбранного преподавателя. Обновите подключение.');
      operation.current = false;
      await refresh(0);
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); setSwitchingTeacher(false); }
  }
  useEffect(() => {
    return onExtensionSessionChange(() => {
      setHomeworkSaved({}); setHomeworkNeedsReload(false);
      setLessonDrafts({});
      sessionVersion.current++;
      setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null); setNotice('');
      currentAccount.current = ''; lastBranch.current = ''; setWeek(0); setTab('lesson');
      setError(''); setAuthNeeded(true); setWaiting(true); setConnectionState('loading');
    });
  }, []);
  useEffect(() => {
    let cancelled = false;
    const version = sessionVersion.current;
    void omniRequest<{ connected: boolean }>('status').then(state => {
      if (!cancelled && version === sessionVersion.current && state.connected) void refresh();
    }).catch(reason => {
      if (!cancelled && version === sessionVersion.current && isExtension() && reason instanceof ConnectionError && reason.code === 'BUSY') {
        setConnectionState('loading'); setWaiting(true);
      }
    });
    return () => { cancelled = true; };
  }, []);
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
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting]);
  useEffect(() => { if (detail) dialog.current?.showModal(); }, [detail]);
  useEffect(() => {
    if (!attendanceSaving && !homeworkSaving && !hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attendanceSaving, homeworkSaving, hasDrafts]);

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
  async function openGroup(group: RemoteRecord) {
    const id = label(group.id_tgroups);
    if (!id || operation.current) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError(''); setGroupStudents(null);
    setGroupId(id); setGroupName(label(group.name_tgroups));
    try {
      const result = await omniRequest<{ account: { id: string }; students: unknown }>('group', { group: id });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account); setGroupStudents({ data: result.students, error: null }); setGroupName(label(group.name_tgroups));
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
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
      ensureAccount(result.account); setDetail({ title: label(student.fio_stud) || 'Ученик', sections: [result.details, result.attendance] });
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  function exportSnapshot() {
    if (!snapshot) return;
    const data = { source: 'omni', snapshot, lesson, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `omni-${selectedDate || 'snapshot'}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Снимок реальных данных экспортирован в файл.');
  }
  const attendanceReason = draft?.needsReload ? 'Перед следующей правкой загрузите урок заново.' : attendanceUnavailable(presentData);
  async function gradeHomework(items: HomeworkReviewItem[], mark: number): Promise<{ confirmedKeys: string[] }> {
    if (!snapshot || operation.current || homeworkNeedsReload) throw new Error('Обновите список работ перед сохранением.');
    if (items.length > 100) throw new Error('За один раз можно оценить до 100 работ. Выберите меньше строк.');
    if (items.length > 1 && !window.confirm(`Поставить оценку ${mark} выбранным работам: ${items.length}?\nСтудентов: ${new Set(items.map(item => item.studentId)).size}. Работы вне выбора не изменятся.`)) throw new Error('Выставление оценок отменено.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setHomeworkSaving(true); setError('');
    try {
      const result = await omniRequest<{ account: { id: string }; confirmedKeys: string[]; error?: { code: string; message: string } }>('set-homework-marks', {
        accountId: snapshot.account.id, mark,
        items: items.map(item => ({ key: item.key, previousMark: item.mark, submittedAt: item.submittedAt })),
      });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась. Обновите список работ.');
      ensureAccount(result.account);
      setHomeworkSaved(current => ({ ...current, ...Object.fromEntries(result.confirmedKeys.map(key => [key, mark])) }));
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
    } finally { operation.current = false; setBusy(false); setHomeworkSaving(false); }
  }
  function storeDraft(key: string, next: LessonDraft) {
    setLessonDrafts(current => {
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[key] = { ...next, attendance: { ...next.attendance }, marks: { ...next.marks }, rewards: { ...next.rewards } };
      else delete updated[key];
      return updated;
    });
  }
  function reconcileDrafts(account: string, branch: string, presents: RemoteRecord) {
    const key = attendanceDraftKey(account, branch, presents);
    setLessonDrafts(current => {
      if (!current[key]) return current;
      const next = reconcileLessonDraft(current[key], presents);
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[key] = next;
      else delete updated[key];
      return updated;
    });
  }
  function stageMark(student: RemoteRecord, type: 2 | 4, mark: number) {
    if (!snapshot || operation.current || attendanceReason) return;
    const stud = label(student.id_stud);
    const base = lessonStudents.find(item => label(item.id_stud) === stud);
    if (!base) return;
    setLessonDrafts(current => {
      const next = stageMarkChange(current[draftKey] || emptyLessonDraft(), base, type, mark);
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(updated[draftKey])) delete updated[draftKey];
      return updated;
    });
  }
  function stageReward(student: RemoteRecord, reward: LessonReward) {
    if (!snapshot || operation.current || attendanceReason) return;
    const matches = lessonStudents.filter(item => label(item.id_stud) === label(student.id_stud));
    if (matches.length !== 1) return;
    setLessonDrafts(current => {
      const currentDraft = current[draftKey] || emptyLessonDraft();
      const stud = label(student.id_stud);
      const was = currentDraft.attendance[stud]?.was ?? attendanceStatus(matches[0].was);
      if ((was !== 1 && was !== 2) || rewardLevel(matches[0].prize) === null) return current;
      const budget = lessonRewardBudget(lessonStudents, currentDraft.rewards);
      const value = currentDraft.rewards?.[stud]?.reward ?? matches[0].prize;
      const requested = rewardLevel(reward);
      if (requested === null || requested > rewardMaximum(value, budget.remaining)) return current;
      const next = stageRewardChange(currentDraft, matches[0], reward);
      if (!lessonRewardDraftAllowed(lessonStudents, next.rewards)) return current;
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(next)) delete updated[draftKey];
      return updated;
    });
  }
  async function loadPreviousLesson(source: CopySource): Promise<PreviousLessonData> {
    if (!snapshot || operation.current || attendanceReason) throw new Error('Дождитесь завершения операции и загрузите текущий урок.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.date) || source.date > selectedDate || source.date === selectedDate && (source.slot === undefined || Number(source.slot) >= Number(presentData.cur_lenta))) throw new Error('Выберите пару, которая была раньше текущего урока.');
    const version = sessionVersion.current;
    const accountId = snapshot.account.id;
    const group = label(presentData.cur_group);
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<RemoteLesson>('lesson', { date: source.date, group, ...(source.slot !== undefined ? { lenta: source.slot } : {}) });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась. Загрузите текущий урок заново.');
      if (result.account.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Загрузите текущий урок заново.');
      const presents = record(result.presents);
      const loadedSlot = label(presents.cur_lenta);
      if (presents.cur_date !== source.date || label(presents.cur_group) !== group || !/^\d{1,12}$/.test(loadedSlot) || source.slot !== undefined && loadedSlot !== source.slot || source.date === selectedDate && Number(loadedSlot) >= Number(presentData.cur_lenta)) throw new Error('Omni не подтвердил выбранную прошлую пару для этой группы.');
      const slots = presentLessons(presents.schedule);
      const selected = slots.find(item => item.slot === loadedSlot);
      return { students: rows(presents.students), date: source.date, slot: loadedSlot, dayLessons: slots, description: `${source.date.split('-').reverse().join('.')} · ${selected?.title || `Пара · ${loadedSlot}`}${selected?.time ? ` · ${selected.time}` : ''}` };
    } catch (reason) {
      if (version === sessionVersion.current && reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) failed(reason);
      throw reason;
    } finally { operation.current = false; setBusy(false); }
  }
  function stagePreviousLesson(source: PreviousLessonData, selection: CopySelection) {
    if (!snapshot || operation.current || attendanceReason) return;
    if (source.date > selectedDate || source.date === selectedDate && Number(source.slot) >= Number(presentData.cur_lenta)) return;
    if (selection.overwrite && !window.confirm('Заменить заполненные отметки, оценки и топкойны этого урока выбранными значениями с прошлой пары? Изменения останутся в черновике до нажатия «Сохранить».')) return;
    setLessonDrafts(current => {
      const next = copyLessonDraft(current[draftKey] || emptyLessonDraft(), lessonStudents, source.students, selection);
      if (!lessonRewardDraftAllowed(lessonStudents, next.rewards)) {
        setNotice('Перенос отменён: на урок можно выдать не больше 5 топкойнов. Уменьшите награды или отключите их перенос. Черновик не изменён.');
        return current;
      }
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[draftKey] = next;
      else delete updated[draftKey];
      setNotice('Выбранные значения прошлой пары перенесены в черновик. Нажмите «Сохранить» для отправки в Omni.');
      return updated;
    });
  }
  async function loadLessonThemes(): Promise<ThemeData> {
    if (!snapshot || operation.current) throw new Error('Дождитесь завершения операции.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<ThemeData & { account: { id: string } }>('lesson-themes', {
        accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group),
        lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule),
      });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      ensureAccount(result.account);
      return result;
    } catch (reason) {
      if (version === sessionVersion.current) failed(reason);
      throw reason;
    } finally { operation.current = false; setBusy(false); }
  }
  async function stageTheme(choice: ThemeChoice) {
    if (operation.current || attendanceReason) throw new Error('Перечитайте урок перед изменением темы.');
    setLessonDrafts(current => {
      const next = current[draftKey] || emptyLessonDraft();
      return { ...current, [draftKey]: { ...next, theme: { ...choice, previousTheme: next.theme ? next.theme.previousTheme : choice.previousTheme } } };
    });
    setNotice('Тема добавлена в черновик. Нажмите «Сохранить» в разделе «Мой урок».');
  }
  function markAttendance(items: RemoteRecord[], was: AttendanceStatus, all = false) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) return;
    if (all && !window.confirm(`Отметить присутствующими всю группу (${items.length} учеников), включая скрытых поиском? Отметки останутся в черновике до нажатия «Сохранить».`)) return;
    setLessonDrafts(current => {
      let next = current[draftKey] || emptyLessonDraft();
      for (const student of items) {
        const stud = label(student.id_stud);
        const base = lessonStudents.find(item => label(item.id_stud) === stud);
        if (!base) continue;
        next = stageAttendanceChange(next, base, was);
      }
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(updated[draftKey])) delete updated[draftKey];
      return updated;
    });
  }
  function clearLessonDraft() {
    setLessonDrafts(current => { const next = { ...current }; delete next[draftKey]; return next; });
  }
  async function saveLessonDraft() {
    if (!snapshot || !draft || operation.current || attendanceReason) return;
    if (!lessonRewardDraftAllowed(lessonStudents, draft.rewards)) { setError('Нельзя увеличить награды: лимит урока — 5 топкойнов. Уменьшите топкойны в черновике или загрузите полный список учеников.'); return; }
    if (!hasTheme && !draft.theme) { setError('Добавьте тему урока в черновик перед сохранением.'); return; }
    if (draft.theme && !window.confirm('Сохранить тему и все изменения урока в Omni? Выбранные параметры выдачи ДЗ и практической работы будут применены.')) return;
    const version = sessionVersion.current;
    const key = draftKey;
    const params = { accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group), lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule) };
    let pending: LessonDraft = { ...draft, attendance: { ...draft.attendance }, marks: { ...draft.marks }, rewards: { ...draft.rewards } };
    operation.current = true; setBusy(true); setAttendanceSaving(true); setError(''); setNotice('');
    function accept(result: { account: { id: string }; presents: unknown }, themeChanged = false) {
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      ensureAccount(result.account);
      const presents = record(result.presents);
      if (attendanceDraftKey(params.accountId, snapshot!.account.branch || '', presents) !== key) throw new Error('Omni вернул другое занятие. Перечитайте урок.');
      setSnapshot(current => current ? { ...current, presents: { data: presents, error: null } } : null);
      setLesson(current => current ? { ...current, presents, ...(themeChanged ? { materials: emptySection, homework: emptySection } : {}) } : null);
      return presents;
    }
    try {
      let fresh = accept(await omniRequest<RemoteLesson>('lesson', { date: params.date, group: params.group, lenta: params.lenta }));
      const conflict = lessonDraftConflict(pending, fresh);
      if (conflict) throw new Error(conflict);
      if (!lessonRewardDraftAllowed(rows(fresh.students), pending.rewards)) throw new Error('Общее количество топкойнов изменилось в Omni. Лимит урока — 5. Перечитайте урок и уменьшите награды.');
      if (pending.theme) {
        const result = await omniRequest<{ account: { id: string }; presents: unknown; warning?: string }>('set-lesson-theme', { ...params, ...pending.theme });
        fresh = accept(result, true);
        delete pending.theme;
        // Our confirmed theme save may create visits or reset attendance. Only
        // this successful operation authorizes rebasing the remaining draft.
        const students = rows(fresh.students);
        for (const [stud, change] of Object.entries(pending.attendance)) {
          const matches = students.filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1) { storeDraft(key, pending); throw new Error('После сохранения темы изменился список учеников. Перечитайте урок.'); }
          pending.attendance[stud] = { ...change, previousWas: attendanceStatus(matches[0].was), visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [markKey, change] of Object.entries(pending.marks)) {
          const matches = students.filter(student => label(student.id_stud) === change.stud);
          if (matches.length !== 1 || markValue(matches[0][`mark${change.type}`]) !== change.previousMark) { storeDraft(key, pending); throw new Error('После сохранения темы изменилась оценка ученика. Перечитайте урок.'); }
          pending.marks[markKey] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [stud, change] of Object.entries(pending.rewards || {})) {
          const matches = students.filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1 || rewardValue(matches[0].prize) !== change.previousReward) { storeDraft(key, pending); throw new Error('После сохранения темы изменились топкойны ученика. Перечитайте урок.'); }
          pending.rewards![stud] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        storeDraft(key, pending);
        if (result.warning) { setError(result.warning); }
      }
      const changes: AttendanceChange[] = Object.values(pending.attendance);
      if (changes.length) {
        fresh = accept(await omniRequest<{ account: { id: string }; presents: unknown }>('set-attendance', { ...params, changes }));
        pending.attendance = {};
        for (const [markKey, change] of Object.entries(pending.marks)) {
          if (!changes.some(attendance => attendance.stud === change.stud)) continue;
          const matches = rows(fresh.students).filter(student => label(student.id_stud) === change.stud);
          if (matches.length !== 1 || markValue(matches[0][`mark${change.type}`]) !== change.previousMark) { storeDraft(key, pending); throw new Error('После сохранения посещаемости изменилась оценка ученика. Перечитайте урок.'); }
          pending.marks[markKey] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [stud, change] of Object.entries(pending.rewards || {})) {
          if (!changes.some(attendance => attendance.stud === stud)) continue;
          const matches = rows(fresh.students).filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1 || rewardValue(matches[0].prize) !== change.previousReward) { storeDraft(key, pending); throw new Error('После сохранения посещаемости изменились топкойны ученика. Перечитайте урок.'); }
          pending.rewards![stud] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        storeDraft(key, pending);
      }
      for (const [markKey, change] of Object.entries(pending.marks)) {
        const matches = rows(fresh.students).filter(student => label(student.id_stud) === change.stud);
        if (matches.length !== 1 || !(Number(matches[0].id_vizit) > 0) || attendanceVisit(matches[0].id_vizit) !== change.visit) throw new Error('Запись посещения для оценки недоступна или изменилась. Перечитайте урок.');
        fresh = accept(await omniRequest<{ account: { id: string }; presents: unknown }>('set-lesson-mark', { ...params, ...change, visit: label(matches[0].id_vizit) }));
        delete pending.marks[markKey];
        storeDraft(key, pending);
      }
      // Release allocated coins first, so a redistribution cannot exceed the
      // limit temporarily even when its final draft fits within five coins.
      const rewardChanges = Object.entries(pending.rewards || {}).sort(([, a], [, b]) =>
        (rewardLevel(a.reward)! - (rewardLevel(a.previousReward) ?? 0)) - (rewardLevel(b.reward)! - (rewardLevel(b.previousReward) ?? 0)));
      for (const [stud, change] of rewardChanges) {
        const matches = rows(fresh.students).filter(student => label(student.id_stud) === stud);
        if (matches.length !== 1 || !(Number(matches[0].id_vizit) > 0) || attendanceVisit(matches[0].id_vizit) !== change.visit) throw new Error('Запись посещения для топкойнов недоступна или изменилась. Перечитайте урок.');
        if (!lessonRewardDraftAllowed(rows(fresh.students), { [stud]: change })) throw new Error('Лимит урока — 5 топкойнов. Награды в Omni изменились: перечитайте урок перед увеличением.');
        fresh = accept(await omniRequest<{ account: { id: string }; presents: unknown }>('set-lesson-reward', { ...params, ...change, visit: label(matches[0].id_vizit) }));
        delete pending.rewards![stud];
        storeDraft(key, pending);
      }
      setGroupStudents(null); setGroupId(''); setGroupName(''); setDetail(null);
      setNotice('Изменения урока сохранены в Omni.');
    } catch (reason) {
      if (version === sessionVersion.current) { storeDraft(key, { ...pending, needsReload: true }); failed(reason); }
    } finally { operation.current = false; setBusy(false); setAttendanceSaving(false); }
  }
  const studentTable = (items: RemoteRecord[]) => {
    const displayed = tab === 'lesson' && draft ? items.map(student => {
      const stud = label(student.id_stud);
      return { ...student, ...(draft.attendance[stud] ? { was: draft.attendance[stud].was } : {}), ...(draft.marks[`${stud}:2`] ? { mark2: draft.marks[`${stud}:2`].mark } : {}), ...(draft.marks[`${stud}:4`] ? { mark4: draft.marks[`${stud}:4`].mark } : {}), ...(draft.rewards?.[stud] ? { prize: draft.rewards[stud].reward } : {}) };
    }) : items;
    return <StudentTable key={`${tab}:${groupId}:${draftKey}`} items={displayed} busy={busy} lessonView={tab === 'lesson'} onOpen={student => void openStudent(student)} marks={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, allowDraft: true, onChange: stageMark } : undefined} rewards={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, onChange: stageReward } : undefined} attendance={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, saving: attendanceSaving, onChange: (student, was) => markAttendance([student], was), onAll: () => markAttendance(displayed, 1, true) } : undefined}/>;
  };
  function openDemo() {
    if (operation.current) return;
    if (hasDrafts && !window.confirm('При переходе в демо черновики уроков будут удалены. Продолжить?')) return;
    onDemo();
  }

  return <div className="app-shell live-workspace">
    <WorkspaceSidebar account={snapshot?.account} tab={tab} onNavigate={setTab} onDemo={openDemo}/>
    <main>
      <WorkspaceHeader account={snapshot?.account} teachers={teachers} busy={busy} authNeeded={authNeeded}
        desktop={isDesktop()} extension={isExtension()} onRefresh={() => void refresh()}
        onTeacherChange={id => void switchTeacher(id)} onAccountChange={() => void changeAccount()}/>
      <div className="page-content">
        <WorkspaceMobileNav tab={tab} onNavigate={setTab} onDemo={openDemo}/>
        <WorkspacePageHeading tab={tab}>
          {tab === 'schedule' && snapshot && <ScheduleToolbar today={today} date={scheduleDates[0] || today}
            range={scheduleRange} week={week} busy={busy} onWeekChange={value => void refresh(value)}
            onDatePick={date => void refresh(weekForDate(date))}/>}
        </WorkspacePageHeading>
        {error && <WorkspaceError message={error} busy={busy} authNeeded={authNeeded}
          onRetry={() => void (authNeeded ? connect() : snapshot ? refresh() : connect())}/>}
        {switchingTeacher && <TeacherSwitchingState/>}
        {tab === 'help' && <HelpPage/>}
        {!snapshot && !switchingTeacher && tab !== 'help' && <ConnectionCard busy={busy} waiting={waiting}
          extension={isExtension()} changingAccount={changingAccount} connectionState={connectionState}
          onLogin={login} onConnect={() => void connect()} onDemo={onDemo}/>}
        {snapshot && <>
          {tab === 'lesson' && <div className="lesson-workspace">
            {isExtension() && <LessonSaveBar busy={busy} saving={attendanceSaving} draft={draft} hasTheme={hasTheme}
              unavailable={attendanceReason} onSave={() => void saveLessonDraft()}
              onDiscard={() => { if (window.confirm('Удалить локальный черновик этого урока?')) clearLessonDraft(); }}/>}
            <LessonBanner account={snapshot.account} fetchedAt={snapshot.fetchedAt} date={selectedDate} students={lessonStudents} theme={currentTheme} draft={draft}/>
            <LessonSelectors date={selectedDate} today={today} presents={presentData} dayLessons={dayLessons}
              busy={busy} onDatePick={date => void loadLesson(undefined, undefined, date)}
              onSchedule={() => setTab('schedule')} onSlotPick={slot => void loadLesson(undefined, slot)}/>
            {isExtension() && <div className="lesson-preparation">
              <LessonThemeEditor key={draftKey} busy={busy} unavailable={attendanceReason} currentTheme={currentTheme} draft={draft?.theme}
                onLoad={loadLessonThemes} onSave={stageTheme}/>
              <PreviousLessonCopy key={`copy:${draftKey}`} busy={busy} unavailable={attendanceReason} students={lessonStudents}
                date={selectedDate} slot={label(presentData.cur_lenta)} dayLessons={dayLessons}
                onLoad={loadPreviousLesson} onCopy={stagePreviousLesson}/>
            </div>}
            {busy && <WorkspaceLoading/>}
            <LessonStudentsPanel busy={busy} date={selectedDate} students={lessonStudents}
              groups={rows(presentData.groups)} selectedGroup={label(presentData.cur_group)}
              presentsError={!lesson && snapshot.presents.error ? snapshot.presents : undefined}
              hasDayLessons={dayLessons.length > 0}
              onReload={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}
              onGroupPick={group => void loadLesson(group, label(presentData.cur_lenta))}>
              {studentTable(lessonStudents)}
            </LessonStudentsPanel>
          </div>}
          {busy && tab !== 'lesson' && <WorkspaceLoading/>}
          {tab === 'schedule' && <section className="panel">{snapshot.schedule.error
            ? <SectionView section={snapshot.schedule}/>
            : <ScheduleView data={schedule} today={today} busy={busy} onOpen={(date, slot) => void loadLesson(undefined, slot, date)}/>}
          </section>}
          {tab === 'groups' && <GroupStudentsPanel groupsSection={snapshot.groups} groups={groups} name={groupName}
            groupId={groupId} studentsSection={groupStudents} busy={busy} onGroupPick={group => void openGroup(group)}
            renderStudents={studentTable}/>}
          {tab === 'homework' && <HomeworkPanel busy={busy} onRefresh={() => void refresh()}
            section={snapshot.newHomework} items={reviewItems}
            grading={isExtension() ? { busy, unavailable: homeworkNeedsReload ? 'Перед следующей оценкой нажмите «Обновить работы».' : undefined, onGrade: gradeHomework } : undefined}/>}
          {tab === 'dossier' && <TeacherDossier key={`${snapshot.account.id}:${snapshot.account.branch}:${sessionVersion.current}`}
            accountId={snapshot.account.id} accountName={snapshot.account.name} branch={snapshot.account.branch} schedule={snapshot.schedule} today={today} disabled={busy} onConnectionError={failed} onIncomeLoading={setIncomeBusy}/>}
          {tab === 'materials' && <>
            <TeachingMaterials key={`${snapshot.account.id}:${snapshot.account.branch}`} accountId={snapshot.account.id} disabled={busy} onConnectionError={failed}/>
            <IssuedMaterialsPanel lesson={lesson} busy={busy} date={selectedDate} groupSelected={!!presentData.cur_group}
              onLoad={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}/>
          </>}
          <div className="bottom-actions"><span><ShieldCheck size={17}/>{isExtension() ? 'Данные Omni · отметки посещаемости сохраняются на сервере' : 'Данные загружены из Omni · только чтение'}</span></div>
        </>}
        <footer className="page-footer"><span>omni workspace</span><span>Больше внимания ученикам.</span><span>Локальное подключение</span></footer>
      </div>
    </main>
    {detail && <StudentDetailDialog dialogRef={dialog} detail={detail} onClose={() => setDetail(null)}/>}
    {notice && <WorkspaceToast message={notice} onClose={() => setNotice('')}/>}
    <WorkspaceQuickActions connected={!!snapshot} schedule={tab === 'schedule'} busy={busy}
      onExport={exportSnapshot} onConnect={() => void connect()}/>
  </div>;
}

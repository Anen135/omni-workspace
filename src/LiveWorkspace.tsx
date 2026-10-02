import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCheck, ClipboardCheck, Download, ExternalLink, FolderOpen, GraduationCap, History, LoaderCircle, LogIn, RefreshCw, ShieldCheck, Users, X, ChevronDown } from 'lucide-react';
import { ConnectionError, label, omniRequest, record, rows, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from './omni-client';
import { ScheduleView } from './ScheduleView';
import { FilePreview } from './FilePreview';
import { materialLink } from './teaching-materials';
import { TeachingMaterials } from './TeachingMaterials';
import { LoginForm } from './LoginForm';
import { isDesktop } from './desktop-client';
import { isExtension, onExtensionSessionChange } from './extension-client';
import { DatePickerPopover, DismissiblePopover, StudentTable } from './WorkspaceControls';
import { HomeworkTable } from './HomeworkTable';
import { LessonThemeEditor, type ThemeChoice, type ThemeData } from './LessonThemeEditor';
import { scheduleDays } from './schedule';
import { presentLessons } from './present-lessons';
import { attendanceStatus, attendanceVisit, attendanceUnavailable, attendanceHasTheme, attendanceDraftKey, type AttendanceChange, type AttendanceStatus } from './attendance';
import './live.css';
import './workspace.css';

type Tab = 'lesson' | 'schedule' | 'groups' | 'homework' | 'materials';
const emptySection: Section = { data: null, error: null };
function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasData);
  if (value && typeof value === 'object') return Object.values(value).some(hasData);
  return value !== null && value !== undefined && value !== '' && value !== false;
}

export function LiveWorkspace({ onDemo }: { onDemo: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [lesson, setLesson] = useState<RemoteLesson | null>(null);
  const [tab, setTab] = useState<Tab>('lesson');
  const [busy, setBusy] = useState(false);
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
  const [attendanceSaving, setAttendanceSaving] = useState(false);
  const [themeSaving, setThemeSaving] = useState(false);
  const [attendanceNeedsReload, setAttendanceNeedsReload] = useState(false);
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, Record<string, AttendanceStatus>>>({});
  const [draftPaused, setDraftPaused] = useState(false);
  const operation = useRef(false);
  const currentAccount = useRef('');
  const lastBranch = useRef('');
  const sessionVersion = useRef(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const presentData = record(lesson?.presents ?? snapshot?.presents.data);
  const draftKey = attendanceDraftKey(snapshot?.account.id || '', snapshot?.account.branch || '', presentData);
  const draft = attendanceDrafts[draftKey];
  const hasDrafts = Object.keys(attendanceDrafts).length > 0;
  const hasTheme = attendanceHasTheme(presentData);
  const lessonStudents = rows(presentData.students);
  const dayLessons = presentLessons(presentData.schedule);
  const groups = rows(snapshot?.groups.data);
  const teachers = rows(snapshot?.teachers?.data);
  const selectedDate = label(presentData.cur_date || presentData.today);
  const schedule = record(snapshot?.schedule.data);
  const scheduleDates = scheduleDays(schedule).map(day => day.date);
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
      setAttendanceDrafts({});
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
      if (currentAccount.current !== result.account.id || lastBranch.current !== result.account.branch) {
        setAttendanceDrafts({});
        setGroupStudents(null); setGroupName(''); setGroupId(''); setDetail(null);
      }
      currentAccount.current = result.account.id; lastBranch.current = result.account.branch || '';
      setSnapshot(result); setChangingAccount(false); setLesson(null); setWeek(nextWeek); setAuthNeeded(false); setWaiting(false); setAttendanceNeedsReload(false);
    } catch (reason) { if (version === sessionVersion.current) failed(reason); }
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
    if (operation.current || !window.confirm(`Выйти из текущего аккаунта Omni и войти в другой? Это изменит общую сессию Omni в этом профиле браузера.${hasDrafts ? ' Локальные черновики посещаемости будут удалены.' : ''}`)) return;
    operation.current = true; setBusy(true); setError(''); setWaiting(false); setChangingAccount(true);
    setAttendanceDrafts({});
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
    if (hasDrafts && !window.confirm('При смене преподавателя локальные отметки будут удалены. Продолжить?')) return;
    setAttendanceDrafts({});
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
      setAttendanceDrafts({});
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
    }).catch(() => {});
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
    if (!attendanceSaving && !themeSaving && !hasDrafts) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [attendanceSaving, themeSaving, hasDrafts]);

  useEffect(() => {
    if (draft && hasTheme && !draftPaused && !busy && !attendanceNeedsReload) void sendAttendanceDraft();
  }, [draftKey, draft, hasTheme, draftPaused, busy, attendanceNeedsReload]);

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
      setLesson(result); setAttendanceNeedsReload(false); if (tab === 'schedule' || date !== selectedDate) setTab('lesson');
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
  const attendanceReason = attendanceNeedsReload ? 'Перед следующей отметкой загрузите урок заново.' : attendanceUnavailable(presentData);
  async function saveMark(student: RemoteRecord, type: 2 | 4, mark: number) {
    if (!snapshot || operation.current || attendanceReason) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setAttendanceSaving(true); setError(''); setNotice('');
    try {
      const previous = student[`mark${type}`];
      const result = await omniRequest<{ account: { id: string }; presents: unknown }>('set-lesson-mark', {
        accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group), lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule),
        stud: label(student.id_stud), visit: label(student.id_vizit), type, mark, previousMark: previous === null || previous === undefined || previous === '' ? null : String(previous),
      });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account);
      setSnapshot(current => current ? { ...current, presents: { data: result.presents, error: null } } : null);
      setLesson(current => current ? { ...current, presents: result.presents } : null);
      setGroupStudents(null); setGroupId(''); setGroupName(''); setDetail(null); setNotice('Оценка сохранена в Omni.');
    } catch (reason) { if (version === sessionVersion.current) { setAttendanceNeedsReload(true); setDraftPaused(true); failed(reason); } }
    finally { operation.current = false; setBusy(false); setAttendanceSaving(false); }
  }
  async function editLessonTheme(choice?: ThemeChoice): Promise<ThemeData> {
    if (!snapshot || operation.current) throw new Error('Дождитесь завершения операции.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    if (choice) { setDraftPaused(true); setThemeSaving(true); }
    try {
      const result = await omniRequest<ThemeData & { account: { id: string }; warning?: string }>(choice ? 'set-lesson-theme' : 'lesson-themes', {
        accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group),
        lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule), ...choice,
      });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      ensureAccount(result.account);
      setSnapshot(current => current ? { ...current, presents: { data: result.presents, error: null } } : null);
      setLesson(current => current ? { ...current, presents: result.presents, ...(choice ? { materials: emptySection, homework: emptySection } : {}) } : null);
      if (choice) { setDraftPaused(false); setAttendanceNeedsReload(false); setNotice('Тема сохранена в Omni.'); if (result.warning) setError(result.warning); }
      return result;
    } catch (reason) {
      if (version === sessionVersion.current) { if (choice) { setDraftPaused(true); setAttendanceNeedsReload(true); } failed(reason); }
      throw reason;
    } finally { operation.current = false; setBusy(false); setThemeSaving(false); }
  }
  async function markAttendance(items: RemoteRecord[], was: AttendanceStatus, all = false) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) return;
    const changes: AttendanceChange[] = items.filter(student => attendanceStatus(student.was) !== was).map(student => ({ stud: label(student.id_stud), was, previousWas: attendanceStatus(student.was), visit: attendanceVisit(student.id_vizit) }));
    if (!changes.length) return;
    if (all && !window.confirm(`Отметить присутствующими всю группу (${items.length} учеников), включая скрытых поиском? ${!hasTheme || draft ? 'Отметки останутся в черновике до сохранения темы.' : `Изменятся ${changes.length} отметок в Omni.`}`)) return;
    if (!hasTheme || draft) {
      setAttendanceDrafts(current => ({ ...current, [draftKey]: { ...current[draftKey], ...Object.fromEntries(changes.map(change => [change.stud, change.was])) } }));
      setNotice('Отметки в локальном черновике — ещё не отправлены в Omni.');
      return;
    }
    await saveAttendanceChanges(changes);
  }
  async function sendAttendanceDraft() {
    if (!snapshot || !draft || !hasTheme || operation.current || attendanceReason) return;
    const changes: AttendanceChange[] = [];
    for (const [stud, was] of Object.entries(draft)) {
      const matches = lessonStudents.filter(student => label(student.id_stud) === stud);
      if (matches.length !== 1) { setDraftPaused(true); setError('Список учеников изменился. Проверьте урок и отмените черновик, если он больше не актуален.'); return; }
      const student = matches[0];
      if (attendanceStatus(student.was) !== was) changes.push({ stud, was, previousWas: attendanceStatus(student.was), visit: attendanceVisit(student.id_vizit) });
    }
    if (!changes.length) { clearAttendanceDraft(); setNotice('Omni уже содержит выбранные отметки.'); return; }
    await saveAttendanceChanges(changes, true);
  }
  function clearAttendanceDraft() {
    setAttendanceDrafts(current => { const next = { ...current }; delete next[draftKey]; return next; });
    setDraftPaused(false);
  }
  async function saveAttendanceChanges(changes: AttendanceChange[], fromDraft = false) {
    if (!snapshot) return;
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setAttendanceSaving(true); setError(''); setNotice('');
    try {
      const result = await omniRequest<{ account: { id: string }; presents: unknown }>('set-attendance', {
        accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group),
        lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule), changes,
      });
      if (version !== sessionVersion.current) return;
      ensureAccount(result.account);
      setSnapshot(current => current ? { ...current, presents: { data: result.presents, error: null } } : null);
      setLesson(current => current ? { ...current, presents: result.presents } : null);
      setGroupStudents(null); setGroupId(''); setGroupName(''); setDetail(null);
      if (fromDraft) clearAttendanceDraft();
      setNotice('Посещаемость сохранена в Omni.');
    } catch (reason) {
      if (version === sessionVersion.current) { setDraftPaused(true); setAttendanceNeedsReload(true); failed(reason); }
    } finally { operation.current = false; setBusy(false); setAttendanceSaving(false); }
  }
  const studentTable = (items: RemoteRecord[]) => {
    const displayed = tab === 'lesson' && draft ? items.map(student => Object.hasOwn(draft, label(student.id_stud)) ? { ...student, was: draft[label(student.id_stud)] } : student) : items;
    return <>{tab === 'lesson' && isExtension() && (!hasTheme || draft) && <div className="attendance-help" role="status">
      {draft ? `Черновик: ${Object.keys(draft).length} отметок. В Omni ещё не сохранён. ` : 'Можно отметить учеников заранее. '}
      {hasTheme ? 'Тема сохранена.' : 'Выберите и сохраните тему выше — после подтверждения Omni отметки отправятся автоматически.'}
      {hasDrafts && ' Черновики хранятся только до закрытия или перезагрузки страницы.'}
      {draft && <button className="text-button" disabled={busy} onClick={() => { if (window.confirm('Удалить локальные отметки этого урока?')) clearAttendanceDraft(); }}>Отменить черновик</button>}
      {draft && draftPaused && <button className="text-button" disabled={busy || attendanceNeedsReload} onClick={() => setDraftPaused(false)}>Возобновить отправку</button>}
    </div>}<StudentTable key={`${tab}:${groupId}:${draftKey}`} items={displayed} busy={busy} onOpen={student => void openStudent(student)} marks={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, onChange: (student, type, mark) => void saveMark(student, type, mark) } : undefined} attendance={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, saving: attendanceSaving, onChange: (student, was) => void markAttendance([student], was), onAll: () => void markAttendance(displayed, 1, true) } : undefined}/></>;
  };

  return <div className="app-shell live-workspace">
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-symbol">o<span/></span>omni<span className="brand-dot">.</span></a><div className="workspace"><span className="workspace-icon"><GraduationCap size={20}/></span><div><strong>Академия TOP</strong><small>{snapshot?.account.branch || 'Подключение к Omni'}</small></div></div><div className="nav-label">МОЁ ПРОСТРАНСТВО</div><nav>{([
      ['lesson', BookOpen, 'Мой урок'], ['schedule', CalendarDays, 'Расписание'], ['groups', Users, 'Ученики'], ['homework', ClipboardCheck, 'Домашние задания'], ['materials', FolderOpen, 'Материалы'],
    ] as const).map(([key, Icon, name]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}><Icon size={19}/>{name}</button>)}</nav><div className="sidebar-tip"><ShieldCheck size={21}/><strong>Ваш аккаунт — ваш браузер</strong><p>Сессия остаётся на этом компьютере. Приложение не сохраняет пароль.</p></div><div className="sidebar-bottom"><button onClick={onDemo}><History size={17}/>Открыть демо отдельно</button><div className="profile"><span className="avatar purple">{snapshot?.account.name.charAt(0) || 'П'}</span><div><strong>{snapshot?.account.name || 'Аккаунт не подключён'}</strong><small>{snapshot ? 'Реальные данные Omni' : 'Войдите для начала работы'}</small></div></div></div></aside>
    <main><header className="topbar"><div className="topbar-workspace"><span className="workspace-mark">o<span/></span><div><strong>Академия TOP</strong><small>{snapshot?.account.branch || 'Omni Workspace'}</small></div></div><div className="topbar-actions">{snapshot && <button className="button secondary compact" disabled={busy} onClick={() => void refresh()}><RefreshCw size={14} className={busy ? 'spin' : ''}/>Обновить</button>}{snapshot && <label className="act-as" title={isDesktop() ? "Смена преподавателя доступна в официальном Omni. Затем обновите данные." : "Выбор преподавателя"}><Users size={14}/><span>Работаю от имени</span><select aria-label="Работаю от имени" value={snapshot.account.id} disabled={busy || !teachers.length || isDesktop()} onChange={event => void switchTeacher(event.target.value)}><option value={snapshot.account.id}>{snapshot.account.name}</option>{teachers.filter(teacher => label(teacher.id_teach) !== snapshot.account.id).map(teacher => <option key={label(teacher.id_teach)} value={label(teacher.id_teach)}>{label(teacher.fio_teach)}</option>)}</select><ChevronDown size={13}/></label>}{snapshot && isExtension() && <button className="button secondary compact" disabled={busy} aria-label="Сменить аккаунт" onClick={() => void changeAccount()}><LogIn size={14}/>Сменить аккаунт</button>}<span className={`demo-badge ${snapshot && !authNeeded ? 'connected-badge' : ''}`}><span/>{snapshot ? 'Подключено' : 'Ожидает входа'}</span></div></header><div className="page-content">
      <div className="live-mobile-nav"><select aria-label="Раздел" value={tab} onChange={event => setTab(event.target.value as Tab)}><option value="lesson">Мой урок</option><option value="schedule">Расписание</option><option value="groups">Ученики</option><option value="homework">Домашние задания</option><option value="materials">Материалы</option></select><button className="text-button" onClick={onDemo}>Демо</button></div>
       <div className="page-heading live-heading compact-heading"><div><div className="eyebrow">{tab === 'lesson' ? 'ТЕКУЩАЯ РАБОТА' : tab === 'schedule' ? 'НЕДЕЛЬНЫЙ ОБЗОР' : tab === 'groups' ? 'УЧЕБНЫЕ ГРУППЫ' : tab === 'homework' ? 'ПРОВЕРКА РАБОТ' : 'БИБЛИОТЕКА'}</div><h1>{({ lesson: 'Мой урок', schedule: 'Расписание', groups: 'Ученики', homework: 'Домашние задания', materials: 'Материалы' } as Record<Tab, string>)[tab]}</h1></div>{tab === 'schedule' && snapshot && <div className="schedule-tools"><button className="button secondary" aria-label="Предыдущая неделя" disabled={busy || week <= -52} onClick={() => void refresh(week - 1)}>←</button><span>{scheduleRange || "Неделя без расписания"}</span><button className="button secondary" aria-label="Следующая неделя" disabled={busy || week >= 52} onClick={() => void refresh(week + 1)}>→</button><button className="button secondary" disabled={busy} onClick={() => void refresh(0)}>Сегодня</button><DatePickerPopover today={today} value={scheduleDates[0] || today} busy={busy} onPick={date => void refresh(weekForDate(date))}/></div>}</div>
      {error && <div className="warning" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => void (authNeeded ? connect() : snapshot ? refresh() : connect())}>{authNeeded ? 'Открыть вход' : 'Повторить'}</button></div>}
      {switchingTeacher && <section className="panel connection-card" role="status"><LoaderCircle className="spin" size={26}/><h2>Переключаю преподавателя…</h2><p>Загружаю его расписание, группы и домашние задания.</p></section>}
      {!snapshot && !switchingTeacher && <section className="panel connection-card"><span className="lesson-icon"><LogIn size={26}/></span><h2>{waiting ? 'Завершите вход в окне Omni' : 'Вход в Omni'}</h2><p>{changingAccount ? "Войдите в другой аккаунт в официальной вкладке Omni. Логин и пароль вводятся только там. После входа данные загрузятся автоматически." : waiting ? connectionState === 'challenge' ? 'Пройдите проверку браузера в официальном окне. Затем можно войти здесь или в официальном окне.' : 'Можно завершить вход в официальном окне или использовать форму ниже.' : 'Введите данные аккаунта академии. Для подключения используйте форму ниже или официальное окно входа.'}</p>{!changingAccount && <LoginForm busy={busy} onLogin={login}/>}<button className="button secondary" disabled={busy} onClick={() => void connect()}><ExternalLink size={17}/>Открыть официальный вход</button><div className="connection-help"><ShieldCheck size={16}/>Сессия остаётся на этом компьютере. Демо-данные не попадают в реальный аккаунт.</div><button className="text-button" onClick={onDemo}>Пока посмотреть демонстрацию<ArrowRight size={15}/></button></section>}
      {snapshot && <>
        {tab === 'lesson' && <section className="lesson-banner"><span className="lesson-icon"><BookOpen size={25}/></span><div className="lesson-description"><div className="lesson-meta"><span>РЕАЛЬНЫЕ ДАННЫЕ</span><span>{selectedDate}</span></div><h2>{label(lessonStudents[0]?.theme) || (lessonStudents.length ? 'Текущее занятие' : 'Omni не вернул текущую пару')}</h2><div className="lesson-time">Обновлено {new Date(snapshot.fetchedAt).toLocaleTimeString('ru-RU')} · {snapshot.account.branch}</div></div></section>}
        {tab === 'lesson' && isExtension() && <LessonThemeEditor key={draftKey} busy={busy} unavailable={attendanceUnavailable(presentData)} onLoad={() => editLessonTheme()} onSave={async choice => { await editLessonTheme(choice); }}/>}
        {tab === 'lesson' && <div className="workspace-table-tools"><strong>Дата урока: {selectedDate || 'не выбрана'}</strong><DatePickerPopover unrestricted today={today} value={selectedDate || today} busy={busy} onPick={date => void loadLesson(undefined, undefined, date)}/><button className="button secondary" disabled={busy} onClick={() => setTab('schedule')}>Выбрать пару в расписании</button><span>Группа: {label(rows(presentData.groups).find(group => label(group.id_tgroups) === label(presentData.cur_group))?.name_tgroups) || label(presentData.cur_group) || '—'}</span><span>Пара: {label(presentData.cur_lenta_number) || label(presentData.cur_lenta) || '—'}</span></div>}
        {tab === 'lesson' && dayLessons.length > 0 && <div className="workspace-table-tools" role="group" aria-label="Пары выбранного дня"><label>Пара <select aria-label="Пара выбранного дня" disabled={busy} value={dayLessons.some(item => item.slot === label(presentData.cur_lenta)) ? label(presentData.cur_lenta) : ''} onChange={event => void loadLesson(undefined, event.target.value)}><option value="" disabled>Выберите пару</option>{dayLessons.map(item => <option key={item.slot} value={item.slot}>{item.title}{item.time ? ` · ${item.time}` : ''}</option>)}</select></label><span>{dayLessons.length} пар · список из раздела «Присутствующие» Omni</span></div>}
        {busy && <div role="status" className="live-loading"><LoaderCircle className="spin" size={17}/>Загружаю данные Omni…</div>}
        {tab === 'lesson' && <section className="panel"><div className="panel-heading"><div><h2>Присутствующие</h2><p>{lessonStudents.length ? `${lessonStudents.length} учеников · данные академии` : 'Показываем только то, что вернул сервер Omni'}</p></div><button className="button secondary" disabled={busy || !selectedDate} onClick={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}><RefreshCw size={15}/>Загрузить урок</button></div>{rows(presentData.groups).length > 0 && <div className="live-group-buttons">{rows(presentData.groups).map(group => <button className="button secondary" disabled={busy} key={label(group.id_tgroups)} onClick={() => void loadLesson(label(group.id_tgroups), label(presentData.cur_lenta))}>{label(group.name_tgroups)}</button>)}</div>}{!lesson && snapshot.presents.error ? <SectionView section={snapshot.presents}/> : lessonStudents.length ? studentTable(lessonStudents) : <Empty title={dayLessons.length ? "Выберите пару и группу" : "На выбранную дату ученики не загружены"} text={dayLessons.length ? "Список пар доступен выше. Выберите нужное занятие, чтобы загрузить учеников." : "Выберите другую дату или нажмите «Загрузить урок»."}/>}</section>}
        {tab === 'schedule' && <section className="panel">{snapshot.schedule.error ? <SectionView section={snapshot.schedule}/> : <ScheduleView data={schedule} today={today} busy={busy} onOpen={(date, slot) => void loadLesson(undefined, slot, date)}/>}</section>}
         {tab === 'groups' && <section className="panel"><div className="panel-heading"><div><h2>{groupName || 'Мои группы'}</h2><p>Просмотр учеников и доступных оценок</p></div></div>{snapshot.groups.error ? <SectionView section={snapshot.groups}/> : groups.length ? <><div className="workspace-table-tools"><label>Группа <select aria-label="Выбор группы" disabled={busy} value={groupId} onChange={event => { const group = groups.find(item => label(item.id_tgroups) === event.target.value); if (group) void openGroup(group); }}><option value="" disabled>Выберите группу</option>{groups.map(group => <option key={label(group.id_tgroups)} value={label(group.id_tgroups)}>{label(group.name_tgroups)}</option>)}</select></label></div>{busy && !groupStudents && <TableSkeleton/>}{!busy && !groupStudents && <Empty title="Выберите группу"/>}{groupStudents && (groupStudents.error ? <SectionView section={groupStudents}/> : rows(groupStudents.data).length ? studentTable(rows(groupStudents.data)) : <Empty title="В группе нет доступных учеников" text="Omni вернул пустой список."/>)}</> : <Empty title="Omni пока не возвращает группы" text="Список групп в Omni пуст."/>}</section>}
        {tab === 'homework' && <section className="panel"><div className="panel-heading"><div><h2>На проверку</h2><p>Непроверенных ДЗ: {snapshot.counts.homework} · Практических: {snapshot.counts.practice}</p></div></div><HomeworkTable section={snapshot.newHomework} render={value => hasData(value) ? <DataValue value={value}/> : <span>—</span>}/><details className="live-details"><summary>Группы для проверки домашних заданий</summary><SectionView section={snapshot.homework} emptyTitle="Доступных групп нет"/></details></section>}
        {tab === 'materials' && <>
          <TeachingMaterials key={`${snapshot.account.id}:${snapshot.account.branch}`} accountId={snapshot.account.id} disabled={busy} onConnectionError={failed}/>
          <section className="panel"><div className="panel-heading"><div><h2>Выданные ДЗ и материалы текущего урока</h2><p>Файлы, связанные с текущей группой, датой и парой</p></div><button className="button secondary" disabled={busy || !selectedDate || !presentData.cur_group} onClick={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}><RefreshCw size={15}/>Загрузить выданные материалы</button></div>{!presentData.cur_group ? <Empty title="Текущая пара не выбрана" text="Выданные ученикам файлы появятся после загрузки занятия. Методички для подготовки доступны в каталоге выше."/> : <><h3 className="live-section-title">Выданные материалы</h3><SectionView fileFallback="pdf" section={lesson?.materials || emptySection} emptyTitle={lesson ? 'Материалов нет' : 'Нажмите «Загрузить выданные материалы»'}/><h3 className="live-section-title">Выданное домашнее задание</h3><SectionView section={lesson?.homework || emptySection} emptyTitle={lesson ? 'ДЗ не выдано' : 'Нажмите «Загрузить выданные материалы»'}/></>}</section>
        </>}
       <div className="bottom-actions"><span><ShieldCheck size={17}/>{isExtension() ? 'Данные Omni · отметки посещаемости сохраняются на сервере' : 'Данные загружены из Omni · только чтение'}</span></div>
      </>}
      <footer className="page-footer"><span>omni workspace</span><span>Больше внимания ученикам.</span><span>Локальное подключение</span></footer>
    </div></main>
    {detail && <dialog ref={dialog} onCancel={() => setDetail(null)} aria-label={detail.title}><div className="modal-header"><h2>{detail.title}</h2><button className="icon" aria-label="Закрыть" onClick={() => setDetail(null)}><X size={20}/></button></div><div className="modal-body">{detail.sections.map((section, index) => <SectionView key={index} section={section}/>)}</div></dialog>}
     {notice && <div className="toast" role="status"><CheckCheck size={17}/>{notice}<button className="icon" aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={16}/></button></div>}<DismissiblePopover label="Быстрые действия" drawer>{snapshot && <button onClick={exportSnapshot}><Download size={15}/>Экспорт снимка</button>}<button disabled={busy} onClick={() => void connect()}><ExternalLink size={15}/>Открыть Omni</button>{tab === 'schedule' && <button onClick={() => window.print()}><CalendarDays size={15}/>Печать расписания</button>}</DismissiblePopover>
  </div>;
}

function TableSkeleton() {
  return <div role="status" aria-label="Загрузка учеников" className="workspace-skeleton">{Array.from({ length: 5 }, (_, index) => <div key={index}/>)}</div>;
}
function Empty({ title, text }: { title: string; text?: string }) {
  return <div className="empty"><BookOpen size={30}/><h3>{title}</h3>{text && <p>{text}</p>}</div>;
}
const fieldNames: Record<string, string> = {
  fio_stud: 'Ученик', name_tgroups: 'Группа', name_spec: 'Предмет', spec_name: 'Предмет',
  theme: 'Тема', name: 'Название', title: 'Название', comment: 'Комментарий',
  description: 'Описание', text: 'Текст', answer_text: 'Ответ ученика', mark: 'Оценка',
  mark2: 'Контрольная работа', mark4: 'Работа на уроке', date: 'Дата', date_vizit: 'Дата занятия',
  time: 'Дата выдачи', deadline: 'Срок сдачи', n_lenta: 'Пара', l_start: 'Начало', l_end: 'Окончание',
  average: 'Средний балл', avg_mark: 'Средний балл', count: 'Количество',
  download_url: 'Файл', download_url_stud: 'Работа ученика', filename: 'Файл', file_url: 'Файл', link: 'Ссылка',
};
function SectionView({ section, emptyTitle = 'Данные отсутствуют', fileFallback }: { section: Section; emptyTitle?: string; fileFallback?: 'pdf' }) {
  if (section.error) return <div className="warning" role="alert">{section.error}</div>;
  if (!hasData(section.data)) return <Empty title={emptyTitle}/>;
  return <div className="remote-data"><DataValue value={section.data} fileFallback={fileFallback}/></div>;
}
function DataValue({ value, depth = 0, fileFallback }: { value: unknown; depth?: number; fileFallback?: 'pdf' }) {
  if (depth > 6) return <p className="muted">Вложенные данные доступны в экспорте снимка.</p>;
  if (!value || typeof value !== 'object') return <span>{label(value)}</span>;
  if (Array.isArray(value)) return <>{value.slice(0, 100).map((item, index) => <div className="remote-record" key={index}><DataValue value={item} depth={depth + 1} fileFallback={fileFallback}/></div>)}{value.length > 100 && <p>Показаны первые 100 записей. Полные данные доступны в экспорте.</p>}</>;
  const entries = Object.entries(value);
  return <>{entries.map(([key, item]) => {
    if (item === null || item === '' || item === undefined) return null;
    if (typeof item === 'object') return <div className="remote-record" key={key}>{fieldNames[key] && <h3>{fieldNames[key]}</h3>}<DataValue value={item} depth={depth + 1} fileFallback={fileFallback}/></div>;
    if (!fieldNames[key]) return null;
    const text = label(item);
    const safeLink = ['download_url', 'download_url_stud', 'file_url', 'link', 'filename'].includes(key) ? materialLink(text) : null;
    if (safeLink) {
      // A record often exposes the same file under several aliases.
      if (entries.slice(0, entries.findIndex(([name]) => name === key)).some(([name, data]) => ['download_url', 'download_url_stud', 'file_url', 'link', 'filename'].includes(name) && materialLink(label(data)) === safeLink)) return null;
      const itemRecord = record(value);
      return <div className="remote-attachment" key={key}><span>{fieldNames[key]}</span><FilePreview url={safeLink} filename={label(itemRecord.file_name || itemRecord.original_name || itemRecord.filename)} mime={label(itemRecord.mime_type || itemRecord.content_type || itemRecord.mime)} fallback={fileFallback}/></div>;
    }
    return <div className="remote-field" key={key}><span>{fieldNames[key]}</span><strong>{text}</strong></div>;
  })}{!entries.some(([key, item]) => fieldNames[key] || (item && typeof item === 'object')) && <p className="muted">Omni вернул запись в неподдерживаемом формате. Её можно сохранить через экспорт снимка.</p>}</>;
}

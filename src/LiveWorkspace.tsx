import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, CalendarDays, CheckCheck, ClipboardCheck, Download, ExternalLink, FolderOpen, GraduationCap, History, LoaderCircle, LogIn, RefreshCw, ShieldCheck, Users, X } from 'lucide-react';
import { ConnectionError, label, omniRequest, record, rows, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from './omni-client';
import { ScheduleView } from './ScheduleView';
import { FilePreview } from './FilePreview';
import { materialLink } from './teaching-materials';
import { TeachingMaterials } from './TeachingMaterials';
import './live.css';

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
  const [detail, setDetail] = useState<{ title: string; sections: Section[] } | null>(null);
  const [notice, setNotice] = useState('');
  const [switchingTeacher, setSwitchingTeacher] = useState(false);
  const operation = useRef(false);
  const currentAccount = useRef('');
  const lastBranch = useRef('');
  const dialog = useRef<HTMLDialogElement>(null);
  const presentData = record(lesson?.presents ?? snapshot?.presents.data);
  const lessonStudents = rows(presentData.students);
  const groups = rows(snapshot?.groups.data);
  const teachers = rows(snapshot?.teachers?.data);
  const selectedDate = label(presentData.cur_date || presentData.today);
  const schedule = record(snapshot?.schedule.data);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: snapshot?.account.timezone || 'Europe/Moscow' }).format(new Date());

  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : 'Не удалось загрузить данные.');
    if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) {
      setAuthNeeded(true); setSnapshot(null); setLesson(null); setGroupStudents(null); setDetail(null);
      currentAccount.current = ''; lastBranch.current = '';
    }
  }
  function ensureAccount(account: { id: string }) {
    if (currentAccount.current && currentAccount.current !== account.id) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт сменился. Обновите подключение.');
  }
  async function refresh(nextWeek = week) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<Snapshot>('snapshot', { week: nextWeek });
      if (currentAccount.current !== result.account.id || lastBranch.current !== result.account.branch) {
        setGroupStudents(null); setGroupName(''); setDetail(null);
      }
      currentAccount.current = result.account.id; lastBranch.current = result.account.branch || '';
      setSnapshot(result); setLesson(null); setWeek(nextWeek); setAuthNeeded(false); setWaiting(false);
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function connect() {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const state = await omniRequest<{ connected: boolean; state: string }>('connect');
      setConnectionState(state.state);
      if (!state.connected) setWaiting(true);
      else { operation.current = false; await refresh(); }
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function switchTeacher(teacherId: string) {
    if (!snapshot || operation.current || teacherId === snapshot.account.id) return;
    const accountId = snapshot.account.id;
    operation.current = true; setBusy(true); setSwitchingTeacher(true); setError('');
    setSnapshot(null); setLesson(null); setGroupStudents(null); setGroupName(''); setDetail(null); setNotice('');
    currentAccount.current = ''; lastBranch.current = ''; setWeek(0); setTab('lesson');
    try {
      await omniRequest('switch-teacher', { teacherId, accountId });
      operation.current = false;
      await refresh(0);
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); setSwitchingTeacher(false); }
  }
  useEffect(() => {
    let cancelled = false;
    void omniRequest<{ connected: boolean }>('status').then(state => {
      if (!cancelled && state.connected) void refresh();
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => {
      if (operation.current) return;
      void omniRequest<{ connected: boolean; state: string }>('status').then(state => {
        setConnectionState(state.state);
        if (state.connected) { setWaiting(false); void refresh(); }
      }).catch(() => {});
    }, 3000);
    return () => clearInterval(timer);
  }, [waiting]);
  useEffect(() => { if (detail) dialog.current?.showModal(); }, [detail]);

  async function loadLesson(group?: string, lenta?: string) {
    if (operation.current || !selectedDate) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<RemoteLesson>('lesson', {
        date: selectedDate, ...(group ? { group } : {}), ...(lenta !== undefined && lenta !== '' ? { lenta } : {}),
      });
      ensureAccount(result.account); setLesson(result);
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function openGroup(group: RemoteRecord) {
    const id = label(group.id_tgroups);
    if (!id || operation.current) return;
    operation.current = true; setBusy(true); setError(''); setGroupStudents(null);
    try {
      const result = await omniRequest<{ account: { id: string }; students: unknown }>('group', { group: id });
      ensureAccount(result.account); setGroupStudents({ data: result.students, error: null }); setGroupName(label(group.name_tgroups));
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  async function openStudent(student: RemoteRecord) {
    const id = label(student.id_stud);
    if (!id || operation.current) return;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<{ account: { id: string }; details: Section; attendance: Section }>('student', { stud: id });
      ensureAccount(result.account); setDetail({ title: label(student.fio_stud) || 'Ученик', sections: [result.details, result.attendance] });
    } catch (reason) { failed(reason); }
    finally { operation.current = false; setBusy(false); }
  }
  function exportSnapshot() {
    if (!snapshot) return;
    const data = { source: 'omni', snapshot, lesson, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `omni-${selectedDate || 'snapshot'}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('Снимок реальных данных экспортирован в файл.');
  }
  const studentTable = (items: RemoteRecord[]) => <div className="table-scroll"><table><thead><tr><th>УЧЕНИК</th><th>ПРИСУТСТВИЕ</th><th>КОНТРОЛЬНАЯ</th><th>РАБОТА НА УРОКЕ</th></tr></thead><tbody>{items.map((student, index) => <tr key={label(student.id_stud) || index}><td><button className="student-name" disabled={busy || !student.id_stud} onClick={() => void openStudent(student)}><span className="avatar purple">{label(student.fio_stud).split(' ').slice(0, 2).map(part => part[0]).join('')}</span>{label(student.fio_stud) || 'Имя не получено'}</button></td><td>{({ '0': 'Отсутствует', '1': 'Присутствует', '2': 'Опоздал(а)' } as Record<string, string>)[label(student.was)] || 'Не отмечено'}</td><td>{label(student.mark2) || '—'}</td><td>{label(student.mark4) || '—'}</td></tr>)}</tbody></table></div>;

  return <div className="app-shell live-workspace">
    <aside className="sidebar"><a className="brand" href="/"><span className="brand-symbol">o<span/></span>omni<span className="brand-dot">.</span></a><div className="workspace"><span className="workspace-icon"><GraduationCap size={20}/></span><div><strong>Академия TOP</strong><small>{snapshot?.account.branch || 'Подключение к Omni'}</small></div></div><div className="nav-label">МОЁ ПРОСТРАНСТВО</div><nav>{([
      ['lesson', BookOpen, 'Мой урок'], ['schedule', CalendarDays, 'Расписание'], ['groups', Users, 'Ученики'], ['homework', ClipboardCheck, 'Домашние задания'], ['materials', FolderOpen, 'Материалы'],
    ] as const).map(([key, Icon, name]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}><Icon size={19}/>{name}</button>)}</nav><div className="sidebar-tip"><ShieldCheck size={21}/><strong>Ваш аккаунт — ваш браузер</strong><p>Вход выполняется на сайте академии. Пароль не передаётся новому интерфейсу.</p></div><div className="sidebar-bottom"><button onClick={onDemo}><History size={17}/>Открыть демо отдельно</button><div className="profile"><span className="avatar purple">{snapshot?.account.name.charAt(0) || 'П'}</span><div><strong>{snapshot?.account.name || 'Аккаунт не подключён'}</strong><small>{snapshot ? 'Реальные данные Omni' : 'Войдите для начала работы'}</small></div></div></div></aside>
    <main><header className="topbar"><div className="breadcrumb"><strong>Рабочее пространство преподавателя</strong></div><span className={`demo-badge ${snapshot && !authNeeded ? 'connected-badge' : ''}`}><span/>{snapshot ? 'Omni подключён' : 'Подключение к Omni'}</span></header><div className="page-content">
      <div className="live-mobile-nav"><select aria-label="Раздел" value={tab} onChange={event => setTab(event.target.value as Tab)}><option value="lesson">Мой урок</option><option value="schedule">Расписание</option><option value="groups">Ученики</option><option value="homework">Домашние задания</option><option value="materials">Материалы</option></select><button className="text-button" onClick={onDemo}>Демо</button></div>
      <div className="page-heading live-heading"><div><div className="eyebrow">{snapshot?.account.branch || 'ВАШ НОВЫЙ OMNI'}</div><h1>{snapshot ? 'Ваше рабочее пространство' : 'Подключим вашу академию'}<span className="heading-dot">.</span></h1><p>{snapshot ? snapshot.account.name : 'Тот же аккаунт. Более удобный интерфейс.'}</p></div>{snapshot && <button className="button secondary" disabled={busy} onClick={() => void refresh()}><RefreshCw size={16} className={busy ? 'spin' : ''}/>Обновить</button>}</div>
      {error && <div className="warning" role="alert">{error}<button className="text-button" disabled={busy} onClick={() => void (authNeeded ? connect() : snapshot ? refresh() : connect())}>{authNeeded ? 'Открыть вход' : 'Повторить'}</button></div>}
      {switchingTeacher && <section className="panel connection-card" role="status"><LoaderCircle className="spin" size={26}/><h2>Переключаю преподавателя…</h2><p>Загружаю его расписание, группы и домашние задания.</p></section>}
      {!snapshot && !switchingTeacher && <section className="panel connection-card"><span className="lesson-icon"><LogIn size={26}/></span><h2>{waiting ? 'Завершите вход в окне Omni' : 'Войдите через официальный сайт'}</h2><p>{waiting ? connectionState === 'challenge' ? 'Omni просит проверить браузер. Пройдите проверку в открывшемся Edge — подключение продолжится автоматически.' : 'Введите логин и пароль в открывшемся Edge. Когда вход завершится, данные появятся здесь.' : 'Откроется отдельное окно Edge. Если вы уже вошли в Omni в окне подключения, используем эту сессию.'}</p><button className="button primary" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle className="spin" size={17}/> : <LogIn size={17}/>} {waiting ? 'Проверить подключение' : 'Подключить Omni'}</button><div className="connection-help"><ShieldCheck size={16}/>Сессия остаётся на этом компьютере. Демо-данные не попадают в реальный аккаунт.</div><button className="text-button" onClick={onDemo}>Пока посмотреть демонстрацию<ArrowRight size={15}/></button></section>}
      {snapshot && <>
        <section className="panel teacher-switcher"><label htmlFor="teacher-choice"><Users size={18}/><span>Работаю от имени<small>Преподаватели, доступные в вашем аккаунте Omni</small></span></label><select id="teacher-choice" value={snapshot.account.id} disabled={busy || !teachers.length} onChange={event => void switchTeacher(event.target.value)}>{!teachers.some(teacher => label(teacher.id_teach) === snapshot.account.id) && <option value={snapshot.account.id}>{snapshot.account.name}</option>}{teachers.map(teacher => <option key={label(teacher.id_teach)} value={label(teacher.id_teach)}>{label(teacher.fio_teach)}</option>)}</select>{snapshot.teachers?.error && <span role="alert">{snapshot.teachers.error}</span>}</section>
        <section className="lesson-banner"><span className="lesson-icon"><BookOpen size={25}/></span><div className="lesson-description"><div className="lesson-meta"><span>РЕАЛЬНЫЕ ДАННЫЕ</span><span>{selectedDate}</span></div><h2>{label(lessonStudents[0]?.theme) || (lessonStudents.length ? 'Текущее занятие' : 'Omni не вернул текущую пару')}</h2><div className="lesson-time">Обновлено {new Date(snapshot.fetchedAt).toLocaleTimeString('ru-RU')} · {snapshot.account.branch}</div></div><button className="button secondary" onClick={exportSnapshot}><Download size={15}/>Экспорт снимка</button></section>
        <div className="live-readonly"><ShieldCheck size={15}/>Подключено чтение данных. Выставление оценок и отправка заданий будут доступны после проверки на действующем уроке.</div>
        {busy && <div role="status" className="live-loading"><LoaderCircle className="spin" size={17}/>Загружаю данные Omni…</div>}
        {tab === 'lesson' && <section className="panel"><div className="panel-heading"><div><h2>Присутствующие</h2><p>{lessonStudents.length ? `${lessonStudents.length} учеников · данные академии` : 'Показываем только то, что вернул сервер Omni'}</p></div><button className="button secondary" disabled={busy || !selectedDate} onClick={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}><RefreshCw size={15}/>Загрузить урок</button></div>{rows(presentData.groups).length > 0 && <div className="live-group-buttons">{rows(presentData.groups).map(group => <button className="button secondary" disabled={busy} key={label(group.id_tgroups)} onClick={() => void loadLesson(label(group.id_tgroups), label(presentData.cur_lenta))}>{label(group.name_tgroups)}</button>)}</div>}{snapshot.presents.error ? <SectionView section={snapshot.presents}/> : lessonStudents.length ? studentTable(lessonStudents) : <Empty title="Сейчас нет доступного занятия" text="Это ответ Omni для вашего аккаунта. Когда появится пара, нажмите «Загрузить урок». Здесь не будут подставляться демонстрационные ученики."/>}</section>}
        {tab === 'schedule' && <section className="panel"><div className="panel-heading"><div><h2>Расписание</h2><p>{label(record(schedule.start_end).monday)} — {label(record(schedule.start_end).sunday)}</p></div><div className="live-week"><button className="button secondary" aria-label="Предыдущая неделя" disabled={busy || week <= -52} onClick={() => void refresh(week - 1)}>←</button><button className="button secondary" disabled={busy} onClick={() => void refresh(0)}>Эта неделя</button><button className="button secondary" aria-label="Следующая неделя" disabled={busy || week >= 52} onClick={() => void refresh(week + 1)}>→</button></div></div>{snapshot.schedule.error ? <SectionView section={snapshot.schedule}/> : <ScheduleView data={schedule} today={today}/>}</section>}
        {tab === 'groups' && <section className="panel"><div className="panel-heading"><div><h2>{groupName || 'Мои группы'}</h2><p>Группы и ученики, доступные вашему аккаунту</p></div></div>{snapshot.groups.error ? <SectionView section={snapshot.groups}/> : groups.length ? <><div className="live-group-buttons">{groups.map((group, index) => <button className="button secondary" disabled={busy || !group.id_tgroups} key={label(group.id_tgroups) || index} onClick={() => void openGroup(group)}>{label(group.name_tgroups) || 'Группа'}</button>)}</div>{groupStudents && (rows(groupStudents.data).length ? studentTable(rows(groupStudents.data)) : <Empty title="В группе нет доступных учеников" text="Omni вернул пустой список."/>)}</> : <Empty title="Omni пока не возвращает группы" text="Подключение работает. Список групп пуст в самом аккаунте академии."/>}</section>}
        {tab === 'homework' && <section className="panel"><div className="panel-heading"><div><h2>Домашние задания</h2><p>Непроверенных ДЗ: {snapshot.counts.homework} · Практических: {snapshot.counts.practice}</p></div></div><SectionView section={snapshot.newHomework} emptyTitle="Новых работ нет"/><details className="live-details"><summary>Группы для проверки домашних заданий</summary><SectionView section={snapshot.homework} emptyTitle="Доступных групп нет"/></details></section>}
        {tab === 'materials' && <>
          <TeachingMaterials key={`${snapshot.account.id}:${snapshot.account.branch}`} accountId={snapshot.account.id} disabled={busy} onConnectionError={failed}/>
          <section className="panel"><div className="panel-heading"><div><h2>Выданные ДЗ и материалы текущего урока</h2><p>Файлы, связанные с текущей группой, датой и парой</p></div><button className="button secondary" disabled={busy || !selectedDate || !presentData.cur_group} onClick={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}><RefreshCw size={15}/>Загрузить выданные материалы</button></div>{!presentData.cur_group ? <Empty title="Текущая пара не выбрана" text="Выданные ученикам файлы появятся после загрузки занятия. Методички для подготовки доступны в каталоге выше."/> : <><h3 className="live-section-title">Выданные материалы</h3><SectionView fileFallback="pdf" section={lesson?.materials || emptySection} emptyTitle={lesson ? 'Материалов нет' : 'Нажмите «Загрузить выданные материалы»'}/><h3 className="live-section-title">Выданное домашнее задание</h3><SectionView section={lesson?.homework || emptySection} emptyTitle={lesson ? 'ДЗ не выдано' : 'Нажмите «Загрузить выданные материалы»'}/></>}</section>
        </>}
        <div className="bottom-actions"><span><ShieldCheck size={17}/>При ошибке данные остаются на экране, страница не перезагружается.</span><button className="button secondary" disabled={busy} onClick={() => void connect()}><ExternalLink size={15}/>Открыть окно Omni</button></div>
      </>}
      <footer className="page-footer"><span>omni workspace</span><span>Больше внимания ученикам.</span><span>Локальное подключение</span></footer>
    </div></main>
    {detail && <dialog ref={dialog} onCancel={() => setDetail(null)} aria-label={detail.title}><div className="modal-header"><h2>{detail.title}</h2><button className="icon" aria-label="Закрыть" onClick={() => setDetail(null)}><X size={20}/></button></div><div className="modal-body">{detail.sections.map((section, index) => <SectionView key={index} section={section}/>)}</div></dialog>}
    {notice && <div className="toast" role="status"><CheckCheck size={17}/>{notice}<button className="icon" aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={16}/></button></div>}
  </div>;
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

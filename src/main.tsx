import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, BookOpen, Check, CheckCheck, ChevronRight, CircleHelp, ClipboardCheck, Clock3, Copy, Download, FileText, FolderOpen, GraduationCap, History, LayoutDashboard, Menu, MessageSquare, Search, ShieldCheck, Sparkles, Upload, Users, X } from 'lucide-react';
import { materials, previousLesson, sampleCode, students, type Entry, type Student } from './data';
import { demoRepository } from './storage';
import './styles.css';
import { FilePreview } from './FilePreview';
import { LiveWorkspace } from './LiveWorkspace';

type View = 'lesson' | 'homework' | 'materials' | 'history';
const average = (marks: number[]) => marks.reduce((sum, mark) => sum + mark, 0) / marks.length;
const format = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
function App() {
  const [loaded] = useState(() => demoRepository.load());
  const [lesson, setLesson] = useState(loaded.lesson);
  const [view, setView] = useState<View>('lesson');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<Student | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageError, setStorageError] = useState(loaded.error);
  const [saved, setSaved] = useState(false);
  const [archive, setArchive] = useState(demoRepository.getArchive);
  const [mobileNav, setMobileNav] = useState(false);
  const [reviewStudent, setReviewStudent] = useState(students[0].id);
  const [preview, setPreview] = useState<{ title: string; content: string } | null>(null);
  const [filePreview, setFilePreview] = useState<{ name: string; text?: string; url?: string; type?: string } | null>(null);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const presentCount = Object.values(lesson.entries).filter(entry => entry.present).length;
  const markedCount = Object.values(lesson.entries).filter(entry => entry.mark).length;
  const visibleStudents = students.filter(student => student.name.toLowerCase().includes(query.toLowerCase()));
  const review = lesson.reviews[reviewStudent] || { mark: '', comment: '' };
  useEffect(() => {
    try { demoRepository.save(lesson); setSaved(true); } catch { setStorageError(true); setSaved(false); }
  }, [lesson]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => () => { if (filePreview?.url) URL.revokeObjectURL(filePreview.url); }, [filePreview]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (!saved) event.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saved]);
  const updateEntry = (id: string, patch: Partial<Entry>) => { setSaved(false); setLesson(current => ({ ...current, entries: { ...current.entries, [id]: { ...current.entries[id], ...patch } } })); };
  const updateReview = (patch: Partial<typeof review>) => setLesson(current => ({ ...current, reviews: { ...current.reviews, [reviewStudent]: { ...(current.reviews[reviewStudent] || { mark: '', comment: '' }), ...patch } } }));
  const navigate = (next: View) => { setView(next); setMobileNav(false); setQuery(''); };
  const saveArchive = () => {
    try { demoRepository.archive(lesson); setArchive(demoRepository.getArchive()); setNotice('Снимок урока сохранён в этом браузере'); } catch { setNotice('Не удалось сохранить снимок. Экспортируйте урок в файл.'); }
  };
  const exportLesson = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ mode: 'demo', lesson, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'omni-demo-lesson.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openFile = async (file?: File) => {
    if (!file) return;
    setFileError('');
    if (file.size > 20 * 1024 * 1024) { setFileError('Для предпросмотра выберите файл до 20 МБ.'); return; }
    try {
      if (/\.(png|jpe?g|gif|webp)$/i.test(file.name) && file.type.startsWith('image/')) setFilePreview({ name: file.name, url: URL.createObjectURL(file), type: 'image' });
      else if (file.type === 'application/pdf') setFilePreview({ name: file.name, url: URL.createObjectURL(file), type: 'pdf' });
      else if (/\.(txt|md|css|js|ts|tsx|jsx|html|json|py|csv|xml|yml|yaml)$/i.test(file.name)) {
        if (file.size > 1024 * 1024) { setFileError('Текстовый предпросмотр ограничен 1 МБ.'); return; }
        setFilePreview({ name: file.name, text: await file.text() });
      } else setFileError('Поддерживаются PDF, изображения, текст и код. Архивы и офисные документы пока не поддерживаются.');
    } catch { setFileError('Не удалось прочитать файл. Попробуйте выбрать его снова.'); }
  };
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'mobile-open' : ''}`}>
      <a className="brand" href="#" onClick={event => { event.preventDefault(); navigate('lesson'); }}><span className="brand-symbol">o<span /></span>omni<span className="brand-dot">.</span></a>
      <div className="workspace"><span className="workspace-icon"><GraduationCap size={20}/></span><div><strong>Академия TOP</strong><small>Пространство преподавателя</small></div></div>
      <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
      <nav>
        <button className={view === 'lesson' ? 'selected' : ''} onClick={() => navigate('lesson')}><LayoutDashboard size={19}/>Мой урок<span className="live-dot"/></button>
        <button className={view === 'homework' ? 'selected' : ''} onClick={() => navigate('homework')}><ClipboardCheck size={19}/>Проверка ДЗ<span className="nav-count">{students.length - Object.values(lesson.reviews).filter(item => item.mark).length}</span></button>
        <button className={view === 'materials' ? 'selected' : ''} onClick={() => navigate('materials')}><FolderOpen size={19}/>Материалы</button>
        <button className={view === 'history' ? 'selected' : ''} onClick={() => navigate('history')}><History size={19}/>История уроков</button>
      </nav>
      <div className="sidebar-tip"><Sparkles size={20}/><strong>Всё для вашего урока</strong><p>Ученики, оценки и материалы — в одном пространстве.</p><span>Меньше кликов. Больше внимания.</span></div>
      <div className="sidebar-bottom"><button onClick={() => setPreview({ title: 'О демонстрационном режиме', content: 'Это самостоятельный прототип интерфейса. Все ученики, оценки и материалы вымышлены.\n\nИзменения сохраняются только в этом браузере. Отправка в Omni ещё не подключена.\n\nВ разделе проверки ДЗ можно открыть свой локальный файл. Он не загружается на сервер.\n\nЧтобы сохранить резервную копию урока, используйте «Экспорт JSON» в истории.' })}><CircleHelp size={18}/>Как это работает</button><div className="profile"><span className="avatar purple">П</span><div><strong>Преподаватель</strong><small>Демонстрационный профиль</small></div></div></div>
    </aside>
    <main>
      <header className="topbar"><div className="breadcrumb"><button className="icon mobile-toggle" aria-label="Открыть меню" onClick={() => setMobileNav(!mobileNav)}><Menu size={20}/></button><span>Рабочее пространство</span><ChevronRight size={14}/><strong>{{ lesson: 'Мой урок', homework: 'Проверка ДЗ', materials: 'Материалы', history: 'История уроков' }[view]}</strong></div><span className="demo-badge"><span/>Демо · без связи с Omni</span></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">ВТОРНИК, 15 СЕНТЯБРЯ · ДЕМО-УРОК</div><h1>{view === 'lesson' ? 'Хороший день для новых знаний' : view === 'homework' ? 'Обратная связь, которая помогает' : view === 'materials' ? 'Всё, что вы дали ученикам' : 'Уроки остаются с вами'}<span className="heading-dot">.</span></h1><p>{view === 'lesson' ? 'Всё необходимое для занятия — здесь, под рукой.' : view === 'homework' ? 'Работа ученика, оценка и комментарий на одном экране.' : view === 'materials' ? 'Содержимое и получатели без поиска по разделам.' : 'Локальные снимки и резервные копии вашего прогресса.'}</p></div></div>
        {storageError && <div className="warning" role="alert">Не удалось прочитать или сохранить часть локальных данных. Сделайте экспорт урока; проверьте разрешения и свободное место браузера.</div>}
        <section className="lesson-banner"><div className="lesson-icon"><BookOpen size={26}/></div><div className="lesson-description"><div className="lesson-meta"><span>WEB-241</span><span>Веб-разработка</span><span className="separator">/</span><span>Урок 12</span></div><h2>{lesson.topic}</h2><div className="lesson-time"><Clock3 size={14}/>18:30 – 20:00<span>·</span>Аудитория 305<span>·</span>{students.length} учеников</div></div><span className="lesson-status"><span/>Учебный пример</span></section>
        {view === 'lesson' && <>
          <div className="lesson-tabs"><button className="active"><Users size={17}/>Присутствующие<span>{students.length}</span></button><button onClick={() => navigate('materials')}><FolderOpen size={17}/>ДЗ и материалы<span>2</span></button><div className="autosave"><ShieldCheck size={15}/>{saved ? 'Черновик в браузере' : 'Не сохранено'}</div></div>
          <div className="lesson-layout"><section className="panel students-panel"><div className="panel-heading"><div><h2>Ученики на занятии</h2><p>Отмечайте присутствие и оценивайте работу</p></div><button className="button secondary" onClick={() => { setOverwrite(false); setCopyOpen(true); }}><Copy size={15}/>С прошлого урока</button></div>
            <div className="table-toolbar"><label className="search"><Search size={17}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти ученика…" aria-label="Найти ученика"/></label><button className="text-button" onClick={() => setLesson(current => ({ ...current, entries: Object.fromEntries(Object.entries(current.entries).map(([id, entry]) => [id, { ...entry, present: true }])) }))}><CheckCheck size={16}/>Все присутствуют</button></div>
            <div className="table-scroll"><table><thead><tr><th className="number">№</th><th>УЧЕНИК</th><th>ПРИСУТСТВИЕ</th><th>ОЦЕНКА</th><th>СР. БАЛЛ</th><th/></tr></thead><tbody>{visibleStudents.map(student => <tr key={student.id}><td className="number">{students.indexOf(student) + 1}</td><td><button className="student-name" onClick={() => setActive(student)}><span className={`avatar ${student.color}`}>{student.initials}</span><span>{student.name}<small className="hover-hint">Статистика ученика</small></span></button><div className="hover-card"><strong>{student.name}</strong><span>Средний балл: {format(average(student.marks))}</span><span>Посещаемость: {student.attendance}% · ДЗ: {student.homework}/9</span><span>Нажмите на имя для расчёта оценки</span></div></td><td><button className={`presence ${lesson.entries[student.id].present ? 'present' : 'absent'}`} aria-label={`Присутствие: ${student.name}`} aria-pressed={lesson.entries[student.id].present} onClick={() => updateEntry(student.id, { present: !lesson.entries[student.id].present })}>{lesson.entries[student.id].present ? <Check size={14}/> : <span className="absent-dot"/>}{lesson.entries[student.id].present ? 'Присутствует' : 'Отсутствует'}</button></td><td><select aria-label={`Оценка: ${student.name}`} className={`mark-select ${lesson.entries[student.id].mark ? 'has-mark' : ''}`} value={lesson.entries[student.id].mark} onChange={event => updateEntry(student.id, { mark: event.target.value })}><option value="">—</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></td><td><span className={`average ${average(student.marks) >= 10 ? 'high' : ''}`}>{format(average(student.marks))}</span></td><td><button className={`icon ${lesson.entries[student.id].comment ? 'commented' : ''}`} aria-label={`Комментарий: ${student.name}`} onClick={() => setActive(student)}><MessageSquare size={16}/></button></td></tr>)}</tbody></table>{!visibleStudents.length && <div className="empty">Никого не нашли. Попробуйте другое имя.</div>}</div>
            <div className="table-footer"><span><span className="green-dot"/>{presentCount} из {students.length} присутствуют</span><span>Оценено {markedCount} из {students.length}</span></div>
          </section><aside className="right-column"><section className="panel progress-panel"><div className="section-label">ПУЛЬС УРОКА <span className="green-dot"/></div><div className="progress-number">{presentCount}<span> / {students.length}</span><span className="percent">{Math.round(presentCount / students.length * 100)}%</span></div><div className="progress-bar"><span style={{ width: `${presentCount / students.length * 100}%` }}/></div><p>учеников присутствуют</p><div className="mini-stats"><div><strong>{markedCount}</strong><span>оценок за урок</span></div><div><strong>{Object.values(lesson.entries).filter(entry => entry.comment).length}</strong><span>комментариев</span></div></div></section>
            <section className="panel materials-panel"><div className="panel-heading"><h3>Материалы урока</h3><FolderOpen size={17}/></div><p className="muted">Примеры отправленных материалов</p>{materials.map(material => <button className="material-item" key={material.id} onClick={() => setPreview({ title: material.title, content: material.content })}><span className={`file-icon ${material.id === 'guide' ? 'purple' : 'orange'}`}><FileText size={19}/></span><span><small>{material.type}</small><strong>{material.title}</strong><em>Открыть содержимое <ArrowRight size={12}/></em></span></button>)}<button className="all-materials" onClick={() => navigate('materials')}>Все материалы<ArrowRight size={15}/></button></section>
            <div className="gentle-tip"><Sparkles size={19}/><div><strong>За оценкой — человек</strong><p>Наведите на имя ученика, чтобы увидеть статистику. Нажмите, чтобы оценить влияние нового балла.</p></div></div>
          </aside></div>
          <div className="bottom-actions"><span><ShieldCheck size={17}/>Прогресс сохраняется локально. В Omni ничего не отправляется.</span><button className="button primary" onClick={saveArchive}><Check size={17}/>Сохранить снимок урока</button></div>
        </>}
        {view === 'materials' && <div className="material-grid">{materials.map(material => <section className="panel resource-card" key={material.id}><span className="file-icon purple"><FileText size={24}/></span><span className="eyebrow">{material.type}</span><h2>{material.title}</h2><p>{material.description}</p><div className="recipient-list"><Users size={16}/>Получатели в примере: все 8 учеников</div><details><summary>Показать получателей</summary>{students.map(student => <p key={student.id}>{student.name}</p>)}</details><button className="button secondary" onClick={() => setPreview({ title: material.title, content: material.content })}>Посмотреть содержимое<ArrowRight size={16}/></button></section>)}</div>}
        {view === 'homework' && <section className="panel review-layout"><aside className="submission-list"><h3>Работы учеников <span>{students.length}</span></h3>{students.map(student => <button className={reviewStudent === student.id ? 'chosen' : ''} key={student.id} onClick={() => { setReviewStudent(student.id); setFilePreview(null); setFileError(''); }}><span className={`avatar ${student.color}`}>{student.initials}</span><span><strong>{student.name}</strong><small>{lesson.reviews[student.id]?.mark ? `Черновик оценки: ${lesson.reviews[student.id].mark}` : 'Демо-работа · CSS'}</small></span>{lesson.reviews[student.id]?.mark && <Check size={15}/>}</button>)}</aside><div className="review-main"><div className="panel-heading"><div><h2>Адаптивная галерея</h2><p>Демонстрационный файл · gallery.css</p></div><button className="button secondary" onClick={() => fileInput.current?.click()}><Upload size={15}/>Открыть свой файл</button><input ref={fileInput} type="file" hidden onChange={event => { void openFile(event.target.files?.[0]); event.target.value = ''; }}/></div><div className="preview-toolbar"><FileText size={15}/>{filePreview?.name || 'gallery.css'}<span>{filePreview ? 'Локальный файл · не отправляется' : 'Пример ответа ученика'}</span>{filePreview && <button className="icon" aria-label="Закрыть локальный файл" onClick={() => setFilePreview(null)}><X size={16}/></button>}</div>{fileError && <div className="warning" role="alert">{fileError}</div>}<div className={filePreview?.url ? 'local-file-preview' : 'code-preview'}>{filePreview?.url ? <FilePreview key={filePreview.url} url={filePreview.url} filename={filePreview.name} mime={filePreview.type === 'pdf' ? 'application/pdf' : 'image/png'} localObjectUrl/> : <pre><code>{filePreview?.text ?? sampleCode}</code></pre>}</div><div className="review-form"><h3>Оценка за работу</h3><div className="grade-buttons">{Array.from({ length: 12 }, (_, index) => <button key={index} className={review.mark === String(index + 1) ? 'chosen' : ''} onClick={() => updateReview({ mark: review.mark === String(index + 1) ? '' : String(index + 1) })}>{index + 1}</button>)}</div><label>Комментарий ученику<textarea placeholder="Что получилось хорошо? На что обратить внимание?" value={review.comment} onChange={event => updateReview({ comment: event.target.value })}/></label><div className="review-note"><ShieldCheck size={15}/>Оценка и комментарий — локальный черновик, ученик их не видит.</div></div></div></section>}
        {view === 'history' && <section className="panel history-panel"><div className="panel-heading"><div><h2>История в этом браузере</h2><p>Храним последний вручную сохранённый снимок демо-урока.</p></div><button className="button secondary" onClick={exportLesson}><Download size={16}/>Экспорт JSON</button></div>{archive ? <div className="archive-row"><span className="lesson-icon"><History size={24}/></span><div><h3>{archive.lesson.topic}</h3><p>Снимок от {new Date(archive.savedAt).toLocaleString('ru-RU')} · {Object.values(archive.lesson.entries).filter(entry => entry.mark).length} оценок</p></div><button className="button secondary" onClick={() => setPreview({ title: 'Сохранённый снимок', content: students.map(student => { const entry = archive.lesson.entries[student.id]; return `${student.name}: ${entry.present ? 'присутствует' : 'отсутствует'}, оценка ${entry.mark || 'не выставлена'}${entry.comment ? '\nКомментарий: ' + entry.comment : ''}`; }).join('\n\n') })}>Посмотреть</button></div> : <div className="empty"><History size={32}/><h3>Первый урок ещё впереди</h3><p>Сохраните снимок на странице «Мой урок» — он появится здесь.</p><button className="button primary" onClick={() => navigate('lesson')}>К уроку<ArrowRight size={16}/></button></div>}<div className="history-note">Очистка данных браузера удалит черновики и снимок. Экспорт сохраняет текущий урок в отдельный файл.</div></section>}
        <footer className="page-footer"><span>omni workspace</span><span>Создано, чтобы преподавать было удобнее.</span><span>Прототип 0.1</span></footer>
      </div>
    </main>
    {active && <Modal title="Карточка ученика" onClose={() => setActive(null)}><div className="student-detail"><span className={`avatar large ${active.color}`}>{active.initials}</span><h2>{active.name}</h2><p>WEB-241 · Демонстрационные данные</p></div><div className="detail-stats"><div><strong>{format(average(active.marks))}</strong><span>средний балл</span></div><div><strong>{active.attendance}%</strong><span>посещаемость</span></div><div><strong>{active.homework}/9</strong><span>сдано ДЗ</span></div></div><h3>Последние оценки</h3><div className="grade-history">{active.marks.map((mark, index) => <span key={index}>{mark}</span>)}</div><label className="field">Оценка за этот урок<select value={lesson.entries[active.id].mark} onChange={event => updateEntry(active.id, { mark: event.target.value })}><option value="">Не выставлена</option>{Array.from({ length: 12 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>{lesson.entries[active.id].mark && <div className="impact"><Sparkles size={18}/><div>Средний балл: <strong>{format(average(active.marks))} → {format(average([...active.marks, Number(lesson.entries[active.id].mark)]))}</strong><small>Простое среднее по 5 демо-оценкам и новой оценке. Не рейтинг Omni.</small></div></div>}<label className="field">Заметка об ученике<textarea value={lesson.entries[active.id].comment} onChange={event => updateEntry(active.id, { comment: event.target.value })} placeholder="Например, помочь с адаптивной сеткой"/></label><div className="review-note"><ShieldCheck size={15}/>Сохраняется в браузере автоматически.</div></Modal>}
    {copyOpen && <Modal title="Скопировать с прошлого урока" onClose={() => setCopyOpen(false)}><p className="muted">Демонстрационный предыдущий урок · WEB-241. Копируются присутствие и оценки, сопоставление — по ID ученика.</p><label className="checkbox-label"><input type="checkbox" checked={overwrite} onChange={event => setOverwrite(event.target.checked)}/>Заменить уже выставленные оценки</label><div className="copy-list">{students.map(student => <div key={student.id}><span>{student.name}</span><span>{previousLesson[student.id].present ? 'Был(а)' : 'Отсутствовал(а)'}</span><strong>{lesson.entries[student.id].mark || '—'} → {overwrite || !lesson.entries[student.id].mark ? previousLesson[student.id].mark : `${lesson.entries[student.id].mark} (сохранится)`}</strong></div>)}</div><p className="muted">Присутствие будет заменено у всех учеников. Текущие заметки сохранятся.</p><button className="button primary full" onClick={() => { setLesson(current => ({ ...current, entries: Object.fromEntries(students.map(student => [student.id, { ...current.entries[student.id], present: previousLesson[student.id].present, mark: overwrite || !current.entries[student.id].mark ? previousLesson[student.id].mark : current.entries[student.id].mark }])) })); setCopyOpen(false); setNotice('Оценки и присутствие скопированы в локальный черновик'); }}><Copy size={16}/>Применить к черновику</button></Modal>}
    {preview && <Modal title={preview.title} onClose={() => setPreview(null)}><pre className="document-preview">{preview.content}</pre></Modal>}
    {notice && <div className="toast" role="status"><CheckCheck size={18}/>{notice}<button className="icon" aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={16}/></button></div>}
  </div>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog ref={dialog} onCancel={onClose} onClick={event => { if (event.target === dialog.current) onClose(); }} aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="icon" aria-label="Закрыть" onClick={onClose}><X size={20}/></button></div><div className="modal-body">{children}</div></dialog>;
}
function Workspace() {
  const [demo, setDemo] = useState(() => location.hash === '#demo');
  useEffect(() => {
    const update = () => setDemo(location.hash === '#demo');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return demo ? <><div className="demo-return"><button onClick={() => { location.hash = ''; setDemo(false); }}>← Вернуться к реальному Omni</button></div><App/></> : <LiveWorkspace onDemo={() => { location.hash = 'demo'; setDemo(true); }}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Workspace/></React.StrictMode>);

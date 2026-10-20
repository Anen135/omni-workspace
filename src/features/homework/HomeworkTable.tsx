import { AverageGrade } from '../../components/ui/AverageGrade';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { DataTable, type TableColumn } from '../../components/data/DataTable';
import { TableBulkEditor, type BulkField } from '../../components/data/TableBulkEditor';
import { FilePreview } from '../../components/files/FilePreview';
import { label, rows, type RemoteRecord, type Section } from '../../services/omni-client';
import { HOMEWORK_RESPONSE_LIMIT, homeworkGroupName, type HomeworkResponseDraft, type HomeworkReviewItem } from './homework';
import { materialLink } from '../materials/teaching-materials';
import { StudentAvatar } from '../../components/ui/StudentAvatar';
import { studentId } from '../students/students';
import { studentPhotoUrl } from '../students/student-photo';
import './homework.css';

type Grading = {
  busy: boolean;
  unavailable?: string;
  onGrade: (items: HomeworkReviewItem[], mark: number, response?: HomeworkResponseDraft) => Promise<{ confirmedKeys: string[] }>;
};
type SortField = 'studentName' | 'groupName' | 'theme' | 'submittedAt' | 'mark';
type Selection = { data: HomeworkReviewItem[]; keys: Set<string> };
type ResponseEdit = { comment: string; mark: string };

function HomeworkPreview({ name, open, onOpen, onClose, children }: {
  name: string; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyboardFocus = useRef(false);
  const pointerType = useRef('');
  const skipFocus = useRef(false);
  const dismissedHover = useRef(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => clearTimeout(timer.current);
  const show = () => { cancelClose(); onOpen(); };
  const leave = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!keyboardFocus.current && !trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) onClose();
    }, 180);
  };
  const blur = (target: EventTarget | null) => {
    if (target instanceof Node && (trigger.current?.contains(target) || panel.current?.contains(target))) return;
    keyboardFocus.current = false;
    leave();
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
        top: anchor.bottom + box.height + 16 <= window.innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(trigger.current!) && !path.includes(panel.current!)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Removing a card over its trigger can generate pointerenter without any mouse movement.
      dismissedHover.current = true;
      const tree = trigger.current?.getRootNode() as Document | ShadowRoot | undefined;
      if (panel.current?.contains(tree?.activeElement || null)) {
        skipFocus.current = true;
        trigger.current?.focus();
        skipFocus.current = false;
      }
      cancelClose(); onClose();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);
  const tree = trigger.current?.getRootNode();
  return <>
    <button ref={trigger} type="button" className="homework-preview-button" aria-label={'Превью работы: ' + name}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerDown={event => { pointerType.current = event.pointerType; }}
      onPointerEnter={event => { if (event.pointerType !== 'touch' && !dismissedHover.current) show(); }}
      onPointerLeave={() => { dismissedHover.current = false; leave(); }}
      onFocus={event => {
        if (!skipFocus.current && event.currentTarget.matches(':focus-visible')) { keyboardFocus.current = true; show(); }
      }} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => {
        if (open && event.key === 'Tab' && !event.shiftKey) {
          const first = panel.current?.querySelector<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
          if (first) { event.preventDefault(); first.focus(); }
        }
      }}
      onClick={event => {
        if (pointerType.current === 'touch' || event.detail === 0) { cancelClose(); if (open) onClose(); else show(); }
        else show();
      }}><Eye size={17} aria-hidden="true"/></button>
    {open && createPortal(<div ref={panel} id={id} className="homework-details homework-quick-preview" role="region"
      aria-label={'Превью работы: ' + name} style={position}
      onPointerEnter={cancelClose} onPointerLeave={leave}
      onFocus={() => { keyboardFocus.current = true; cancelClose(); }} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
        if (event.shiftKey && event.target === controls?.[0]) { event.preventDefault(); trigger.current?.focus(); }
        else if (!event.shiftKey && event.target === controls?.[controls.length - 1]) { trigger.current?.focus(); onClose(); }
      }}>{children}</div>, tree instanceof ShadowRoot ? tree : document.body)}
  </>;
}

function ResponseEditor({ item, name, disabled, readOnly, draft, onChange, onSave }: {
  item: HomeworkReviewItem; name: string; disabled: boolean; readOnly: boolean; draft: ResponseEdit;
  onChange: (draft: ResponseEdit) => void; onSave: (mark: number, response: HomeworkResponseDraft) => Promise<void>;
}) {
  const previousComment = item.source.comment ?? null;
  const baselineValid = previousComment === null || typeof previousComment === 'string' && previousComment.length <= HOMEWORK_RESPONSE_LIMIT;
  const mark = Number(draft.mark);
  const valid = draft.mark.trim() !== '' && Number.isInteger(mark) && mark >= 1 && mark <= 12 && draft.comment.length <= HOMEWORK_RESPONSE_LIMIT;
  const changed = draft.comment !== (previousComment ?? '') || mark !== item.mark;
  const locked = disabled || readOnly || !baselineValid;
  const helpId = useId();
  return <form className="homework-response-editor" onSubmit={event => {
    event.preventDefault();
    if (!locked && valid && changed) void onSave(mark, { comment: draft.comment, previousComment: previousComment as string | null });
  }}>
    <label>Ответ преподавателя<textarea aria-label={'Ответ преподавателя: ' + name} aria-describedby={helpId} rows={4} maxLength={HOMEWORK_RESPONSE_LIMIT} value={draft.comment} disabled={disabled} readOnly={readOnly || !baselineValid} onChange={event => onChange({ ...draft, comment: event.target.value })}/></label>
    <p id={helpId} className="homework-muted">{baselineValid ? 'Ответ сохраняется вместе с оценкой от 1 до 12. До 4000 символов.' : 'Редактирование этого ответа недоступно. Проверьте работу в Omni.'}</p>
    <div className="homework-response-actions"><label>Оценка<input type="number" aria-label={'Оценка к ответу преподавателя: ' + name} min={1} max={12} step={1} value={draft.mark} disabled={locked} onChange={event => onChange({ ...draft, mark: event.target.value })}/></label>
      <button type="submit" className="button primary" disabled={locked || !valid || !changed}>Сохранить ответ и оценку</button></div>
  </form>;
}

function studentFilterKey(item: HomeworkReviewItem): string {
  return item.studentId ? 'id:' + item.studentId : 'view:' + JSON.stringify([item.studentName, item.groupName]);
}

function fallbackItems(data: unknown): HomeworkReviewItem[] {
  return rows(data).map((source, index) => ({
    key: 'readonly-' + index,
    studentId: label(source.id_stud || source.student_id),
    studentName: label(source.fio_stud || source.student_name),
    groupName: homeworkGroupName(source),
    subject: label(source.name_spec || source.spec_name || source.subject),
    theme: label(source.theme || source.title),
    submittedAt: label(source.date_upload || source.date_create || source.submitted_at),
    mark: Number.isFinite(Number(source.mark)) && label(source.mark) !== '' ? Number(source.mark) : null,
    source,
    canGrade: false,
  }));
}

function pick(item: RemoteRecord, keys: string[]): RemoteRecord {
  return Object.fromEntries(keys.filter(key => key in item).map(key => [key, item[key]]));
}

function GradeEditor({ item, name, disabled, onSave }: {
  item: HomeworkReviewItem; name: string; disabled: boolean; onSave: (mark: number) => Promise<void>;
}) {
  const [value, setValue] = useState(item.mark === null ? '' : String(item.mark));
  useEffect(() => { setValue(item.mark === null ? '' : String(item.mark)); }, [item.key, item.mark]);
  const mark = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(mark) && mark >= 1 && mark <= 12;
  const changed = valid && mark !== item.mark;
  return <form className="homework-grade-editor" onSubmit={event => { event.preventDefault(); if (!disabled && changed) void onSave(mark); }}>
    <input type="number" aria-label={'Оценка: ' + name} title="Введите оценку от 1 до 12 и нажмите Enter" placeholder="—" min={1} max={12} step={1} value={value} disabled={disabled} onChange={event => setValue(event.target.value)}/>
    {value !== '' && mark !== item.mark && <button type="submit" aria-label={'Сохранить оценку: ' + name} disabled={disabled || !changed}>Сохранить</button>}
  </form>;
}

export function HomeworkTable({ section, render, items: suppliedItems, grading, responseDraftContext, studentAverages, studentPhotos, studentAveragesLoading = false, studentAveragesError }: {
  section: Section; render: (value: unknown) => ReactNode; items?: HomeworkReviewItem[]; grading?: Grading; responseDraftContext?: unknown; studentAverages?: ReadonlyMap<string, string>; studentPhotos?: ReadonlyMap<string, string>; studentAveragesLoading?: boolean; studentAveragesError?: string;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [student, setStudent] = useState('');
  const [sort, setSort] = useState<{ field: SortField; descending: boolean }>({ field: 'studentName', descending: false });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [opened, setOpened] = useState<{ data: HomeworkReviewItem[]; key: string } | null>(null);
  const [previewed, setPreviewed] = useState<{ data: HomeworkReviewItem[]; key: string } | null>(null);
  const [responseDrafts, setResponseDrafts] = useState<{ data: unknown; values: Record<string, ResponseEdit> } | null>(null);
  const submittingRef = useRef(false);
  const tableId = useId();
  const items = useMemo(() => suppliedItems ?? fallbackItems(section.data), [suppliedItems, section.data]);
  const responseContext = responseDraftContext ?? items;
  const currentResponseContext = useRef(responseContext);
  currentResponseContext.current = responseContext;
  // A replacement dataset invalidates selection synchronously, before any event can submit it.
  const selectedKeys = selection?.data === items ? selection.keys : new Set<string>();
  const locked = submitting || !!grading?.busy;
  const gradingAvailable = !!grading && !grading.unavailable && !!suppliedItems;
  const keyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.key, (counts.get(item.key) || 0) + 1);
    return counts;
  }, [items]);
  const canSelect = (item: HomeworkReviewItem) => gradingAvailable && item.canGrade && !!item.studentId && !!item.key && keyCounts.get(item.key) === 1;
  const groups = [...new Set(items.map(item => item.groupName).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
  const students = useMemo(() => {
    const options = new Map<string, { key: string; id: string; name: string; groups: Set<string> }>();
    for (const item of items) {
      if ((!item.studentId && !item.studentName) || (group && group !== item.groupName)) continue;
      const key = studentFilterKey(item);
      const option = options.get(key) ?? { key, id: item.studentId, name: item.studentName || 'Без имени', groups: new Set<string>() };
      if (item.groupName) option.groups.add(item.groupName);
      options.set(key, option);
    }
    return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id, 'ru', { numeric: true }));
  }, [items, group]);
  const duplicateNames = useMemo(() => {
    const names = new Map<string, Set<string>>();
    for (const item of items) {
      const identities = names.get(item.studentName) ?? new Set<string>();
      identities.add(studentFilterKey(item));
      names.set(item.studentName, identities);
    }
    return new Set([...names].filter(([, identities]) => identities.size > 1).map(([name]) => name));
  }, [items]);
  const search = query.trim().toLocaleLowerCase('ru');
  const filtered = items.filter(item => (!group || item.groupName === group) && (!student || studentFilterKey(item) === student) &&
    (!search || [item.studentName, item.studentId, item.groupName, item.subject, item.theme, label(item.source.answer_text)].join(' ').toLocaleLowerCase('ru').includes(search)));
  const eligible = filtered.filter(canSelect);
  const selected = eligible.filter(item => selectedKeys.has(item.key));
  const sorted = [...filtered].sort((a, b) => {
    let difference: number;
    if (sort.field === 'mark') difference = (a.mark ?? -1) - (b.mark ?? -1);
    else if (sort.field === 'submittedAt' && Number.isFinite(Date.parse(a.submittedAt)) && Number.isFinite(Date.parse(b.submittedAt))) difference = Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
    else difference = String(a[sort.field] ?? '').localeCompare(String(b[sort.field] ?? ''), 'ru', { numeric: true });
    return (sort.descending ? -difference : difference) || a.key.localeCompare(b.key);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);


  function resetSelection() {
    setSelection(null); setOpened(null); setPreviewed(null); setPage(1); setMessage(''); setFailure('');
  }
  function toggleRow(item: HomeworkReviewItem, checked: boolean) {
    if (locked || !canSelect(item)) return;
    const keys = new Set(selectedKeys);
    if (checked) keys.add(item.key); else keys.delete(item.key);
    setSelection({ data: items, keys }); setMessage(''); setFailure('');
  }
  function toggleAll(checked: boolean) {
    if (locked) return;
    setSelection({ data: items, keys: new Set(checked ? eligible.map(item => item.key) : []) });
    setMessage(''); setFailure('');
  }
  async function saveGrades(submitted: HomeworkReviewItem[], mark: number, response?: HomeworkResponseDraft) {
    if (locked || submittingRef.current || !grading || !Number.isInteger(mark) || mark < 1 || mark > 12 || !submitted.length || submitted.length > 100 || submitted.some(item => !canSelect(item))) return;
    submittingRef.current = true;
    setSubmitting(true); setMessage(''); setFailure('');
    try {
      const result = await grading.onGrade(submitted, mark, response);
      const confirmed = new Set(result.confirmedKeys);
      const savedCount = submitted.filter(item => confirmed.has(item.key)).length;
      setSelection(previous => previous?.data === items ? { data: items, keys: new Set([...previous.keys].filter(key => !confirmed.has(key))) } : previous);
      if (response) setResponseDrafts(previous => previous?.data === responseContext ? { data: responseContext, values: Object.fromEntries(Object.entries(previous.values).filter(([key]) => !confirmed.has(key))) } : previous);
      if (currentResponseContext.current !== responseContext) return;
      if (savedCount) setMessage('Оценка ' + mark + ' сохранена: ' + savedCount + ' из ' + submitted.length + '.');
      if (savedCount < submitted.length) setFailure('Сохранение ' + (submitted.length - savedCount) + ' работ не подтверждено. Проверьте данные перед повторной отправкой.');
    } catch (reason) {
      if (currentResponseContext.current !== responseContext) return;
      setFailure(reason instanceof Error ? reason.message : 'Не удалось сохранить оценки. Проверьте данные перед повторной отправкой.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  function sortHeading(field: SortField, title: string) {
    return <button type="button" className="homework-sort" disabled={locked} onClick={() => { setSort({ field, descending: sort.field === field && !sort.descending }); setPage(1); }}>{title}<span aria-hidden="true">{sort.field === field ? (sort.descending ? ' ↓' : ' ↑') : ' ↕'}</span></button>;
  }
  function attachments(item: RemoteRecord, studentFile: boolean) {
    const keys = studentFile ? ['download_url_stud'] : ['download_url', 'file_url', 'link'];
    const standalone = !studentFile && materialLink(label(item.filename)) && item.filename !== item.download_url_stud;
    if (!keys.some(key => materialLink(label(item[key]))) && !standalone) return <span className="homework-muted">—</span>;
    // Submission and assignment URLs are separate files; generic metadata does not identify the student's attachment.
    if (studentFile) return render(pick(item, keys));
    const filenameUrl = materialLink(label(item.filename));
    const filenameBelongsHere = !filenameUrl || standalone || keys.some(key => materialLink(label(item[key])) === filenameUrl);
    return render(pick(item, [...keys, ...(filenameBelongsHere ? ['filename'] : []), 'file_name', 'original_name', 'mime_type', 'content_type', 'mime']));
  }


  function rowDetails(item: HomeworkReviewItem, index: number) {
    const selectable = canSelect(item);
    const info = pick(item.source, ['answer_text', 'text', 'description']);
    const responseDraft = responseDrafts?.data === responseContext ? responseDrafts.values[item.key] : undefined;
    const workLabel = (item.studentName || 'Без имени') + ', ' + (item.theme || 'Работа без темы') + ', строка ' + ((currentPage - 1) * pageSize + index + 1);
    const rowKey = item.key + '-' + ((currentPage - 1) * pageSize + index);
    const expanded = opened?.data === items && opened.key === rowKey;
    const previewExpanded = previewed?.data === items && previewed.key === rowKey;
    const detailId = tableId + '-detail-' + index;
    const average = item.studentId ? studentAverages?.get(item.studentId) : undefined;
    const photoId = studentId({ id_stud: item.studentId });
    const photo = studentPhotoUrl(photoId ? studentPhotos?.get(photoId) : undefined) || item.source.photo_pas;
    return { selectable, info, responseDraft, workLabel, rowKey, expanded, previewExpanded, detailId, average, photo };
  }
  const bulkFields: BulkField<HomeworkReviewItem>[] = [{
    id: 'mark', label: 'Оценка', input: { kind: 'number', min: 1, max: 12, step: 1 },
    validate: value => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 12 ? '' : 'Введите целую оценку от 1 до 12.',
    unavailableReason: item => canSelect(item) ? '' : 'Оценка для этой работы недоступна.',
  }];
  const columns: TableColumn<HomeworkReviewItem>[] = [
    { id: 'studentName', heading: sortHeading('studentName', 'Студент'), ariaSort: sort.field === 'studentName' ? (sort.descending ? 'descending' : 'ascending') : 'none', cell: (item, index) => {
      const { photo } = rowDetails(item, index);
      return <><div className="homework-student"><StudentAvatar name={item.studentName} photo={photo}/><div className="homework-student-label"><strong>{item.studentName || 'Студент не указан'}</strong>{item.groupName && <small>{item.groupName}</small>}{duplicateNames.has(item.studentName) && item.studentId && <small>ID {item.studentId}</small>}</div></div></>;
    } },
    { id: 'theme', heading: sortHeading('theme', 'Работа'), ariaSort: sort.field === 'theme' ? (sort.descending ? 'descending' : 'ascending') : 'none', cell: (item, index) => {
      return <>{item.theme || 'Без темы'}{item.subject && <small>{item.subject}</small>}</>;
    } },
    { id: 'submittedAt', heading: sortHeading('submittedAt', 'Отправлено'), ariaSort: sort.field === 'submittedAt' ? (sort.descending ? 'descending' : 'ascending') : 'none', className: 'homework-date', cell: (item, index) => {
      return <>{item.submittedAt || '—'}</>;
    } },
    { id: 'mark', heading: sortHeading('mark', 'Оценка'), ariaSort: sort.field === 'mark' ? (sort.descending ? 'descending' : 'ascending') : 'none', className: 'homework-grade-cell', cell: (item, index) => {
      const { selectable, workLabel } = rowDetails(item, index);
      return <>{selectable ? <GradeEditor item={item} name={workLabel} disabled={locked} onSave={mark => saveGrades([item], mark)}/> : <span className={item.mark === null ? 'homework-muted' : 'homework-mark'}>{item.mark ?? '—'}</span>}</>;
    } },
    { id: 'average', heading: 'Средний балл', className: 'homework-average-cell', cell: (item, index) => {
      const { average } = rowDetails(item, index);
      return <AverageGrade value={average} loading={studentAveragesLoading} error={studentAveragesError}/>;
    } },
    { id: 'preview', heading: <span className="homework-sr-only">Просмотр работы</span>, className: 'homework-open-cell', cell: (item, index) => {
      const { info, workLabel, rowKey, expanded, previewExpanded, detailId } = rowDetails(item, index);
      return <><div className="homework-row-actions"><button type="button" className="homework-text-button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => { setPreviewed(null); setOpened(expanded ? null : { data: items, key: rowKey }); }}>{expanded ? 'Закрыть работу' : 'Открыть работу'}</button><HomeworkPreview name={workLabel} open={previewExpanded} onOpen={() => setPreviewed(previous => previous?.data === items && previous.key === rowKey ? previous : { data: items, key: rowKey })} onClose={() => setPreviewed(previous => previous?.data === items && previous.key === rowKey ? null : previous)}>
              <section className="homework-response"><h4>Ответ студента</h4>{Object.values(info).some(value => label(value)) ? render(info) : <p className="homework-muted">Текст ответа не добавлен.</p>}</section>
              <section><h4>Файл студента</h4>{materialLink(label(item.source.download_url_stud)) ? <FilePreview url={label(item.source.download_url_stud)} inline/> : <span className="homework-muted">—</span>}</section>
            </HomeworkPreview></div></>;
    } },
  ];


  if (section.error) return <div className="warning" role="alert">Не удалось загрузить домашние работы: {section.error}</div>;
  return <div className="homework-review" aria-busy={locked}>
    <div className="homework-filters">
      <label>Студент<select aria-label="Студент домашних работ" value={student} disabled={locked} onChange={event => { setStudent(event.target.value); resetSelection(); }}><option value="">Все студенты</option>{students.map(option => <option key={option.key} value={option.key}>{option.name}{option.groups.size ? ' · ' + [...option.groups].join(', ') : ''}{duplicateNames.has(option.name) && option.id ? ' · ID ' + option.id : ''}</option>)}</select></label>
      <label>Группа<select aria-label="Группа домашних заданий" value={group} disabled={locked} onChange={event => { setGroup(event.target.value); setStudent(''); resetSelection(); }}><option value="">Все группы</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="homework-search">Поиск<input type="search" aria-label="Поиск домашнего задания" placeholder="Имя, группа, тема или предмет" value={query} disabled={locked} onChange={event => { setQuery(event.target.value); resetSelection(); }}/></label>
      {(group || student || query) && <button type="button" className="button secondary" disabled={locked} onClick={() => { setGroup(''); setStudent(''); setQuery(''); resetSelection(); }}>Сбросить</button>}
    </div>
    {gradingAvailable ? <TableBulkEditor contextKey={responseContext} className="homework-bulk" fields={bulkFields} filteredRows={filtered} selectedRows={selected} locked={locked}
      applyLabel={'Поставить оценку'} defaultField="mark" defaultValue="12" valueLabel={'Оценка выбранным'} valueAriaLabel={'Оценка для выбранных работ'}
      onApply={(submitted, _field, value) => saveGrades(submitted, Number(value))}/> : <div className="homework-bulk"><span>Работы: <strong>{filtered.length}</strong>{filtered.length !== items.length && <span className="homework-muted"> из {items.length}</span>}</span></div>}
    {grading?.unavailable && <p className="homework-help" role="status">{grading.unavailable}</p>}
    {message && <p className="homework-result" role="status">{message}</p>}
    {failure && <p className="warning" role="alert">{failure}</p>}
    {!items.length ? <div className="empty"><h3>Домашних работ пока нет</h3><p>Здесь будут показаны работы студентов и их оценки.</p></div> : !filtered.length ? <div className="empty"><h3>Работы не найдены</h3><p>Измените фильтры или поисковый запрос.</p></div> : <>
      <div className="table-scroll homework-scroll"><DataTable rows={visible} columns={columns} getRowKey={(item, index) => item.key + '-' + index}
        className="homework-table" caption={<>Домашние работы. Найдено {filtered.length}, выбрано {selected.length}.</>}
        selection={gradingAvailable ? {
          selectedKeys, eligibleKeys: new Set(eligible.map(item => item.key)), getKey: item => item.key, locked,
          onToggle: toggleRow, onToggleAll: toggleAll, className: 'homework-selection', selectedClassName: 'homework-selected',
          allLabel: 'Выбрать все доступные работы по фильтрам, на всех страницах', rowLabel: (item, index) => 'Выбрать работу: ' + rowDetails(item, index).workLabel,
        } : undefined}
        renderAfterRow={(item, index) => {
          const { selectable, info, responseDraft, workLabel, expanded, detailId } = rowDetails(item, index);
          return expanded && <tr className="homework-detail-row"><td colSpan={gradingAvailable ? 7 : 6}><div className="homework-details" id={detailId}>
            <section className="homework-response"><h4>Ответ студента</h4>{Object.values(info).some(value => label(value)) ? render(info) : <p className="homework-muted">Текст ответа не добавлен.</p>}</section>
            <section><h4>Файл студента</h4>{attachments(item.source, true)}</section>
            <section><h4>Задание</h4>{attachments(item.source, false)}</section>
            <section className="homework-teacher-response">{selectable || responseDraft ? <ResponseEditor item={item} name={workLabel} disabled={locked} readOnly={!selectable} draft={responseDraft ?? { comment: label(item.source.comment), mark: item.mark === null ? '' : String(item.mark) }} onChange={next => setResponseDrafts(previous => ({ data: responseContext, values: { ...(previous?.data === responseContext ? previous.values : {}), [item.key]: next } }))} onSave={(mark, response) => saveGrades([item], mark, response)}/> : <><h4>Ответ преподавателя</h4><p className={label(item.source.comment) ? undefined : 'homework-muted'}>{label(item.source.comment) || 'Ответ преподавателя не добавлен.'}</p></>}</section>
          </div></td></tr>;
        }}/></div>
      {pageCount > 1 && <div className="homework-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} из {filtered.length}</span><label>Строк<select aria-label="Строк домашних работ на странице" value={pageSize} disabled={locked} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="button secondary" aria-label="Предыдущая страница домашних работ" disabled={locked || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pageCount}</span><button type="button" className="button secondary" aria-label="Следующая страница домашних работ" disabled={locked || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></div>}
    </>}
  </div>;
}

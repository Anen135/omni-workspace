import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { label, rows, type RemoteRecord, type Section } from '../../services/omni-client';
import type { HomeworkReviewItem } from './homework';
import { materialLink } from '../materials/teaching-materials';
import './homework.css';

type Grading = {
  busy: boolean;
  unavailable?: string;
  onGrade: (items: HomeworkReviewItem[], mark: number) => Promise<{ confirmedKeys: string[] }>;
};
type SortField = 'studentName' | 'groupName' | 'theme' | 'submittedAt' | 'mark';
type Selection = { data: HomeworkReviewItem[]; keys: Set<string> };

function studentFilterKey(item: HomeworkReviewItem): string {
  return item.studentId ? 'id:' + item.studentId : 'view:' + JSON.stringify([item.studentName, item.groupName]);
}

function fallbackItems(data: unknown): HomeworkReviewItem[] {
  return rows(data).map((source, index) => ({
    key: 'readonly-' + index,
    studentId: label(source.id_stud || source.student_id),
    studentName: label(source.fio_stud || source.student_name),
    groupName: label(source.name_tgroups || source.group_name),
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

function SelectAll({ checked, mixed, disabled, onChange }: {
  checked: boolean; mixed: boolean; disabled: boolean; onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <input ref={ref} type="checkbox" aria-label="Выбрать все доступные работы по фильтрам, на всех страницах" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)}/>;
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

export function HomeworkTable({ section, render, items: suppliedItems, grading }: {
  section: Section; render: (value: unknown) => ReactNode; items?: HomeworkReviewItem[]; grading?: Grading;
}) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [student, setStudent] = useState('');
  const [sort, setSort] = useState<{ field: SortField; descending: boolean }>({ field: 'studentName', descending: false });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [grade, setGrade] = useState('12');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState('');
  const [opened, setOpened] = useState<{ data: HomeworkReviewItem[]; key: string } | null>(null);
  const submittingRef = useRef(false);
  const tableId = useId();
  const items = useMemo(() => suppliedItems ?? fallbackItems(section.data), [suppliedItems, section.data]);
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
  const numericGrade = Number(grade);
  const gradeValid = grade.trim() !== '' && Number.isInteger(numericGrade) && numericGrade >= 1 && numericGrade <= 12;

  function resetSelection() {
    setSelection(null); setOpened(null); setPage(1); setMessage(''); setFailure('');
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
  async function saveGrades(submitted: HomeworkReviewItem[], mark: number) {
    if (locked || submittingRef.current || !grading || !Number.isInteger(mark) || mark < 1 || mark > 12 || !submitted.length || submitted.some(item => !canSelect(item))) return;
    submittingRef.current = true;
    setSubmitting(true); setMessage(''); setFailure('');
    try {
      const result = await grading.onGrade(submitted, mark);
      const confirmed = new Set(result.confirmedKeys);
      const savedCount = submitted.filter(item => confirmed.has(item.key)).length;
      setSelection(previous => previous?.data === items ? { data: items, keys: new Set([...previous.keys].filter(key => !confirmed.has(key))) } : previous);
      if (savedCount) setMessage('Оценка ' + mark + ' сохранена: ' + savedCount + ' из ' + submitted.length + '.');
      if (savedCount < submitted.length) setFailure('Сохранение ' + (submitted.length - savedCount) + ' работ не подтверждено. Проверьте данные перед повторной отправкой.');
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : 'Не удалось сохранить оценки. Проверьте данные перед повторной отправкой.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }
  function sortHeading(field: SortField, title: string) {
    return <th scope="col" aria-sort={sort.field === field ? (sort.descending ? 'descending' : 'ascending') : 'none'}><button type="button" className="homework-sort" disabled={locked} onClick={() => { setSort({ field, descending: sort.field === field && !sort.descending }); setPage(1); }}>{title}<span aria-hidden="true">{sort.field === field ? (sort.descending ? ' ↓' : ' ↑') : ' ↕'}</span></button></th>;
  }
  function attachments(item: RemoteRecord, studentFile: boolean) {
    const keys = studentFile ? ['download_url_stud'] : ['download_url', 'file_url', 'link'];
    const standalone = !studentFile && materialLink(label(item.filename)) && item.filename !== item.download_url_stud;
    if (!keys.some(key => materialLink(label(item[key]))) && !standalone) return <span className="homework-muted">—</span>;
    const filenameUrl = materialLink(label(item.filename));
    const filenameBelongsHere = !filenameUrl || standalone || keys.some(key => materialLink(label(item[key])) === filenameUrl);
    return render(pick(item, [...keys, ...(filenameBelongsHere ? ['filename'] : []), 'file_name', 'original_name', 'mime_type', 'content_type', 'mime']));
  }


  if (section.error) return <div className="warning" role="alert">Не удалось загрузить домашние работы: {section.error}</div>;
  return <div className="homework-review" aria-busy={locked}>
    <div className="homework-filters">
      <label>Студент<select aria-label="Студент домашних работ" value={student} disabled={locked} onChange={event => { setStudent(event.target.value); resetSelection(); }}><option value="">Все студенты</option>{students.map(option => <option key={option.key} value={option.key}>{option.name}{option.groups.size ? ' · ' + [...option.groups].join(', ') : ''}{duplicateNames.has(option.name) && option.id ? ' · ID ' + option.id : ''}</option>)}</select></label>
      <label>Группа<select aria-label="Группа домашних заданий" value={group} disabled={locked} onChange={event => { setGroup(event.target.value); setStudent(''); resetSelection(); }}><option value="">Все группы</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
      <label className="homework-search">Поиск<input type="search" aria-label="Поиск домашнего задания" placeholder="Имя, тема или предмет" value={query} disabled={locked} onChange={event => { setQuery(event.target.value); resetSelection(); }}/></label>
      {(group || student || query) && <button type="button" className="button secondary" disabled={locked} onClick={() => { setGroup(''); setStudent(''); setQuery(''); resetSelection(); }}>Сбросить</button>}
    </div>
    <div className="homework-bulk">
      <span>Работы: <strong>{filtered.length}</strong>{filtered.length !== items.length && <span className="homework-muted"> из {items.length}</span>}</span>
      {gradingAvailable && <>
        <span>Выбрано: <strong>{selected.length}</strong></span>
        {eligible.length > 0 && <button type="button" className="homework-text-button" disabled={locked} onClick={() => toggleAll(selected.length !== eligible.length)}>{selected.length === eligible.length ? 'Снять выбор' : 'Выбрать все найденные (' + eligible.length + ')'}</button>}
        <label className="homework-grade-label">Оценка выбранным<input type="number" aria-label="Оценка для выбранных работ" min={1} max={12} step={1} value={grade} disabled={locked} onChange={event => setGrade(event.target.value)}/></label>
        <button type="button" className="button primary" disabled={locked || !selected.length || !gradeValid} onClick={() => void saveGrades([...selected], numericGrade)}>{locked ? 'Сохранение…' : 'Поставить оценку' + (selected.length ? ' (' + selected.length + ')' : '')}</button>
      </>}
    </div>
    {gradingAvailable && selected.length > pageSize && <p className="homework-help">Выбраны работы на всех страницах по текущим фильтрам.</p>}
    {gradingAvailable && !gradeValid && <p className="warning" role="alert">Введите целую оценку от 1 до 12.</p>}
    {grading?.unavailable && <p className="homework-help" role="status">{grading.unavailable}</p>}
    {message && <p className="homework-result" role="status">{message}</p>}
    {failure && <p className="warning" role="alert">{failure}</p>}
    {!items.length ? <div className="empty"><h3>Домашних работ пока нет</h3><p>Здесь будут показаны работы студентов и их оценки.</p></div> : !filtered.length ? <div className="empty"><h3>Работы не найдены</h3><p>Измените фильтры или поисковый запрос.</p></div> : <>
      <div className="table-scroll homework-scroll"><table className="homework-table"><caption className="homework-sr-only">Домашние работы. Найдено {filtered.length}, выбрано {selected.length}.</caption><thead><tr>
        {gradingAvailable && <th scope="col" className="homework-selection"><SelectAll checked={eligible.length > 0 && selected.length === eligible.length} mixed={selected.length > 0 && selected.length < eligible.length} disabled={locked || !eligible.length} onChange={toggleAll}/></th>}
        {sortHeading('studentName', 'Студент')}{sortHeading('theme', 'Работа')}{sortHeading('submittedAt', 'Отправлено')}{sortHeading('mark', 'Оценка')}
        <th scope="col"><span className="homework-sr-only">Просмотр работы</span></th>
      </tr></thead><tbody>{visible.map((item, index) => {
        const selectable = canSelect(item);
        const info = pick(item.source, ['answer_text', 'text', 'comment', 'description']);
        const workLabel = (item.studentName || 'Без имени') + ', ' + (item.theme || 'Работа без темы') + ', строка ' + ((currentPage - 1) * pageSize + index + 1);
        const rowKey = item.key + '-' + ((currentPage - 1) * pageSize + index);
        const expanded = opened?.data === items && opened.key === rowKey;
        const detailId = tableId + '-detail-' + index;
        return <Fragment key={item.key + '-' + index}>
          <tr className={selectedKeys.has(item.key) && selectable ? 'homework-selected' : undefined}>
            {gradingAvailable && <td className="homework-selection">{selectable ? <input type="checkbox" aria-label={'Выбрать работу: ' + workLabel} checked={selectedKeys.has(item.key)} disabled={locked} onChange={event => toggleRow(item, event.target.checked)}/> : <span className="homework-muted" title="Для этой работы оценка недоступна">—</span>}</td>}
            <td><strong>{item.studentName || 'Студент не указан'}</strong>{item.groupName && <small>{item.groupName}</small>}{duplicateNames.has(item.studentName) && item.studentId && <small>ID {item.studentId}</small>}</td>
            <td>{item.theme || 'Без темы'}{item.subject && <small>{item.subject}</small>}</td>
            <td className="homework-date">{item.submittedAt || '—'}</td>
            <td className="homework-grade-cell">{selectable ? <GradeEditor item={item} name={workLabel} disabled={locked} onSave={mark => saveGrades([item], mark)}/> : <span className={item.mark === null ? 'homework-muted' : 'homework-mark'}>{item.mark ?? '—'}</span>}</td>
            <td className="homework-open-cell"><button type="button" className="homework-text-button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => setOpened(expanded ? null : { data: items, key: rowKey })}>{expanded ? 'Закрыть работу' : 'Открыть работу'}</button></td>
          </tr>
          {expanded && <tr className="homework-detail-row"><td colSpan={gradingAvailable ? 6 : 5}><div className="homework-details" id={detailId}>
            <section className="homework-response"><h4>Ответ студента</h4>{Object.values(info).some(value => label(value)) ? render(info) : <p className="homework-muted">Текст ответа не добавлен.</p>}</section>
            <section><h4>Файл студента</h4>{attachments(item.source, true)}</section>
            <section><h4>Задание</h4>{attachments(item.source, false)}</section>
          </div></td></tr>}
        </Fragment>;
      })}</tbody></table></div>
      {pageCount > 1 && <div className="homework-pagination"><span>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} из {filtered.length}</span><label>Строк<select aria-label="Строк домашних работ на странице" value={pageSize} disabled={locked} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label><button type="button" className="button secondary" aria-label="Предыдущая страница домашних работ" disabled={locked || currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pageCount}</span><button type="button" className="button secondary" aria-label="Следующая страница домашних работ" disabled={locked || currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Далее</button></div>}
    </>}
  </div>;
}

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, RefreshCw, Search, Users } from 'lucide-react';
import { label, rows, type RemoteRecord, type Section } from '../../services/omni-client';
import { EmptyState } from '../../components/ui/EmptyState';
import { studentColumns, studentPage, studentRow, selectStudents, type StudentColumnKey } from './students';
import './students.css';

export type StudentsPageProps = {
  groupsSection: Section; groups: RemoteRecord[]; groupId: string; groupName: string;
  studentsSection: Section | null; busy: boolean;
  onGroupPick: (group: RemoteRecord) => void; onOpen: (student: RemoteRecord) => void; onRefresh: () => void;
};

export function StudentsPage(props: StudentsPageProps) {
  // Reset local filters and pagination when the selected group changes.
  return <StudentsContent key={props.groupId} {...props}/>;
}

function StudentsContent({ groupsSection, groups, groupId, groupName, studentsSection, busy, onGroupPick, onOpen, onRefresh }: StudentsPageProps) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<StudentColumnKey>('name');
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const students = useMemo(() => rows(studentsSection?.data).map(studentRow), [studentsSection?.data]);
  const filtered = useMemo(() => selectStudents(students, query, sort, ascending), [students, query, sort, ascending]);
  const selected = studentPage(filtered, page, pageSize);

  function changeSort(key: StudentColumnKey) {
    setAscending(key === sort ? !ascending : true); setSort(key); setPage(0);
  }

  return <section className="panel students-page" aria-label="Ученики" aria-busy={busy}>
    <div className="panel-heading students-heading">
      <div><h2><Users size={19} aria-hidden="true"/> {groupName || 'Ученики группы'}</h2><p>Контакты и показатели учеников из Omni</p></div>
      <button className="button secondary" disabled={busy || !groupId || !!groupsSection.error} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/> Обновить группу</button>
    </div>
    {groupsSection.error ? <div className="warning" role="alert">{groupsSection.error}</div> : !groups.length ? (busy ? <Loading/> : <EmptyState title="Omni пока не возвращает группы" text="Список групп в Omni пуст."/>) : <>
      <div className="students-tools students-group-tools">
        <label className="students-group">Группа<select aria-label="Выбор группы" value={groupId} disabled={busy} onChange={event => { const group = groups.find(item => label(item.id_tgroups) === event.target.value); if (group) onGroupPick(group); }}>
          <option value="" disabled>Выберите группу</option>{groups.map(group => <option key={label(group.id_tgroups)} value={label(group.id_tgroups)}>{label(group.name_tgroups)}</option>)}
        </select></label>
        <span className="students-total">{studentsSection && !studentsSection.error ? `Учеников: ${students.length}` : 'Выберите группу для просмотра учеников'}</span>
      </div>
      {busy && <Loading/>}
      {studentsSection?.error ? <div className="warning" role="alert">{studentsSection.error}</div> : !studentsSection ? (!busy && <EmptyState title="Выберите группу" text="Откроется список учеников и их показатели."/>) : !students.length ? (!busy && <EmptyState title="В группе нет доступных учеников" text="Omni вернул пустой список."/>) : <>
        <div className="students-tools">
          <label className="students-search"><Search size={16} aria-hidden="true"/><input type="search" aria-label="Поиск студентов" placeholder="Имя, email, телефон или логин" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }}/></label>
          <span className="students-total" role="status">Найдено: {filtered.length} из {students.length}</span>
          <label className="students-page-size">На странице<select aria-label="Учеников на странице" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        <div className="students-table-scroll" tabIndex={0} role="region" aria-label="Таблица учеников">
          <table className="students-table"><thead><tr>{studentColumns.map(column => <th key={column.key} aria-sort={sort === column.key ? ascending ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => changeSort(column.key)}>{column.label}{sort === column.key && (ascending ? <ArrowUp size={13} aria-hidden="true"/> : <ArrowDown size={13} aria-hidden="true"/>)}</button></th>)}</tr></thead>
            <tbody>{selected.items.map((student, index) => <tr key={`${student.id}:${index}`}>{studentColumns.map(column => <td key={column.key} className={column.numeric ? 'students-numeric' : undefined}>{column.key === 'name' ? <button className="students-name" disabled={busy || !student.id} onClick={() => onOpen(student.source)}>{student.values.name || 'Имя не указано'}</button> : student.values[column.key] || <span className="students-missing" aria-label="Нет данных">—</span>}</td>)}</tr>)}</tbody>
          </table>
        </div>
        {!filtered.length && <EmptyState title="Ученики не найдены" text="Попробуйте изменить поисковый запрос."/>}
        <div className="students-pagination">
          <span>{filtered.length ? `${selected.page * pageSize + 1}–${Math.min((selected.page + 1) * pageSize, filtered.length)} из ${filtered.length}` : '0 из 0'}</span>
          <button className="button secondary" aria-label="Предыдущая страница учеников" disabled={selected.page === 0} onClick={() => setPage(selected.page - 1)}><ChevronLeft size={16}/></button>
          <span aria-label="Страница учеников">{selected.page + 1} / {selected.pages}</span>
          <button className="button secondary" aria-label="Следующая страница учеников" disabled={selected.page + 1 === selected.pages} onClick={() => setPage(selected.page + 1)}><ChevronRight size={16}/></button>
        </div>
      </>}
    </>}
  </section>;
}

function Loading() {
  return <div className="students-loading" role="status"><RefreshCw size={16} className="spin" aria-hidden="true"/> Загружаем учеников…</div>;
}

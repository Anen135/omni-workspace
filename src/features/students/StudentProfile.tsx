import { useState } from 'react';
import type { RemoteRecord, Section } from '../../services/omni-client';
import { SectionView } from '../../components/data/RemoteData';
import { studentColumns, studentRow, studentProfileData, studentDate, studentText, studentAttendance, studentAttendanceMarks } from './students';
import './students.css';

export function StudentProfile({ student, details, attendance }: { student: RemoteRecord; details: Section; attendance: Section }) {
  const profile = studentProfileData(student, details.error ? null : details.data);
  const row = studentRow(profile.student);
  const fields = [
    ['Группа', studentText(profile.student.name_tgroups)],
    ['Поток', studentText(profile.student.name_streams)],
    ['Направление', studentText(profile.student.dir_name)],
    ['Дата рождения', studentDate(profile.student.birthdat_stud)],
    ['Адрес', studentText(profile.student.adr_stud)],
    ['TopCoins', studentText(profile.student.DIAMOND)],
    ['Монеты', studentText(profile.student.COIN)],
    ['Комментарии', studentText(profile.student.count_comment)],
    ['Достижения', studentText(profile.student.achieves)],
  ];
  const history = studentAttendance(attendance.error ? null : attendance.data);
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(history.length / 25));
  const current = Math.min(page, pages - 1);
  const supplementary = profile.mismatch || details.error || !details.data || typeof details.data !== 'object' || Array.isArray(details.data) ? {} : Object.fromEntries(Object.entries(details.data).filter(([key]) => ['name_spec', 'theme', 'comment', 'description', 'mark', 'mark2', 'mark4', 'date', 'count'].includes(key)));
  return <div className="student-profile">
    <dl className="student-profile-fields">{studentColumns.map(column => <div key={column.key}><dt>{column.label}</dt><dd>{row.values[column.key] || '—'}</dd></div>)}{fields.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value || '—'}</dd></div>)}</dl>
    {details.error && <div className="warning" role="alert">{details.error}</div>}
    {profile.mismatch && <div className="warning" role="alert">Omni вернул сведения другого ученика. Дополнительные сведения не показаны.</div>}
    {!!Object.keys(supplementary).length && <section className="student-profile-section" aria-label="Дополнительные сведения"><h3>Дополнительные сведения</h3><SectionView section={{ data: supplementary, error: null }}/></section>}
    <section className="student-profile-section" aria-label="Посещаемость ученика"><h3>История посещаемости</h3>
      {attendance.error || !history.length ? <SectionView section={attendance} emptyTitle="Данные о посещаемости недоступны"/> : <>
        <div className="student-history-scroll" role="region" tabIndex={0} aria-label="История посещаемости"><table className="student-history"><thead><tr><th>Дата</th><th>Предмет и тема</th><th>Преподаватель</th><th>Присутствие</th>{studentAttendanceMarks.map(name => <th key={name}>{name}</th>)}<th>Комментарий</th></tr></thead>
          <tbody>{history.slice(current * 25, (current + 1) * 25).map((visit, index) => <tr key={index}><td>{visit.date || '—'}</td><td>{visit.subject || '—'}{visit.theme && <span className="student-history-theme">{visit.theme}</span>}</td><td>{visit.teacher || '—'}</td><td>{visit.status}</td>{visit.marks.map((mark, markIndex) => <td key={markIndex}>{mark || '—'}</td>)}<td>{visit.comment || '—'}</td></tr>)}</tbody></table></div>
        {pages > 1 && <div className="student-history-pagination"><button className="button secondary" disabled={!current} onClick={() => setPage(current - 1)}>Назад</button><span>{current + 1} / {pages}</span><button className="button secondary" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>Далее</button></div>}
      </>}
    </section>
  </div>;
}

import { useState, type ReactNode } from 'react';
import { label, rows, type RemoteRecord, type Section } from './omni-client';
import { materialLink } from './teaching-materials';

export function HomeworkTable({ section, render }: { section: Section; render: (value: unknown) => ReactNode }) {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const items = rows(section.data);
  // Unknown response shapes retain the existing structured renderer; no records are discarded.
  if (section.error) return <div className="warning" role="alert">{section.error}</div>;
  if (!items.length) return <div className="empty"><h3>Новых работ нет</h3></div>;
  if (items.some(item => !['fio_stud', 'theme', 'download_url', 'download_url_stud', 'answer_text'].some(key => key in item))) return <div className="remote-data">{render(section.data)}</div>;
  const groups = [...new Set(items.map(item => label(item.name_tgroups)).filter(Boolean))];
  const visible = items.filter(item => (!group || label(item.name_tgroups) === group) && [item.fio_stud, item.theme, item.name_spec, item.spec_name, item.answer_text].map(label).join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  const pick = (item: RemoteRecord, keys: string[]) => Object.fromEntries(keys.filter(key => key in item).map(key => [key, item[key]]));
  const attachments = (item: RemoteRecord, student: boolean) => {
    const keys = student ? ['download_url_stud'] : ['download_url', 'file_url', 'link'];
    const standalone = !student && materialLink(label(item.filename)) && item.filename !== item.download_url_stud;
    if (!keys.some(key => materialLink(label(item[key]))) && !standalone) return <span>—</span>;
    const filenameUrl = materialLink(label(item.filename));
    const filenameBelongsHere = !filenameUrl || standalone || keys.some(key => materialLink(label(item[key])) === filenameUrl);
    return render(pick(item, [...keys, ...(filenameBelongsHere ? ['filename'] : []), 'file_name', 'original_name', 'mime_type', 'content_type', 'mime']));
  };
  return <><div className="workspace-table-tools">{groups.length > 0 && <select aria-label="Группа домашних заданий" value={group} onChange={event => setGroup(event.target.value)}><option value="">Все группы</option>{groups.map(name => <option key={name}>{name}</option>)}</select>}<input type="search" aria-label="Поиск домашнего задания" placeholder="Поиск по работам" value={query} onChange={event => setQuery(event.target.value)}/><span>Найдено: {visible.length}</span></div><div className="table-scroll"><table className="homework-table"><thead><tr><th>Ученик</th><th>Тема / предмет</th><th>Ответ</th><th>Файл задания</th><th>Работа ученика</th></tr></thead><tbody>{visible.map((item, index) => <tr key={index}><td>{label(item.fio_stud) || '—'}{label(item.name_tgroups) && <small>{label(item.name_tgroups)}</small>}</td><td>{label(item.theme) || '—'}<small>{label(item.name_spec || item.spec_name)}</small></td><td>{render(pick(item, ['answer_text', 'text', 'comment', 'description', 'mark']))}</td><td>{attachments(item, false)}</td><td>{attachments(item, true)}</td></tr>)}</tbody></table></div>{!visible.length && <div className="empty">Работы не найдены</div>}</>;
}

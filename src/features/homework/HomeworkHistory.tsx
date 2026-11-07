import { useHomeworkHistory } from './useHomeworkHistory';
import { DataTable, type TableColumn } from '../../components/data/DataTable';
import { DataValue } from '../../components/data/RemoteData';
import { FilePreview } from '../../components/files/FilePreview';
import { label, type RemoteRecord, type Section } from '../../services/omni-client';
import {
  homeworkHistoryMatches, homeworkHistoryStatusLabels,
  type HomeworkHistoryFilter, type HomeworkHistoryRow,
} from './homework-history';
import './homework.css';

const filters: [HomeworkHistoryFilter, string][] = [
  ['all', 'Все'], ['submitted', 'Сдано'], ['pending', 'Не сдано'], ['overdue', 'Просрочено'],
  ['checked', 'Проверено'], ['new', 'Новые работы'], ['retake', 'Пересдача'], ['unknown', 'Статус неизвестен'],
];

function HistoryDetails({ source }: { source: RemoteRecord }) {
  const fileKeys = ['download_url', 'download_url_stud'];
  return <><DataValue value={Object.fromEntries(Object.entries(source).filter(([key]) => !fileKeys.includes(key)))}/>
    {fileKeys.map(key => label(source[key]) ? <div key={key}><span>{key === 'download_url_stud' ? 'Файл студента' : 'Файл задания'}</span>
      <FilePreview url={label(source[key])}/></div> : null)}</>;
}

export function HomeworkHistory({ accountId, catalog }: { accountId: string; catalog: Section }) {
  const { catalogModel, group, subject, year, month, offset, filter, result, busy, error, detail, setGroupId, setSpecKey, setYear, setMonth, setOffset, setFilter, setDetail, invalidate, load, limit } = useHomeworkHistory({ accountId, catalog });
  const columns: TableColumn<HomeworkHistoryRow>[] = [
    { id: 'student', heading: 'Студент', kind: 'data', value: row => row.studentName, cell: row => row.studentName },
    { id: 'assignment', heading: 'Задание', kind: 'data', value: row => row.theme, cell: row => row.theme },
    { id: 'status', heading: 'Статус', kind: 'data', value: row => homeworkHistoryStatusLabels[row.status],
      cell: row => <span className={`homework-history-status homework-history-status-${row.status}`}>{homeworkHistoryStatusLabels[row.status]}</span> },
    { id: 'details', heading: 'Просмотр', kind: 'action', cell: row => <button type="button" className="homework-text-button"
      aria-expanded={detail === row.key} onClick={() => setDetail(detail === row.key ? null : row.key)}>Подробнее</button> },
  ];
  return <section className="homework-history" aria-label="История домашних заданий">
    <div className="homework-history-controls">
      <label>Группа<select value={group?.id ?? ''} onChange={event => { invalidate(); setGroupId(event.target.value); setSpecKey(''); setOffset(0); }}>
        {!catalogModel.groups.length && <option value="">Нет групп</option>}
        {catalogModel.groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label>Предмет<select value={subject?.key ?? ''} onChange={event => { invalidate(); setSpecKey(event.target.value); setOffset(0); }}>
        {!group?.subjects.length && <option value="">Нет предметов</option>}
        {group?.subjects.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}
      </select></label>
      <label>Год<input type="text" inputMode="numeric" maxLength={4} placeholder="Все годы" value={year}
        onChange={event => { invalidate(); setYear(event.target.value); setOffset(0); }}/></label>
      <label>Месяц<select value={month} onChange={event => { invalidate(); setMonth(event.target.value); setOffset(0); }}>
        <option value="">Все месяцы</option>
        {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
      </select></label>
      <button type="button" className="button primary" disabled={busy || !group || !subject || !!catalogModel.error} onClick={() => void load()}>
        {busy ? 'Загрузка…' : 'Загрузить историю'}
      </button>
    </div>
    {catalogModel.error && <p className="warning" role="alert">{catalogModel.error}</p>}
    {error && <p className="warning" role="alert">{error}</p>}
    <p className="homework-history-help">История домашних заданий без лабораторных работ. Статусы показаны только по данным Omni. Смена условий требует повторной загрузки.</p>
    <div className="homework-history-filters" role="group" aria-label="Фильтр статуса">
      {filters.map(([value, name]) => <button key={value} type="button" className="button" aria-pressed={filter === value}
        onClick={() => { setFilter(value); setDetail(null); }}>{name}</button>)}
    </div>
    {busy && <p role="status">Загружаем историю…</p>}
    {result ? <>
      <p className="homework-history-help">Загружено заданий: {result.assignmentCount}. Фильтр статусов применяется к этой странице заданий.</p>
      <div className="table-scroll"><DataTable rows={result.rows.filter(row => homeworkHistoryMatches(row, filter))} columns={columns}
        getRowKey={row => row.key} label="История по студентам и заданиям" pagination={{ pageSize: 25 }}
        emptyMessage="Нет записей по выбранным условиям."
        renderAfterRow={row => detail === row.key ? <tr className="homework-history-detail"><td colSpan={columns.length}>
          <h4>{row.studentName} — {row.theme}</h4>
          <p>{homeworkHistoryStatusLabels[row.status]}</p>
          <div className="homework-history-detail-grid"><section><h4>Задание</h4><HistoryDetails source={row.assignment}/></section>
            <section><h4>Ответ студента</h4>{row.cell ? <HistoryDetails source={row.cell}/> : <p>Omni не передал данные ответа. Статус неизвестен.</p>}</section></div>
        </td></tr> : null}/></div>
    </> : !busy && <p className="homework-history-help">Выберите группу и предмет, затем нажмите «Загрузить историю».</p>}
    <div className="homework-pagination">
      <span>Задания: {offset + 1}–{offset + limit}</span>
      <button type="button" className="button" disabled={offset === 0} onClick={() => { invalidate(); setOffset(Math.max(0, offset - limit)); }}>Предыдущие задания</button>
      <button type="button" className="button" disabled={!result?.hasNext || offset + limit > 10000} onClick={() => { invalidate(); setOffset(offset + limit); }}>Следующие задания</button>
    </div>
  </section>;
}

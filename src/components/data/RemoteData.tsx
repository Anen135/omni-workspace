import { label, record, type Section } from '../../services/omni-client';
import { materialLink } from '../../features/materials/teaching-materials';
import { FilePreview } from '../files/FilePreview';
import { EmptyState } from '../ui/EmptyState';

export function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasData);
  if (value && typeof value === 'object') return Object.values(value).some(hasData);
  return value !== null && value !== undefined && value !== '' && value !== false;
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

export function SectionView({ section, emptyTitle = 'Данные отсутствуют', fileFallback }: { section: Section; emptyTitle?: string; fileFallback?: 'pdf' }) {
  if (section.error) return <div className="warning" role="alert">{section.error}</div>;
  if (!hasData(section.data)) return <EmptyState title={emptyTitle}/>;
  return <div className="remote-data"><DataValue value={section.data} fileFallback={fileFallback}/></div>;
}

export function DataValue({ value, depth = 0, fileFallback }: { value: unknown; depth?: number; fileFallback?: 'pdf' }) {
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

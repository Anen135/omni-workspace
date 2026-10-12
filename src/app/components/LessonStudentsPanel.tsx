import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { label, type RemoteRecord, type Section } from '../../services/omni-client';
import { EmptyState } from '../../components/ui/EmptyState';
import { SectionView } from '../../components/data/RemoteData';

export function LessonStudentsPanel({ busy, date, students, groups, presentsError, hasDayLessons, onReload, onGroupPick, children }: {
  busy: boolean; date: string; students: RemoteRecord[]; groups: RemoteRecord[]; presentsError?: Section; hasDayLessons: boolean;
  onReload: () => void; onGroupPick: (group: string) => void; children: ReactNode;
}) {
  return <section className="panel">
    <div className="panel-heading"><div><h2>Присутствующие</h2><p>{students.length ? `${students.length} учеников · данные академии` : 'Показываем только то, что вернул сервер Omni'}</p></div><button className="button secondary" disabled={busy || !date} onClick={onReload}><RefreshCw size={15}/>Загрузить урок</button></div>
    {groups.length > 0 && <div className="live-group-buttons">{groups.map(group => <button className="button secondary" disabled={busy} key={label(group.id_tgroups)} onClick={() => onGroupPick(label(group.id_tgroups))}>{label(group.name_tgroups)}</button>)}</div>}
    {presentsError ? <SectionView section={presentsError}/> : students.length ? children : <EmptyState title={hasDayLessons ? 'Выберите пару и группу' : 'На выбранную дату ученики не загружены'} text={hasDayLessons ? 'Список пар доступен выше. Выберите нужное занятие, чтобы загрузить учеников.' : 'Выберите другую дату или нажмите «Загрузить урок».'}/>}
  </section>;
}

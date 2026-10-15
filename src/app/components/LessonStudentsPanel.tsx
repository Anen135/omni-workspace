import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { label, type RemoteRecord, type Section } from '../../services/omni-client';
import { EmptyState } from '../../components/ui/EmptyState';
import { SectionView } from '../../components/data/RemoteData';
import { HelpTip } from '../../components/ui/HelpTip';

export function LessonStudentsPanel({ busy, date, students, groups, selectedGroup, presentsError, hasDayLessons, onReload, onGroupPick, children }: {
  busy: boolean; date: string; students: RemoteRecord[]; groups: RemoteRecord[]; selectedGroup: string; presentsError?: Section; hasDayLessons: boolean;
  onReload: () => void; onGroupPick: (group: string) => void; children: ReactNode;
}) {
  return <section className="panel lesson-students">
    <div className="panel-heading"><div className="help-heading"><h2>Присутствующие <span className="lesson-student-count">{students.length}</span></h2><HelpTip label="О разделе «Присутствующие»">Показаны ученики и данные выбранного урока, полученные из Omni.</HelpTip></div><button className="button secondary" disabled={busy || !date} onClick={onReload}><RefreshCw size={15}/>Загрузить урок</button></div>
    {groups.length > 0 && <div className="live-group-buttons" role="group" aria-label="Группы урока">{groups.map(group => <button className="button secondary" aria-pressed={label(group.id_tgroups) === selectedGroup} disabled={busy} key={label(group.id_tgroups)} onClick={() => onGroupPick(label(group.id_tgroups))}>{label(group.name_tgroups)}</button>)}</div>}
    {presentsError ? <SectionView section={presentsError}/> : students.length ? children : <EmptyState title={hasDayLessons ? 'Выберите пару и группу' : 'На выбранную дату ученики не загружены'} text={hasDayLessons ? 'Список пар доступен выше. Выберите нужное занятие, чтобы загрузить учеников.' : 'Выберите другую дату или нажмите «Загрузить урок».'}/>}
  </section>;
}

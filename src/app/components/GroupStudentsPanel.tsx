import type { ReactNode } from 'react';
import { label, rows, type RemoteRecord, type Section } from '../../services/omni-client';
import { EmptyState } from '../../components/ui/EmptyState';
import { TableSkeleton } from '../../components/ui/TableSkeleton';
import { SectionView } from '../../components/data/RemoteData';
import { HelpTip } from '../../components/ui/HelpTip';

export function GroupStudentsPanel({ groupsSection, groups, name, groupId, studentsSection, busy, onGroupPick, renderStudents }: {
  groupsSection: Section; groups: RemoteRecord[]; name: string; groupId: string; studentsSection: Section | null; busy: boolean;
  onGroupPick: (group: RemoteRecord) => void; renderStudents: (students: RemoteRecord[]) => ReactNode;
}) {
  return <section className="panel">
    <div className="panel-heading"><div className="help-heading"><h2>{name || 'Мои группы'}</h2><HelpTip label="О разделе «Мои группы»">Выберите группу для просмотра учеников и доступных оценок.</HelpTip></div></div>
    {groupsSection.error ? <SectionView section={groupsSection}/> : groups.length ? <>
      <div className="workspace-table-tools"><label>Группа <select aria-label="Выбор группы" disabled={busy} value={groupId} onChange={event => { const group = groups.find(item => label(item.id_tgroups) === event.target.value); if (group) onGroupPick(group); }}><option value="" disabled>Выберите группу</option>{groups.map(group => <option key={label(group.id_tgroups)} value={label(group.id_tgroups)}>{label(group.name_tgroups)}</option>)}</select></label></div>
      {busy && !studentsSection && <TableSkeleton/>}
      {!busy && !studentsSection && <EmptyState title="Выберите группу"/>}
      {studentsSection && (studentsSection.error ? <SectionView section={studentsSection}/> : rows(studentsSection.data).length ? renderStudents(rows(studentsSection.data)) : <EmptyState title="В группе нет доступных учеников" text="Omni вернул пустой список."/>)}
    </> : <EmptyState title="Omni пока не возвращает группы" text="Список групп в Omni пуст."/>}
  </section>;
}

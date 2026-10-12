import { RefreshCw } from 'lucide-react';
import type { RemoteLesson, Section } from '../../services/omni-client';
import { SectionView } from '../../components/data/RemoteData';
import { EmptyState } from '../../components/ui/EmptyState';

const emptySection: Section = { data: null, error: null };

export function IssuedMaterialsPanel({ lesson, busy, date, groupSelected, onLoad }: {
  lesson: RemoteLesson | null; busy: boolean; date: string; groupSelected: boolean; onLoad: () => void;
}) {
  return <section className="panel">
    <div className="panel-heading"><div><h2>Выданные ДЗ и материалы текущего урока</h2><p>Файлы, связанные с текущей группой, датой и парой</p></div><button className="button secondary" disabled={busy || !date || !groupSelected} onClick={onLoad}><RefreshCw size={15}/>Загрузить выданные материалы</button></div>
    {!groupSelected ? <EmptyState title="Текущая пара не выбрана" text="Выданные ученикам файлы появятся после загрузки занятия. Методички для подготовки доступны в каталоге выше."/> : <>
      <h3 className="live-section-title">Выданные материалы</h3><SectionView fileFallback="pdf" section={lesson?.materials || emptySection} emptyTitle={lesson ? 'Материалов нет' : 'Нажмите «Загрузить выданные материалы»'}/>
      <h3 className="live-section-title">Выданное домашнее задание</h3><SectionView section={lesson?.homework || emptySection} emptyTitle={lesson ? 'ДЗ не выдано' : 'Нажмите «Загрузить выданные материалы»'}/>
    </>}
  </section>;
}

import { RefreshCw } from 'lucide-react';
import type { RemoteLesson, Section } from '../../services/omni-client';
import { SectionView } from '../../components/data/RemoteData';
import { EmptyState } from '../../components/ui/EmptyState';
import { HelpTip } from '../../components/ui/HelpTip';

const emptySection: Section = { data: null, error: null };

export function IssuedMaterialsPanel({ lesson, busy, date, groupSelected, onLoad }: {
  lesson: RemoteLesson | null; busy: boolean; date: string; groupSelected: boolean; onLoad: () => void;
}) {
  return <section className="panel">
    <div className="panel-heading"><div className="help-heading"><h2>Выданные ДЗ и материалы текущего урока</h2><HelpTip label="О выданных материалах">Файлы связаны с выбранной группой, датой и парой. Методички для подготовки находятся в каталоге выше.</HelpTip></div><button className="button secondary" disabled={busy || !date || !groupSelected} onClick={onLoad}><RefreshCw size={15}/>Загрузить выданные материалы</button></div>
    {!groupSelected ? <EmptyState title="Текущая пара не выбрана" text="Загрузите занятие, чтобы увидеть выданные файлы."/> : <>
      <h3 className="live-section-title">Выданные материалы</h3><SectionView fileFallback="pdf" section={lesson?.materials || emptySection} emptyTitle={lesson ? 'Материалов нет' : 'Нажмите «Загрузить выданные материалы»'}/>
      <h3 className="live-section-title">Выданное домашнее задание</h3><SectionView section={lesson?.homework || emptySection} emptyTitle={lesson ? 'ДЗ не выдано' : 'Нажмите «Загрузить выданные материалы»'}/>
    </>}
  </section>;
}

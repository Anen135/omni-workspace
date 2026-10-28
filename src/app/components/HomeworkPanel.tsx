import { RefreshCw } from 'lucide-react';
import { useState, type ComponentProps } from 'react';
import type { Section } from '../../services/omni-client';
import { HomeworkHistory } from '../../features/homework/HomeworkHistory';
import { HomeworkTable } from '../../features/homework/HomeworkTable';
import { DataValue, hasData } from '../../components/data/RemoteData';
import { HelpTip } from '../../components/ui/HelpTip';

export function HomeworkPanel({ busy, onRefresh, accountId, catalog, ...tableProps }: Pick<ComponentProps<typeof HomeworkTable>, 'section' | 'items' | 'grading' | 'responseDraftContext' | 'studentAverages' | 'studentPhotos' | 'studentAveragesLoading' | 'studentAveragesError'> & {
  busy: boolean; onRefresh: () => void; accountId?: string; catalog?: Section;
}) {
  const [view, setView] = useState<'queue' | 'history'>('queue');
  return <section className="panel">
    <div className="panel-heading"><div className="help-heading"><h2>Работы студентов</h2><HelpTip label="О разделе «Работы студентов»">Введите оценку в строке или выберите несколько работ для общей оценки.</HelpTip></div><button className="button secondary" disabled={busy} onClick={onRefresh}><RefreshCw size={15}/>Обновить работы</button></div>
    {accountId && catalog && <div className="homework-view-tabs" role="group" aria-label="Раздел домашних заданий">
      <button type="button" className="button secondary" aria-pressed={view === 'queue'} disabled={busy} onClick={() => setView('queue')}>На проверку</button>
      <button type="button" className="button secondary" aria-pressed={view === 'history'} disabled={busy} onClick={() => setView('history')}>Журнал заданий</button>
    </div>}
    <div hidden={view !== 'queue'}>
      <HomeworkTable {...tableProps} active={view === 'queue'} render={value => hasData(value) ? <DataValue value={value}/> : <span>-</span>}/>
    </div>
    {view === 'history' && accountId && catalog && <HomeworkHistory key={accountId} accountId={accountId} catalog={catalog}/>}
  </section>;
}

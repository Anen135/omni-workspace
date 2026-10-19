import { RefreshCw } from 'lucide-react';
import type { ComponentProps } from 'react';
import { HomeworkTable } from '../../features/homework/HomeworkTable';
import { DataValue, hasData } from '../../components/data/RemoteData';
import { HelpTip } from '../../components/ui/HelpTip';

export function HomeworkPanel({ busy, onRefresh, ...tableProps }: Pick<ComponentProps<typeof HomeworkTable>, 'section' | 'items' | 'grading' | 'responseDraftContext' | 'studentAverages' | 'studentPhotos'> & {
  busy: boolean; onRefresh: () => void;
}) {
  return <section className="panel">
    <div className="panel-heading"><div className="help-heading"><h2>Работы студентов</h2><HelpTip label="О разделе «Работы студентов»">Введите оценку в строке или выберите несколько работ для общей оценки.</HelpTip></div><button className="button secondary" disabled={busy} onClick={onRefresh}><RefreshCw size={15}/>Обновить работы</button></div>
    <HomeworkTable {...tableProps} render={value => hasData(value) ? <DataValue value={value}/> : <span>—</span>}/>
  </section>;
}

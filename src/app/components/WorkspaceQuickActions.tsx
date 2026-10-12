import { CalendarDays, Download, ExternalLink } from 'lucide-react';
import { DismissiblePopover } from '../../components/DismissiblePopover';

export function WorkspaceQuickActions({ connected, schedule, busy, onExport, onConnect }: {
  connected: boolean; schedule: boolean; busy: boolean; onExport: () => void; onConnect: () => void;
}) {
  return <DismissiblePopover label="Быстрые действия" drawer>
    {connected && <button onClick={onExport}><Download size={15}/>Экспорт снимка</button>}
    <button disabled={busy} onClick={onConnect}><ExternalLink size={15}/>Открыть Omni</button>
    {schedule && <button onClick={() => window.print()}><CalendarDays size={15}/>Печать расписания</button>}
  </DismissiblePopover>;
}

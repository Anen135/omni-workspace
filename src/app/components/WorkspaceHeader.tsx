import { ChevronDown, LogIn, RefreshCw, Users } from 'lucide-react';
import { label, type Account, type RemoteRecord } from '../../services/omni-client';

export function WorkspaceHeader({ account, teachers, busy, authNeeded, desktop, extension, onRefresh, onTeacherChange, onAccountChange }: {
  account?: Account; teachers: RemoteRecord[]; busy: boolean; authNeeded: boolean; desktop: boolean; extension: boolean;
  onRefresh: () => void; onTeacherChange: (id: string) => void; onAccountChange: () => void;
}) {
  return <header className="topbar">
    <div className="topbar-workspace"><span className="workspace-mark">o<span/></span><div><strong>Академия TOP</strong><small>{account?.branch || 'Omni Workspace'}</small></div></div>
    <div className="topbar-actions">
      {account && <button className="button secondary compact" disabled={busy} onClick={onRefresh}><RefreshCw size={14} className={busy ? 'spin' : ''}/>Обновить</button>}
      {account && <label className="act-as" title={desktop ? 'Смена преподавателя доступна в официальном Omni. Затем обновите данные.' : 'Выбор преподавателя'}><Users size={14}/><span>Работаю от имени</span><select aria-label="Работаю от имени" value={account.id} disabled={busy || !teachers.length || desktop} onChange={event => onTeacherChange(event.target.value)}><option value={account.id}>{account.name}</option>{teachers.filter(teacher => label(teacher.id_teach) !== account.id).map(teacher => <option key={label(teacher.id_teach)} value={label(teacher.id_teach)}>{label(teacher.fio_teach)}</option>)}</select><ChevronDown size={13}/></label>}
      {account && extension && <button className="button secondary compact" disabled={busy} aria-label="Сменить аккаунт" onClick={onAccountChange}><LogIn size={14}/>Сменить аккаунт</button>}
      <span className={`demo-badge ${account && !authNeeded ? 'connected-badge' : ''}`}></span>
    </div>
  </header>;
}

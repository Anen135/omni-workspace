import { LogIn, RefreshCw, Users, Wifi, WifiOff } from 'lucide-react';
import { label, type Account, type RemoteRecord } from '../../services/omni-client';
import { ColorThemeToggle } from '../ColorTheme';
import { BrandMark } from '../../components/ui/BrandMark';
import './workspace-navigation.css';

export function WorkspaceHeader({ account, teachers, busy, authNeeded, desktop, extension, onRefresh, onTeacherChange, onAccountChange }: {
  account?: Account; teachers: RemoteRecord[]; busy: boolean; authNeeded: boolean; desktop: boolean; extension: boolean;
  onRefresh: () => void; onTeacherChange: (id: string) => void; onAccountChange: () => void;
}) {
  return <header className="topbar">
    <div className="topbar-workspace"><BrandMark size={30}/><div><strong>Академия TOP</strong><small>{account?.branch || 'Omni Workspace'}</small></div></div>
    <div className="topbar-actions">
      {account && <button className="button secondary compact header-icon" disabled={busy} aria-label="Обновить" title="Обновить данные Omni" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true" className={busy ? 'spin' : ''}/></button>}
      {account && <label className="act-as header-icon" title={`Работаю от имени: ${account.name}. ${desktop ? 'Смена преподавателя доступна в официальном Omni. Затем обновите данные.' : 'Выбрать преподавателя'}`}><Users size={16} aria-hidden="true"/><select aria-label="Работаю от имени" value={account.id} disabled={busy || !teachers.length || desktop} onChange={event => onTeacherChange(event.target.value)}><option value={account.id}>{account.name}</option>{teachers.filter(teacher => label(teacher.id_teach) !== account.id).map(teacher => <option key={label(teacher.id_teach)} value={label(teacher.id_teach)}>{label(teacher.fio_teach)}</option>)}</select></label>}
      {account && extension && <button className="button secondary compact header-icon" disabled={busy} aria-label="Сменить аккаунт" title="Выйти из текущего аккаунта и войти в другой" onClick={onAccountChange}><LogIn size={16} aria-hidden="true"/></button>}
      <ColorThemeToggle/>
      <span className={`demo-badge ${account && !authNeeded ? 'connected-badge' : ''}`} role="status" aria-label={account && !authNeeded ? 'Подключено к Omni' : 'Нет подключения к Omni'} title={account && !authNeeded ? 'Подключено к Omni' : 'Нет подключения к Omni'}>{account && !authNeeded ? <Wifi size={16} aria-hidden="true"/> : <WifiOff size={16} aria-hidden="true"/>}</span>
    </div>
  </header>;
}

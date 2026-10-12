import { GraduationCap, History, ShieldCheck } from 'lucide-react';
import type { Account } from '../../services/omni-client';
import { workspaceTabs, type WorkspaceTab } from './workspace-tabs';

export function WorkspaceSidebar({ account, tab, onNavigate, onDemo }: {
  account?: Account; tab: WorkspaceTab; onNavigate: (tab: WorkspaceTab) => void; onDemo: () => void;
}) {
  return <aside className="sidebar">
    <a className="brand" href="/"><span className="brand-symbol">o<span/></span>omni<span className="brand-dot">.</span></a>
    <div className="workspace"><span className="workspace-icon"><GraduationCap size={20}/></span><div><strong>Академия TOP</strong><small>{account?.branch || 'Подключение к Omni'}</small></div></div>
    <div className="nav-label">МОЁ ПРОСТРАНСТВО</div>
    <nav>{workspaceTabs.map(({ key, icon: Icon, title }) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => onNavigate(key)}><Icon size={19}/>{title}</button>)}</nav>
    <div className="sidebar-tip"><ShieldCheck size={21}/><strong>Ваш аккаунт — ваш браузер</strong><p>Сессия остаётся на этом компьютере. Приложение не сохраняет пароль.</p></div>
    <div className="sidebar-bottom"><button onClick={onDemo}><History size={17}/>Открыть демо отдельно</button><div className="profile"><span className="avatar purple">{account?.name.charAt(0) || 'П'}</span><div><strong>{account?.name || 'Аккаунт не подключён'}</strong><small>{account ? 'Реальные данные Omni' : 'Войдите для начала работы'}</small></div></div></div>
  </aside>;
}

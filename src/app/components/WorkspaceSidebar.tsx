import { useId } from 'react';
import { GraduationCap, ShieldCheck } from 'lucide-react';
import { BrandMark } from '../../components/ui/BrandMark';
import type { Account } from '../../services/omni-client';
import { workspaceTabs, type WorkspaceTab } from './workspace-tabs';
import './workspace-navigation.css';

export function WorkspaceSidebar({ account, tab, onNavigate, hasHomework = false }: {
  account?: Account; tab: WorkspaceTab; onNavigate: (tab: WorkspaceTab) => void; onDemo?: () => void; hasHomework?: boolean;
}) {
  const homeworkNotice = useId();
  return <aside className="sidebar">
    <a className="brand" href="/" aria-label="Omni Workspace"><BrandMark/>omni<span className="brand-dot">.</span></a>
    <div className="workspace"><span className="workspace-icon"><GraduationCap size={20}/></span><div><strong>Академия TOP</strong><small>{account?.branch || 'Подключение к Omni'}</small></div></div>
    <div className="nav-label">МОЁ ПРОСТРАНСТВО</div>
    <nav aria-label="Разделы рабочего пространства">{workspaceTabs.map(({ key, icon: Icon, title }) => <button key={key} className={tab === key ? 'selected' : ''} title={title}
      aria-describedby={key === 'homework' && hasHomework ? homeworkNotice : undefined} onClick={() => onNavigate(key)}>
      <span className="workspace-nav-icon"><Icon size={19} aria-hidden="true"/>{key === 'homework' && hasHomework && <span className="workspace-homework-dot" aria-hidden="true"/>}</span><span className="workspace-nav-title">{title}</span>
    </button>)}</nav>
    {hasHomework && <span id={homeworkNotice} className="workspace-nav-sr-only">Есть непроверенные домашние работы</span>}
    <div className="sidebar-tip"><ShieldCheck size={21}/><strong>Ваш аккаунт — ваш браузер</strong><p>Сессия остаётся на этом компьютере. Приложение не сохраняет пароль.</p></div>
    <div className="sidebar-bottom"><div className="profile"><span className="avatar purple">{account?.name.charAt(0) || 'П'}</span><div><strong>{account?.name || 'Аккаунт не подключён'}</strong><small>{account ? 'Реальные данные Omni' : 'Войдите для начала работы'}</small></div></div></div>
  </aside>;
}

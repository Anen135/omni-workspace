import type { ReactNode } from 'react';
import { workspaceTabs, type WorkspaceTab } from './workspace-tabs';

export function WorkspaceMobileNav({ tab, onNavigate }: {
  tab: WorkspaceTab; onNavigate: (tab: WorkspaceTab) => void; onDemo?: () => void;
}) {
  return <div className="live-mobile-nav"><select aria-label="Раздел" value={tab} onChange={event => onNavigate(event.target.value as WorkspaceTab)}>{tab === 'ui-tests' && <option value="ui-tests">Тесты UI элементов</option>}{workspaceTabs.map(item => <option key={item.key} value={item.key}>{item.title}</option>)}</select></div>;
}

export function WorkspacePageHeading({ tab, children }: { tab: WorkspaceTab; children?: ReactNode }) {
  const page = tab === 'ui-tests' ? { title: 'Тесты UI элементов', eyebrow: 'Для разработчика' } : workspaceTabs.find(item => item.key === tab)!;
  return <div className="page-heading live-heading compact-heading"><div><div className="eyebrow">{page.eyebrow}</div><h1>{page.title}</h1></div>{children}</div>;
}

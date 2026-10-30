import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { ColorThemeProvider } from './ColorTheme';
import { LiveWorkspace } from './LiveWorkspace';
import { isDesktop } from '../services/desktop-client';

const DemoApp = lazy(() => import('../demo/DemoApp'));

export interface WorkspaceConnectionProps {
  connectionForm?: ReactNode;
  connectionPending?: boolean;
  onNativeLogin?: () => void;
}

export function Workspace(props: WorkspaceConnectionProps) {
  return <ColorThemeProvider><WorkspaceContent {...props}/></ColorThemeProvider>;
}

function WorkspaceContent(props: WorkspaceConnectionProps) {
  const [demo, setDemo] = useState(() => import.meta.env.MODE !== 'extension' && location.hash === '#demo');
  useEffect(() => {
    if (import.meta.env.MODE === 'extension') return;
    const update = () => setDemo(location.hash === '#demo');
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  const preview = <Suspense fallback={<p role="status">Загружаю демонстрацию…</p>}><DemoApp/></Suspense>;
  if (import.meta.env.MODE === 'pages' && !isDesktop()) return <><div className="pages-beta-notice" role="note">Бета-тест · демонстрация на вымышленных данных. Вход в Omni доступен в desktop-приложении или при локальном запуске.</div>{preview}</>;
  return demo ? <><div className="demo-return"><button onClick={() => { if (import.meta.env.MODE !== 'extension') location.hash = ''; setDemo(false); }}>← Вернуться к реальному Omni</button></div>{preview}</> : <LiveWorkspace {...props} onDemo={() => { if (import.meta.env.MODE !== 'extension') location.hash = 'demo'; setDemo(true); }}/>;
}

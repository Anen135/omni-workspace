import type { ReactNode } from 'react';
import { LiveWorkspace } from './LiveWorkspace';
import { ColorThemeProvider } from './ColorTheme';

export interface WorkspaceConnectionProps {
  connectionForm?: ReactNode;
  connectionPending?: boolean;
  onNativeLogin?: () => void;
}

export function Workspace(props: WorkspaceConnectionProps) {
  return <ColorThemeProvider><LiveWorkspace {...props} onDemo={() => {}}/></ColorThemeProvider>;
}

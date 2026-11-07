import type { ReactNode } from 'react';
export function WorkspaceShell({ navigation, header, children, overlays }: { navigation: ReactNode; header: ReactNode; children: ReactNode; overlays: ReactNode }) {
  return <div className="app-shell live-workspace">{navigation}<main>{header}<div className="page-content">{children}</div></main>{overlays}</div>;
}

import type { WorkspaceConnectionProps } from './Workspace';
import { useWorkspaceController } from './useWorkspaceController';
import { WorkspaceView } from './WorkspaceView';

export function LiveWorkspace(props: { onDemo: () => void } & WorkspaceConnectionProps) {
  return <WorkspaceView {...useWorkspaceController(props)}/>;
}

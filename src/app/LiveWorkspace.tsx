import type { WorkspaceConnectionProps } from './Workspace';
import { useWorkspaceController } from './useWorkspaceController';
import { WorkspaceView } from './WorkspaceView';

export function LiveWorkspace(props: WorkspaceConnectionProps) {
  return <WorkspaceView {...useWorkspaceController(props)}/>;
}

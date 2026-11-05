import type { useWorkspaceController } from './useWorkspaceController';
import { LessonMaterialsDialog } from '../features/lesson/LessonMaterialsDialog';
import { isExtension } from '../services/extension-client';
import { StudentDetailDialog, WorkspaceToast } from './components/WorkspaceFeedback';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { WorkspaceQuickActions } from './components/WorkspaceQuickActions';
import { WorkspaceShell } from './components/WorkspaceShell';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import { WorkspaceContent } from './WorkspaceContent';
import './live.css';
import './workspace.css';

export function WorkspaceView(model: ReturnType<typeof useWorkspaceController>) {
  const { snapshot, teachers, busy, authNeeded, refresh, switchTeacher, changeAccount, connect } = model.session;
  const { reviewItems } = model.homework;
  const { materialsView, draftKey, materialLesson, lesson, setMaterialsView, loadCurrentMaterials } = model.lesson;
  const { tab, setTab, failed, detail, dialog, setDetail, notice, setNotice, exportSnapshot } = model.page;
  return <WorkspaceShell navigation={<WorkspaceSidebar account={snapshot?.account} tab={tab} onNavigate={setTab} hasHomework={reviewItems.some(item => item.canGrade)}/>} header={<WorkspaceHeader account={snapshot?.account} teachers={teachers} busy={busy} authNeeded={authNeeded}
        extension={isExtension()} onRefresh={() => void refresh()}
        onTeacherChange={id => void switchTeacher(id)} onAccountChange={() => void changeAccount()}/>} overlays={<>
    {snapshot && materialsView?.context === draftKey && <LessonMaterialsDialog open contextToken={draftKey} account={snapshot.account}
      currentLesson={materialLesson?.context === draftKey ? materialLesson.lesson : lesson} theme={materialsView.theme} busy={busy}
      onClose={() => setMaterialsView(null)} onLoadCurrent={loadCurrentMaterials} onConnectionError={failed}/>}
    {detail && <StudentDetailDialog dialogRef={dialog} detail={detail} onClose={() => setDetail(null)}/>}
    {notice && <WorkspaceToast message={notice} onClose={() => setNotice('')}/>}
    <WorkspaceQuickActions connected={!!snapshot} schedule={tab === 'schedule'} busy={busy}
      onExport={exportSnapshot} onConnect={() => void connect()}/>
</>}>

    <WorkspaceContent {...model}/>
  </WorkspaceShell>;
}

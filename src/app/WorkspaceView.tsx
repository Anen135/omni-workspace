import type { useWorkspaceController } from './useWorkspaceController';
import { StudentTable } from '../features/lesson/StudentTable';
import type { RemoteRecord } from '../services/omni-client';
import { ShieldCheck } from 'lucide-react';
import { SectionView } from '../components/data/RemoteData';
import { TeacherDossier } from '../features/dossier/TeacherDossier';
import { HelpPage } from '../features/help/HelpPage';
import { attendanceUnavailable } from '../features/lesson/attendance';
import { LessonMaterialsDialog } from '../features/lesson/LessonMaterialsDialog';
import { LessonThemeEditor } from '../features/lesson/LessonThemeEditor';
import { PreviousLessonCopy } from '../features/lesson/PreviousLessonCopy';
import { TeachingMaterials } from '../features/materials/TeachingMaterials';
import { ScheduleView } from '../features/schedule/ScheduleView';
import { WorkspaceSettings } from '../features/settings/WorkspaceSettings';
import { StudentsPage } from '../features/students/StudentsPage';
import { UiTestPage } from '../features/ui-tests/UiTestPage';
import { isExtension } from '../services/extension-client';
import { label, rows, type Section } from '../services/omni-client';
import { ConnectionCard } from './components/ConnectionCard';
import { HomeworkPanel } from './components/HomeworkPanel';
import { IssuedMaterialsPanel } from './components/IssuedMaterialsPanel';
import { LessonBanner, LessonSaveBar, LessonSelectors } from './components/LessonOverview';
import { LessonStudentsPanel } from './components/LessonStudentsPanel';
import { RetainedSection } from './components/RetainedSection';
import { ScheduleToolbar } from './components/ScheduleToolbar';
import { StudentDetailDialog, TeacherSwitchingState, WorkspaceError, WorkspaceLoading, WorkspaceStartup, WorkspaceToast } from './components/WorkspaceFeedback';
import { WorkspaceHeader } from './components/WorkspaceHeader';
import { WorkspaceMobileNav, WorkspacePageHeading } from './components/WorkspacePageHeading';
import { WorkspaceQuickActions } from './components/WorkspaceQuickActions';
import { WorkspaceShell } from './components/WorkspaceShell';
import { WorkspaceSidebar } from './components/WorkspaceSidebar';
import './live.css';
import './workspace.css';

const emptySection: Section = { data: null, error: null };

export function WorkspaceView(model: ReturnType<typeof useWorkspaceController>) {
  const { snapshot, teachers, busy, authNeeded, refresh, switchTeacher, changeAccount, connect, startup, error, setError, switchingTeacher, connectionInterval, setConnectionInterval, onNativeLogin, connectionForm, waiting, changingAccount, connectionState, login, sessionVersion, workspaceBusy } = model.session;
  const { reviewItems, refreshHomework, homeworkNeedsReload, gradeHomework } = model.homework;
  const { materialsView, draftKey, materialLesson, lesson, setMaterialsView, loadCurrentMaterials, attendanceSaving, draft, hasTheme, presentData, attendanceReason, bufferedDrafts, saveLessonDraft, clearLessonDraft, selectedDate, lessonStudents, currentTheme, estimates, loadLessonThemes, stageTheme, dayLessons, loadLesson, loadPreviousLesson, stagePreviousLesson, lessonTableContext, stageBulk, stageFill, stageRewardAllocation, stageMark, stageReward, markAttendance } = model.lesson;
  const { tab, setTab, failed, detail, dialog, setDetail, notice, setNotice, exportSnapshot, today, scheduleDates, scheduleRange, week, weekForDate, schedule, groupId, groups, groupName, groupStudents, openGroup, openStudent, studentAverages, averages, dossierRefreshKey, onIncomeLoading } = model.page;
  const studentTable = (items: RemoteRecord[]) => {
    const displayed = tab === 'lesson' && draft ? items.map(student => {
      const stud = label(student.id_stud);
      return { ...student, ...(draft.attendance[stud] ? { was: draft.attendance[stud].was } : {}), ...(draft.marks[`${stud}:2`] ? { mark2: draft.marks[`${stud}:2`].mark } : {}), ...(draft.marks[`${stud}:4`] ? { mark4: draft.marks[`${stud}:4`].mark } : {}), ...(draft.rewards?.[stud] ? { prize: draft.rewards[stud].reward } : {}) };
    }) : items;
    return <StudentTable studentAveragesLoading={averages.loading} studentAveragesError={averages.error} selectionContext={lessonTableContext} onBulkChange={isExtension() ? stageBulk : undefined} onFill={isExtension() ? stageFill : undefined} onRewardAllocation={isExtension() ? stageRewardAllocation : undefined} draftRewardIds={new Set(Object.keys(draft?.rewards || {}))} contextToken={draftKey} studentPhotos={averages.photos} studentAverages={studentAverages} key={`${tab}:${groupId}:${draftKey}`} items={displayed} busy={busy} lessonView={tab === 'lesson'} onOpen={student => void openStudent(student)} marks={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, allowDraft: true, onChange: stageMark } : undefined} rewards={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, onChange: stageReward } : undefined} attendance={tab === 'lesson' && isExtension() ? { unavailable: attendanceReason, saving: attendanceSaving, onChange: (student, was) => markAttendance([student], was), onAll: () => markAttendance(displayed, 1, true) } : undefined}/>;
  };
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

        <WorkspaceMobileNav tab={tab} onNavigate={setTab}/>
        {(!startup || tab === 'settings' || tab === 'help' || tab === 'ui-tests') && <WorkspacePageHeading tab={tab}>
          {tab === 'schedule' && snapshot && <ScheduleToolbar today={today} date={scheduleDates[0] || today}
            range={scheduleRange} week={week} busy={busy} onWeekChange={value => void refresh(value)}
            onDatePick={date => void refresh(weekForDate(date))}/>}
        </WorkspacePageHeading>}
        {error && <WorkspaceError message={error} busy={busy} authNeeded={authNeeded}
          onClose={() => setError('')} onRetry={() => void (authNeeded ? connect() : snapshot ? refresh() : connect())}/>}
        {switchingTeacher && <TeacherSwitchingState/>}
        {tab === 'settings' && <WorkspaceSettings interval={connectionInterval} onSave={setConnectionInterval}/>}
        {tab === 'help' && <HelpPage onUiTests={() => setTab('ui-tests')}/>}
        {tab === 'ui-tests' && <UiTestPage onBack={() => setTab('help')}/>}
        {!snapshot && !switchingTeacher && tab !== 'help' && tab !== 'settings' && tab !== 'ui-tests' && (startup ? <WorkspaceStartup onNative={onNativeLogin || (() => void connect())}/> : <ConnectionCard connectionForm={connectionForm} busy={busy} waiting={waiting}
          extension={isExtension()} changingAccount={changingAccount} connectionState={connectionState}
          onLogin={login} onConnect={onNativeLogin || (() => void connect())}/>)}
        {snapshot && <>
          {tab === 'lesson' && <div className="lesson-workspace">
            {isExtension() && <LessonSaveBar busy={busy} saving={attendanceSaving} draft={draft} hasTheme={hasTheme}
              unavailable={draft?.needsReload ? attendanceUnavailable(presentData) : attendanceReason} pendingUpload={bufferedDrafts.some(entry => entry.key === draftKey)} onSave={() => void saveLessonDraft()}
              onDiscard={() => { if (window.confirm('Удалить локальный черновик этого урока?')) clearLessonDraft(); }}/>}
            <LessonBanner account={snapshot.account} fetchedAt={snapshot.fetchedAt} date={selectedDate} students={lessonStudents} theme={currentTheme} draft={draft} estimate={estimates.current}>
              {isExtension() && <LessonThemeEditor key={draftKey} embedded contextKey={draftKey} busy={busy} unavailable={attendanceReason} currentTheme={currentTheme} draft={draft?.theme}
                onLoad={loadLessonThemes} onSave={stageTheme} onPreviewTheme={theme => setMaterialsView({ context: draftKey, theme })}/>}
            </LessonBanner>
            <LessonSelectors date={selectedDate} today={today} presents={presentData} dayLessons={dayLessons}
              busy={busy} onDatePick={date => void loadLesson(undefined, undefined, date)}
              onSchedule={() => setTab('schedule')} onSlotPick={slot => void loadLesson(undefined, slot)}>
            {isExtension() && <>
              <PreviousLessonCopy key={`copy:${draftKey}`} busy={busy} unavailable={attendanceReason} students={lessonStudents}
                date={selectedDate} slot={label(presentData.cur_lenta)} dayLessons={dayLessons}
                onLoad={loadPreviousLesson} onCopy={stagePreviousLesson}/>
            </>}
            </LessonSelectors>
            {busy && <WorkspaceLoading/>}
            <LessonStudentsPanel busy={busy} date={selectedDate} students={lessonStudents}
              groups={rows(presentData.groups)} selectedGroup={label(presentData.cur_group)}
              presentsError={!lesson && snapshot.presents.error ? snapshot.presents : undefined}
              hasDayLessons={dayLessons.length > 0}
              onReload={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}
              onGroupPick={group => void loadLesson(group, label(presentData.cur_lenta))}>
              {studentTable(lessonStudents)}
            </LessonStudentsPanel>
          </div>}
          {busy && tab !== 'lesson' && <WorkspaceLoading/>}
          {tab === 'schedule' && <section className="panel">{snapshot.schedule.error
            ? <SectionView section={snapshot.schedule}/>
            : <ScheduleView data={schedule} today={today} busy={busy} lessonEstimate={item => estimates.byKey.get(item.key) || { amount: null, initial: true }} onOpen={(date, slot) => void loadLesson(undefined, slot, date)}/>}
          </section>}
          {tab === 'groups' && <StudentsPage key={`${snapshot.account.id}:${snapshot.account.branch}:${groupId}`}
            groupsSection={snapshot.groups} groups={groups} groupName={groupName}
            groupId={groupId} studentsSection={groupStudents} busy={busy} onGroupPick={group => void openGroup(group)}
            onOpen={student => void openStudent(student)}
            onRefresh={() => { const group = groups.find(item => label(item.id_tgroups) === groupId); if (group) void openGroup(group, true); }}/>}
          {tab === 'homework' && <HomeworkPanel key={`${snapshot.account.id}:${snapshot.account.branch}:${sessionVersion.current}`} busy={busy} onRefresh={() => void refreshHomework()}
            accountId={snapshot.account.id} catalog={snapshot.homework} section={snapshot.newHomework} items={reviewItems} studentAverages={studentAverages} studentPhotos={averages.photos} studentAveragesLoading={averages.loading} studentAveragesError={averages.error}
            responseDraftContext={snapshot?.newHomework.data}
            grading={isExtension() ? { busy, unavailable: homeworkNeedsReload ? 'Перед следующей оценкой нажмите «Обновить работы».' : undefined, onGrade: gradeHomework } : undefined}/>}
          <RetainedSection key={`dossier:${snapshot.account.id}:${snapshot.account.branch}:${sessionVersion.current}`} active={tab === 'dossier'}><TeacherDossier
            accountId={snapshot.account.id} accountName={snapshot.account.name} branch={snapshot.account.branch} schedule={snapshot.schedule} today={today} disabled={workspaceBusy} active={tab === 'dossier'} refreshKey={dossierRefreshKey} onConnectionError={failed}
            onIncomeLoading={onIncomeLoading}/></RetainedSection>
          <RetainedSection key={`materials:${snapshot.account.id}:${snapshot.account.branch}:${sessionVersion.current}`} active={tab === 'materials'}>
            <TeachingMaterials accountId={snapshot.account.id} active={tab === 'materials'} refreshKey={snapshot.groups} disabled={busy} onConnectionError={failed}/>
            <IssuedMaterialsPanel lesson={lesson} busy={busy} date={selectedDate} groupSelected={!!presentData.cur_group}
              onLoad={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}/>
          </RetainedSection>
          <div className="bottom-actions"><span><ShieldCheck size={17}/>{isExtension() ? 'Данные Omni · отметки посещаемости сохраняются на сервере' : 'Данные загружены из Omni · только чтение'}</span></div>
        </>}
        <footer className="page-footer"><span>omni workspace</span><span>Больше внимания ученикам.</span><span>Локальное подключение</span></footer>

  </WorkspaceShell>;
}

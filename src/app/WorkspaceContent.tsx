import type { useWorkspaceController } from './useWorkspaceController';
import { ShieldCheck } from 'lucide-react';
import { SectionView } from '../components/data/RemoteData';
import { TeacherDossier } from '../features/dossier/TeacherDossier';
import { HelpPage } from '../features/help/HelpPage';
import { LessonPage } from '../features/lesson/LessonPage';
import { LessonAccessDialog } from '../features/lesson/LessonAccessDialog';
import { TeachingMaterials } from '../features/materials/TeachingMaterials';
import { ScheduleView } from '../features/schedule/ScheduleView';
import { WorkspaceSettings } from '../features/settings/WorkspaceSettings';
import { StudentsPage } from '../features/students/StudentsPage';
import { UiTestPage } from '../features/ui-tests/UiTestPage';
import { isExtension } from '../services/extension-client';
import { label } from '../services/omni-client';
import { ConnectionCard } from './components/ConnectionCard';
import { HomeworkPanel } from './components/HomeworkPanel';
import { IssuedMaterialsPanel } from './components/IssuedMaterialsPanel';
import { RetainedSection } from './components/RetainedSection';
import { ScheduleToolbar } from './components/ScheduleToolbar';
import { TeacherSwitchingState, WorkspaceError, WorkspaceLoading, WorkspaceStartup } from './components/WorkspaceFeedback';
import { WorkspaceMobileNav, WorkspacePageHeading } from './components/WorkspacePageHeading';


export function WorkspaceContent(model: ReturnType<typeof useWorkspaceController>) {
  const { snapshot, busy, authNeeded, refresh, connect, startup, error, setError, switchingTeacher, connectionInterval, setConnectionInterval, onNativeLogin, connectionForm, waiting, changingAccount, connectionState, login, sessionVersion, workspaceBusy } = model.session;
  const { reviewItems, refreshHomework, homeworkNeedsReload, gradeHomework } = model.homework;
  const { lesson, setMaterialsView, bufferedDrafts, estimates, draftKey, presentData, selectedDate, loadLesson, attendanceSaving, draft, hasTheme, attendanceReason, saveLessonDraft, clearLessonDraft, lessonStudents, currentTheme, loadLessonThemes, stageTheme, dayLessons, loadPreviousLesson, stagePreviousLesson, lessonTableContext, stageBulk, stageFill, stageRewardAllocation, stageMark, stageReward, markAttendance } = model.lesson;
  const { tab, setTab, failed, today, scheduleDates, scheduleRange, week, weekForDate, schedule, groupId, groups, groupName, groupStudents, openGroup, openStudent, studentAverages, averages, dossierRefreshKey, onIncomeLoading } = model.page;
  const access = model.lesson.lessonAccess;
  return <>
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
        {!snapshot && !switchingTeacher && tab !== 'help' && tab !== 'settings' && tab !== 'ui-tests' && (startup ? <WorkspaceStartup/> : <ConnectionCard connectionForm={connectionForm} busy={busy} waiting={waiting}
          extension={isExtension()} changingAccount={changingAccount} connectionState={connectionState}
          onLogin={login} onConnect={onNativeLogin || (() => void connect())}/>)}
        {snapshot && <>
          {tab === 'lesson' && <LessonPage loadingIndicator={<WorkspaceLoading/>} account={snapshot.account} fetchedAt={snapshot.fetchedAt}
            busy={busy} groupId={groupId} estimate={estimates.current}
            onRequestAccess={() => access.open()}
            draftKey={draftKey} presentData={presentData} selectedDate={selectedDate} loadLesson={loadLesson}
            attendanceSaving={attendanceSaving} draft={draft} hasTheme={hasTheme} attendanceReason={attendanceReason}
            saveLessonDraft={saveLessonDraft} clearLessonDraft={clearLessonDraft} lessonStudents={lessonStudents} currentTheme={currentTheme}
            loadLessonThemes={loadLessonThemes} stageTheme={stageTheme} dayLessons={dayLessons}
            loadPreviousLesson={loadPreviousLesson} stagePreviousLesson={stagePreviousLesson} lessonTableContext={lessonTableContext}
            stageBulk={stageBulk} stageFill={stageFill} stageRewardAllocation={stageRewardAllocation}
            stageMark={stageMark} stageReward={stageReward} markAttendance={markAttendance}
            pendingUpload={bufferedDrafts.some(entry => entry.key === draftKey)}
            presentsError={!lesson && snapshot.presents.error ? snapshot.presents : undefined}
            studentAverages={studentAverages} studentPhotos={averages.photos} studentAveragesLoading={averages.loading} studentAveragesError={averages.error}
            openStudent={openStudent} onSchedule={() => setTab('schedule')}
            onPreviewTheme={theme => setMaterialsView({ context: draftKey, theme })}/>}
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
          {access.target && <LessonAccessDialog key={`${snapshot.account.id}:${snapshot.account.branch}:${sessionVersion.current}`} target={access.target} busy={busy} blockedDates={access.blockedDates} canSend={isExtension()} onLoad={access.load} onSend={access.send} onOpen={access.openApproved} onClose={access.close}/>}
          <div className="bottom-actions"><span><ShieldCheck size={17}/>{isExtension() ? 'Данные Omni · отметки посещаемости сохраняются на сервере' : 'Данные загружены из Omni · только чтение'}</span></div>
        </>}
        <footer className="page-footer"><span>omni workspace</span><span>Больше внимания ученикам.</span><span>Локальное подключение</span></footer>

  </>;
}

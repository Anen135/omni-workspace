import type { ComponentProps, ReactNode } from 'react';
import type { RemoteRecord } from '../../services/omni-client';
import { label, rows } from '../../services/omni-client';
import { isExtension } from '../../services/extension-client';
import { LessonBanner, LessonSaveBar, LessonSelectors } from './LessonOverview';
import { LessonStudentsPanel } from './LessonStudentsPanel';
import { StudentTable } from './StudentTable';
import { attendanceLessonInfo, attendanceUnavailable } from './attendance';
import { lessonTeacherType } from './lesson-access';
import { LessonThemeEditor } from './LessonThemeEditor';
import { PreviousLessonCopy } from './PreviousLessonCopy';

type TableProps = ComponentProps<typeof StudentTable>;
type ThemeProps = ComponentProps<typeof LessonThemeEditor>;
type CopyProps = ComponentProps<typeof PreviousLessonCopy>;
type SelectorProps = ComponentProps<typeof LessonSelectors>;

export type LessonPageProps = Pick<ComponentProps<typeof LessonBanner>, 'account' | 'fetchedAt' | 'draft' | 'estimate'>
  & Pick<ComponentProps<typeof LessonSaveBar>, 'busy' | 'hasTheme' | 'pendingUpload'>
  & Pick<TableProps, 'studentAverages' | 'studentPhotos' | 'studentAveragesLoading' | 'studentAveragesError'> & {
    loadingIndicator: ReactNode;
    draftKey: string;
    groupId: string;
    attendanceSaving: boolean;
    attendanceReason: string;
    presentData: RemoteRecord;
    selectedDate: string;
    lessonStudents: RemoteRecord[];
    currentTheme: string;
    dayLessons: SelectorProps['dayLessons'];
    lessonTableContext: TableProps['selectionContext'];
    presentsError?: ComponentProps<typeof LessonStudentsPanel>['presentsError'];
    saveLessonDraft: () => void;
    clearLessonDraft: () => void;
    loadLessonThemes: ThemeProps['onLoad'];
    stageTheme: ThemeProps['onSave'];
    onPreviewTheme: ThemeProps['onPreviewTheme'];
    onSchedule: () => void;
    loadLesson: (group?: string, slot?: string, date?: string) => void;
    onRequestAccess?: () => void;
    loadPreviousLesson: CopyProps['onLoad'];
    stagePreviousLesson: CopyProps['onCopy'];
    stageBulk: TableProps['onBulkChange'];
    stageFill: TableProps['onFill'];
    stageRewardAllocation: TableProps['onRewardAllocation'];
    stageMark: NonNullable<TableProps['marks']>['onChange'];
    stageReward: NonNullable<TableProps['rewards']>['onChange'];
    markAttendance: (students: RemoteRecord[], was: Parameters<NonNullable<TableProps['attendance']>['onChange']>[1], all?: boolean) => void;
    openStudent: TableProps['onOpen'];
  };

export function LessonPage({ loadingIndicator, account, fetchedAt, busy, attendanceSaving, draft, hasTheme, presentData, attendanceReason, pendingUpload, saveLessonDraft, clearLessonDraft, selectedDate, lessonStudents, currentTheme, estimate, loadLessonThemes, stageTheme, onPreviewTheme, dayLessons, loadLesson, loadPreviousLesson, stagePreviousLesson, lessonTableContext, stageBulk, stageFill, stageRewardAllocation, stageMark, stageReward, markAttendance, draftKey, groupId, studentAverages, studentPhotos, studentAveragesLoading, studentAveragesError, openStudent, onSchedule, onRequestAccess, presentsError }: LessonPageProps) {
  const displayed = draft ? lessonStudents.map(student => {
    const stud = label(student.id_stud);
    return { ...student, ...(draft.attendance[stud] ? { was: draft.attendance[stud].was } : {}), ...(draft.marks[`${stud}:2`] ? { mark2: draft.marks[`${stud}:2`].mark } : {}), ...(draft.marks[`${stud}:4`] ? { mark4: draft.marks[`${stud}:4`].mark } : {}), ...(draft.rewards?.[stud] ? { prize: draft.rewards[stud].reward } : {}) };
  }) : lessonStudents;
  const studentTable = <StudentTable studentAveragesLoading={studentAveragesLoading} studentAveragesError={studentAveragesError} selectionContext={lessonTableContext} onBulkChange={isExtension() ? stageBulk : undefined} onFill={isExtension() ? stageFill : undefined} onRewardAllocation={isExtension() ? stageRewardAllocation : undefined} draftRewardIds={new Set(Object.keys(draft?.rewards || {}))} contextToken={draftKey} studentPhotos={studentPhotos} studentAverages={studentAverages} key={`lesson:${groupId}:${draftKey}`} items={displayed} busy={busy} lessonView onOpen={student => void openStudent(student)} marks={isExtension() ? { unavailable: attendanceReason, allowDraft: true, onChange: stageMark } : undefined} rewards={isExtension() ? { unavailable: attendanceReason, onChange: stageReward } : undefined} attendance={isExtension() ? { unavailable: attendanceReason, saving: attendanceSaving, onChange: (student, was) => markAttendance([student], was), onAll: () => markAttendance(displayed, 1, true) } : undefined}/>;
  return <div className="lesson-workspace">
    {isExtension() && <LessonSaveBar busy={busy} saving={attendanceSaving} draft={draft} hasTheme={hasTheme}
      unavailable={draft?.needsReload ? attendanceUnavailable(presentData) : attendanceReason} pendingUpload={pendingUpload} onSave={() => void saveLessonDraft()}
      onDiscard={() => { if (window.confirm('Удалить локальный черновик этого урока?')) clearLessonDraft(); }}/>}
    <LessonBanner account={account} fetchedAt={fetchedAt} date={selectedDate} students={lessonStudents} theme={currentTheme} draft={draft} estimate={estimate}>
      {isExtension() && <LessonThemeEditor key={draftKey} embedded contextKey={draftKey} busy={busy} unavailable={attendanceReason} currentTheme={currentTheme} draft={draft?.theme}
        currentTeachType={lessonTeacherType(attendanceLessonInfo(presentData)?.primary_teach || 0)} onLoad={loadLessonThemes} onSave={stageTheme} onPreviewTheme={onPreviewTheme}/>}
    </LessonBanner>
    <LessonSelectors date={selectedDate} presents={presentData} dayLessons={dayLessons}
      busy={busy}
      onSchedule={onSchedule} onSlotPick={slot => void loadLesson(undefined, slot)}>
    {onRequestAccess && <button type="button" className="button secondary" disabled={busy} aria-haspopup="dialog" onClick={onRequestAccess}>Доступ за прошлый день</button>}
    {isExtension() && <>
      <PreviousLessonCopy key={`copy:${draftKey}`} busy={busy} unavailable={attendanceReason} students={lessonStudents}
        date={selectedDate} slot={label(presentData.cur_lenta)} dayLessons={dayLessons}
        onLoad={loadPreviousLesson} onCopy={stagePreviousLesson}/>
    </>}
    </LessonSelectors>
    {busy && loadingIndicator}
    <LessonStudentsPanel busy={busy} date={selectedDate} students={lessonStudents}
      groups={rows(presentData.groups)} selectedGroup={label(presentData.cur_group)}
      presentsError={presentsError}
      hasDayLessons={dayLessons.length > 0}
      onReload={() => void loadLesson(label(presentData.cur_group), label(presentData.cur_lenta))}
      onGroupPick={group => void loadLesson(group, label(presentData.cur_lenta))}>
      {studentTable}
    </LessonStudentsPanel>
  </div>;
}

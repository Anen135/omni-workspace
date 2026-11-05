import type { Dispatch, RefObject, SetStateAction } from 'react';
import { attendanceDraftKey, attendanceStatus, attendanceVisit, type AttendanceChange, type AttendanceStatus } from '../features/lesson/attendance';
import { stageLessonBulk, stageLessonRewardTargets, type LessonBulkChange, type RewardTarget } from '../features/lesson/lesson-bulk';
import { copyLessonDraft, type CopySelection, type CopySource, type PreviousLessonData } from '../features/lesson/lesson-copy';
import { emptyLessonDraft, hasLessonChanges, lessonDraftConflict, markValue, reconcileLessonDraft, stageAttendanceChange, stageMarkChange, stageRewardChange, type LessonDraft } from '../features/lesson/lesson-draft';
import { stageLessonFill, type LessonFillRequest } from '../features/lesson/lesson-fill';
import { lessonRewardBudget, lessonRewardDraftAllowed, rewardLevel, rewardMaximum, rewardValue, type LessonReward } from '../features/lesson/lesson-reward';
import { type ThemeChoice, type ThemeData } from '../features/lesson/LessonThemeEditor';
import { presentLessons } from '../features/lesson/present-lessons';
import { isExtension } from '../services/extension-client';
import { bufferRequest, type BufferedLessonDraft } from '../services/lesson-draft-buffer';
import { ConnectionError, label, omniRequest, record, rows, type RemoteLesson, type RemoteRecord, type Section, type Snapshot } from '../services/omni-client';


const emptySection: Section = { data: null, error: null };
type Options = {
week: number;
setLessonDrafts: Dispatch<SetStateAction<Record<string, LessonDraft>>>;
snapshot: Snapshot | null;
operation: RefObject<boolean>;
attendanceReason: string;
lessonStudents: RemoteRecord[];
draftKey: string;
averages: { values: ReadonlyMap<string, string> | undefined; photos: ReadonlyMap<string, string> | undefined; error: string; loading: boolean; };
draft: LessonDraft;
studentAverages: ReadonlyMap<string, string> | undefined;
setNotice: Dispatch<SetStateAction<string>>;
presentData: RemoteRecord;
selectedDate: string;
sessionVersion: RefObject<number>;
setBusy: Dispatch<SetStateAction<boolean>>;
setError: Dispatch<SetStateAction<string>>;
failed: (reason: unknown) => void;
ensureAccount: (account: { id: string; }) => void;
bufferedDrafts: BufferedLessonDraft[];
setBufferedDrafts: Dispatch<SetStateAction<BufferedLessonDraft[]>>;
hasTheme: boolean;
attemptedBuffers: RefObject<Set<string>>;
setAttendanceSaving: Dispatch<SetStateAction<boolean>>;
setSnapshot: Dispatch<SetStateAction<Snapshot | null>>;
setLesson: Dispatch<SetStateAction<RemoteLesson | null>>;
setGroupStudents: Dispatch<SetStateAction<Section | null>>;
setGroupId: Dispatch<SetStateAction<string>>;
setGroupName: Dispatch<SetStateAction<string>>;
setDetail: Dispatch<SetStateAction<{ title: string; student: RemoteRecord; sections: Section[]; } | null>>;
setRosterRevision: Dispatch<SetStateAction<number>>
};
export function createWorkspaceLessonDraft({ week, setLessonDrafts, snapshot, operation, attendanceReason, lessonStudents, draftKey, averages, draft, studentAverages, setNotice, presentData, selectedDate, sessionVersion, setBusy, setError, failed, ensureAccount, bufferedDrafts, setBufferedDrafts, hasTheme, attemptedBuffers, setAttendanceSaving, setSnapshot, setLesson, setGroupStudents, setGroupId, setGroupName, setDetail, setRosterRevision }: Options) {
  function storeDraft(key: string, next: LessonDraft) {
    setLessonDrafts(current => {
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[key] = { ...next, attendance: { ...next.attendance }, marks: { ...next.marks }, rewards: { ...next.rewards } };
      else delete updated[key];
      return updated;
    });
  }
  function reconcileDrafts(account: string, branch: string, presents: RemoteRecord) {
    const key = attendanceDraftKey(account, branch, presents);
    setLessonDrafts(current => {
      if (!current[key]) return current;
      const next = reconcileLessonDraft(current[key], presents);
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[key] = next;
      else delete updated[key];
      return updated;
    });
  }
  function stageMark(student: RemoteRecord, type: 2 | 4, mark: number) {
    if (!snapshot || operation.current || attendanceReason) return;
    const stud = label(student.id_stud);
    const base = lessonStudents.find(item => label(item.id_stud) === stud);
    if (!base) return;
    setLessonDrafts(current => {
      const next = stageMarkChange(current[draftKey] || emptyLessonDraft(), base, type, mark);
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(updated[draftKey])) delete updated[draftKey];
      return updated;
    });
  }
  function stageBulk(students: readonly RemoteRecord[], change: LessonBulkChange) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) throw new Error(attendanceReason || 'Дождитесь завершения операции.');
    if ((change.column === 'average2' || change.column === 'average4') && (averages.loading || averages.error)) throw new Error(averages.error || 'Дождитесь загрузки средних оценок.');
    const next = stageLessonBulk(lessonStudents, draft || emptyLessonDraft(), students.map(student => label(student.id_stud)), change, studentAverages);
    storeDraft(draftKey, next);
    setNotice(`Правка добавлена в черновик для ${students.length} учеников. Нажмите «Сохранить».`);
  }
  function stageFill(request: LessonFillRequest, fingerprint: string) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) throw new Error(attendanceReason || 'Дождитесь завершения операции.');
    const conflict = draft && lessonDraftConflict(draft, presentData);
    if (conflict) throw new Error(conflict);
    const next = stageLessonFill(lessonStudents, draft || emptyLessonDraft(), studentAverages, draftKey, request, fingerprint,
      averages.loading ? 'Дождитесь загрузки средних оценок.' : averages.error || '');
    storeDraft(draftKey, next);
    setNotice('Заполнение добавлено в черновик. Проверьте оценки и нажмите «Сохранить».');
  }
  function stageRewardAllocation(targets: readonly RewardTarget[]) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) throw new Error(attendanceReason || 'Дождитесь завершения операции.');
    const next = stageLessonRewardTargets(lessonStudents, draft || emptyLessonDraft(), targets);
    storeDraft(draftKey, next);
    setNotice('Распределение топкойнов добавлено в черновик. Проверьте и нажмите «Сохранить».');
  }
  function stageReward(student: RemoteRecord, reward: LessonReward) {
    if (!snapshot || operation.current || attendanceReason) return;
    const matches = lessonStudents.filter(item => label(item.id_stud) === label(student.id_stud));
    if (matches.length !== 1) return;
    setLessonDrafts(current => {
      const currentDraft = current[draftKey] || emptyLessonDraft();
      const stud = label(student.id_stud);
      const was = currentDraft.attendance[stud]?.was ?? attendanceStatus(matches[0].was);
      if ((was !== 1 && was !== 2) || rewardLevel(matches[0].prize) === null) return current;
      const budget = lessonRewardBudget(lessonStudents, currentDraft.rewards);
      const value = currentDraft.rewards?.[stud]?.reward ?? matches[0].prize;
      const requested = rewardLevel(reward);
      if (requested === null || requested > rewardMaximum(value, budget.remaining)) return current;
      const next = stageRewardChange(currentDraft, matches[0], reward);
      if (!lessonRewardDraftAllowed(lessonStudents, next.rewards)) return current;
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(next)) delete updated[draftKey];
      return updated;
    });
  }
  async function loadPreviousLesson(source: CopySource): Promise<PreviousLessonData> {
    if (!snapshot || operation.current || attendanceReason) throw new Error('Дождитесь завершения операции и загрузите текущий урок.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.date) || source.date > selectedDate || source.date === selectedDate && (source.slot === undefined || Number(source.slot) >= Number(presentData.cur_lenta))) throw new Error('Выберите пару, которая была раньше текущего урока.');
    const version = sessionVersion.current;
    const accountId = snapshot.account.id;
    const group = label(presentData.cur_group);
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<RemoteLesson>('lesson', { date: source.date, group, ...(source.slot !== undefined ? { lenta: source.slot } : {}) });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась. Загрузите текущий урок заново.');
      if (result.account.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Загрузите текущий урок заново.');
      const presents = record(result.presents);
      const loadedSlot = label(presents.cur_lenta);
      if (presents.cur_date !== source.date || label(presents.cur_group) !== group || !/^\d{1,12}$/.test(loadedSlot) || source.slot !== undefined && loadedSlot !== source.slot || source.date === selectedDate && Number(loadedSlot) >= Number(presentData.cur_lenta)) throw new Error('Omni не подтвердил выбранную прошлую пару для этой группы.');
      const slots = presentLessons(presents.schedule);
      const selected = slots.find(item => item.slot === loadedSlot);
      return { students: rows(presents.students), date: source.date, slot: loadedSlot, dayLessons: slots, description: `${source.date.split('-').reverse().join('.')} · ${selected?.title || `Пара · ${loadedSlot}`}${selected?.time ? ` · ${selected.time}` : ''}` };
    } catch (reason) {
      if (version === sessionVersion.current && reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) failed(reason);
      throw reason;
    } finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  function stagePreviousLesson(source: PreviousLessonData, selection: CopySelection) {
    if (!snapshot || operation.current || attendanceReason) return;
    if (source.date > selectedDate || source.date === selectedDate && Number(source.slot) >= Number(presentData.cur_lenta)) return;
    if (selection.overwrite && !window.confirm('Заменить заполненные отметки, оценки и топкойны этого урока выбранными значениями с прошлой пары? Изменения останутся в черновике до нажатия «Сохранить».')) return;
    setLessonDrafts(current => {
      const next = copyLessonDraft(current[draftKey] || emptyLessonDraft(), lessonStudents, source.students, selection);
      if (!lessonRewardDraftAllowed(lessonStudents, next.rewards)) {
        setNotice('Перенос отменён: на урок можно выдать не больше 5 топкойнов. Уменьшите награды или отключите их перенос. Черновик не изменён.');
        return current;
      }
      const updated = { ...current };
      if (hasLessonChanges(next)) updated[draftKey] = next;
      else delete updated[draftKey];
      setNotice('Выбранные значения прошлой пары перенесены в черновик. Нажмите «Сохранить» для отправки в Omni.');
      return updated;
    });
  }
  async function loadLessonThemes(): Promise<ThemeData> {
    if (!snapshot || operation.current) throw new Error('Дождитесь завершения операции.');
    const version = sessionVersion.current;
    operation.current = true; setBusy(true); setError('');
    try {
      const result = await omniRequest<ThemeData & { account: { id: string } }>('lesson-themes', {
        accountId: snapshot.account.id, date: label(presentData.cur_date), group: label(presentData.cur_group),
        lenta: label(presentData.cur_lenta), schedule: label(presentData.cur_schedule),
      });
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      ensureAccount(result.account);
      return result;
    } catch (reason) {
      if (version === sessionVersion.current) failed(reason);
      throw reason;
    } finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); } }
  }
  async function stageTheme(choice: ThemeChoice) {
    if (operation.current || attendanceReason) throw new Error('Перечитайте урок перед изменением темы.');
    setLessonDrafts(current => {
      const next = current[draftKey] || emptyLessonDraft();
      return { ...current, [draftKey]: { ...next, theme: { ...choice, previousTheme: next.theme ? next.theme.previousTheme : choice.previousTheme } } };
    });
    setNotice('Тема добавлена в черновик. Нажмите «Сохранить» в разделе «Мой урок».');
  }
  function markAttendance(items: RemoteRecord[], was: AttendanceStatus, all = false) {
    if (!snapshot || !isExtension() || operation.current || attendanceReason) return;
    if (all && !window.confirm(`Отметить присутствующими всю группу (${items.length} учеников), включая скрытых поиском? Отметки останутся в черновике до нажатия «Сохранить».`)) return;
    setLessonDrafts(current => {
      let next = current[draftKey] || emptyLessonDraft();
      for (const student of items) {
        const stud = label(student.id_stud);
        const base = lessonStudents.find(item => label(item.id_stud) === stud);
        if (!base) continue;
        next = stageAttendanceChange(next, base, was);
      }
      const updated = { ...current, [draftKey]: next };
      if (!hasLessonChanges(updated[draftKey])) delete updated[draftKey];
      return updated;
    });
  }
  async function clearLessonDraft() {
    const version = sessionVersion.current;
    const buffered = bufferedDrafts.find(entry => entry.key === draftKey);
    if (buffered) {
      try {
        const claimed = await bufferRequest({ op: 'claim', key: buffered.key, revision: buffered.revision, manual: true });
        if (!claimed) return;
        await bufferRequest({ op: 'remove', key: claimed.key, revision: claimed.revision });
        if (version !== sessionVersion.current) return;
        setBufferedDrafts(current => current.filter(entry => entry.key !== draftKey));
      } catch (reason) { if (version === sessionVersion.current) setError(reason instanceof Error ? reason.message : 'Не удалось удалить буфер.'); return; }
    }
    setLessonDrafts(current => { const next = { ...current }; delete next[draftKey]; return next; });
  }
  async function saveLessonDraft(automatic = false, buffered?: BufferedLessonDraft) {
    const source = buffered?.draft || draft;
    if (!snapshot || !source || operation.current || (!buffered && attendanceReason && !source.needsReload)) return;
    if (!buffered && !lessonRewardDraftAllowed(lessonStudents, source.rewards)) { setError('Нельзя увеличить награды: лимит урока — 5 топкоинов.'); return; }
    if (!buffered && !hasTheme && !source.theme) { setError('Добавьте тему урока в черновик перед сохранением.'); return; }
    if (!automatic && source.theme && !window.confirm('Сохранить тему и все изменения урока в Omni? Сохранение выбранной выдачи ДЗ и практической работы тоже применится.')) return;
    const version = sessionVersion.current;
    const key = buffered?.key || draftKey;
    const [accountId, branch, date, group, lenta, schedule] = JSON.parse(key) as string[];
    if (snapshot.account.id !== accountId || (snapshot.account.branch || '') !== branch) return;
    const params = { accountId, date, group, lenta, schedule };
    let pending: LessonDraft = { ...source, attendance: { ...source.attendance }, marks: { ...source.marks }, rewards: { ...source.rewards } };
    let envelope: BufferedLessonDraft | null = null;
    let uncertain = false;
    let mutationStarted = false;
    attemptedBuffers.current.add(`${version}:${key}`);
    operation.current = true; setBusy(true); setAttendanceSaving(true); setError(''); setNotice('');
    function track(entry: BufferedLessonDraft | null) {
      if (version !== sessionVersion.current) return;
      setBufferedDrafts(current => entry ? [...current.filter(item => item.key !== key), entry] : current.filter(item => item.key !== key));
    }
    async function checkpoint(state: 'ready' | 'uncertain' | 'review', release = false) {
      if (!envelope) throw new Error('Нет сохранённого буфера. Отправка остановлена.');
      const next = await bufferRequest({ op: 'checkpoint', key, revision: envelope.revision, draft: pending, state, release });
      if (!next) throw new Error('Локальный буфер изменился. Перечитайте урок.');
      envelope = next; track(next);
    }
    async function dispatchWrite<T>(action: string, input: Record<string, unknown>): Promise<T> {
      await checkpoint('uncertain');
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      uncertain = true; mutationStarted = true;
      return omniRequest<T>(action, input);
    }
    function accept(result: { account: { id: string; branch?: string }; presents: unknown }, themeChanged = false) {
      if (version !== sessionVersion.current) throw new Error('Сессия изменилась.');
      ensureAccount(result.account);
      if (result.account.id !== accountId) throw new Error('Аккаунт изменился. Черновик не отправлен.');
      const presents = record(result.presents);
      if (result.account.branch !== undefined && result.account.branch !== branch || attendanceDraftKey(params.accountId, branch, presents) !== key) throw new Error('Omni вернул другое занятие. Перечитайте урок.');
      if (key === draftKey) {
        setSnapshot(current => current ? { ...current, presents: { data: presents, error: null } } : null);
        setLesson(current => current ? { ...current, presents, ...(themeChanged ? { materials: emptySection, homework: emptySection } : {}) } : null);
      }
      return presents;
    }
    try {
      const existing = buffered || bufferedDrafts.find(entry => entry.key === key);
      if (existing) {
        envelope = await bufferRequest({ op: 'claim', key, revision: existing.revision, manual: !automatic });
        if (!envelope) return;
        // A restored uncertainty is not permission to repeat material issuance.
        if (envelope.state === 'uncertain' && envelope.draft.theme) {
          throw new Error('Результат выдачи материалов не подтверждён. Проверьте урок в Omni; автоматический повтор темы отключён.');
        }
        if (!automatic) await checkpoint(envelope.state);
      } else {
        envelope = await bufferRequest({ op: 'put', key, draft: pending, state: 'ready' });
        if (!envelope) throw new Error('Не удалось создать локальный буфер.');
      }
      track(envelope);
      // Mutation responses expose teacher ID only; snapshot is the existing
      // authoritative source of branch identity. Verify it before replay.
      const verified = await omniRequest<Snapshot>('snapshot', { week });
      if (version !== sessionVersion.current || verified.account.id !== accountId || verified.account.branch !== branch) throw new Error('Аккаунт или филиал изменился. Черновик не отправлен.');
      let fresh = accept(await omniRequest<RemoteLesson>('lesson', { date: params.date, group: params.group, lenta: params.lenta }));
      pending = reconcileLessonDraft(pending, fresh);
      const conflict = lessonDraftConflict(pending, fresh);
      if (conflict) throw new Error(conflict);
      if (!lessonRewardDraftAllowed(rows(fresh.students), pending.rewards)) throw new Error('Общее количество топкойнов изменилось в Omni. Лимит урока — 5. Перечитайте урок и уменьшите награды.');
      if (pending.theme) {
        const result = await dispatchWrite<{ account: { id: string; branch?: string }; presents: unknown; warning?: string }>('set-lesson-theme', { ...params, ...pending.theme });
        fresh = accept(result, true);
        delete pending.theme;
        // Our confirmed theme save may create visits or reset attendance. Only
        // this successful operation authorizes rebasing the remaining draft.
        const students = rows(fresh.students);
        for (const [stud, change] of Object.entries(pending.attendance)) {
          const matches = students.filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1) { storeDraft(key, pending); throw new Error('После сохранения темы изменился список учеников. Перечитайте урок.'); }
          pending.attendance[stud] = { ...change, previousWas: attendanceStatus(matches[0].was), visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [markKey, change] of Object.entries(pending.marks)) {
          const matches = students.filter(student => label(student.id_stud) === change.stud);
          if (matches.length !== 1 || markValue(matches[0][`mark${change.type}`]) !== change.previousMark) { storeDraft(key, pending); throw new Error('После сохранения темы изменилась оценка ученика. Перечитайте урок.'); }
          pending.marks[markKey] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [stud, change] of Object.entries(pending.rewards || {})) {
          const matches = students.filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1 || rewardValue(matches[0].prize) !== change.previousReward) { storeDraft(key, pending); throw new Error('После сохранения темы изменились топкойны ученика. Перечитайте урок.'); }
          pending.rewards![stud] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        uncertain = false;
        await checkpoint('ready');
        if (version === sessionVersion.current) storeDraft(key, pending);
        if (version === sessionVersion.current && result.warning) { setError(result.warning); }
      }
      const changes: AttendanceChange[] = Object.values(pending.attendance);
      if (changes.length) {
        fresh = accept(await dispatchWrite<{ account: { id: string; branch?: string }; presents: unknown }>('set-attendance', { ...params, changes }));
        pending.attendance = {};
        for (const [markKey, change] of Object.entries(pending.marks)) {
          if (!changes.some(attendance => attendance.stud === change.stud)) continue;
          const matches = rows(fresh.students).filter(student => label(student.id_stud) === change.stud);
          if (matches.length !== 1 || markValue(matches[0][`mark${change.type}`]) !== change.previousMark) { storeDraft(key, pending); throw new Error('После сохранения посещаемости изменилась оценка ученика. Перечитайте урок.'); }
          pending.marks[markKey] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        for (const [stud, change] of Object.entries(pending.rewards || {})) {
          if (!changes.some(attendance => attendance.stud === stud)) continue;
          const matches = rows(fresh.students).filter(student => label(student.id_stud) === stud);
          if (matches.length !== 1 || rewardValue(matches[0].prize) !== change.previousReward) { storeDraft(key, pending); throw new Error('После сохранения посещаемости изменились топкойны ученика. Перечитайте урок.'); }
          pending.rewards![stud] = { ...change, visit: attendanceVisit(matches[0].id_vizit) };
        }
        uncertain = false;
        await checkpoint('ready');
        if (version === sessionVersion.current) storeDraft(key, pending);
      }
      for (const [markKey, change] of Object.entries(pending.marks)) {
        const matches = rows(fresh.students).filter(student => label(student.id_stud) === change.stud);
        if (matches.length !== 1 || !(Number(matches[0].id_vizit) > 0) || attendanceVisit(matches[0].id_vizit) !== change.visit) throw new Error('Запись посещения для оценки недоступна или изменилась. Перечитайте урок.');
        fresh = accept(await dispatchWrite<{ account: { id: string; branch?: string }; presents: unknown }>('set-lesson-mark', { ...params, ...change, visit: label(matches[0].id_vizit) }));
        delete pending.marks[markKey];
        uncertain = false;
        await checkpoint('ready');
        if (version === sessionVersion.current) storeDraft(key, pending);
      }
      // Release allocated coins first, so a redistribution cannot exceed the
      // limit temporarily even when its final draft fits within five coins.
      const rewardChanges = Object.entries(pending.rewards || {}).sort(([, a], [, b]) =>
        (rewardLevel(a.reward)! - (rewardLevel(a.previousReward) ?? 0)) - (rewardLevel(b.reward)! - (rewardLevel(b.previousReward) ?? 0)));
      for (const [stud, change] of rewardChanges) {
        const matches = rows(fresh.students).filter(student => label(student.id_stud) === stud);
        if (matches.length !== 1 || !(Number(matches[0].id_vizit) > 0) || attendanceVisit(matches[0].id_vizit) !== change.visit) throw new Error('Запись посещения для топкойнов недоступна или изменилась. Перечитайте урок.');
        if (!lessonRewardDraftAllowed(rows(fresh.students), { [stud]: change })) throw new Error('Лимит урока — 5 топкойнов. Награды в Omni изменились: перечитайте урок перед увеличением.');
        fresh = accept(await dispatchWrite<{ account: { id: string; branch?: string }; presents: unknown }>('set-lesson-reward', { ...params, ...change, visit: label(matches[0].id_vizit) }));
        delete pending.rewards![stud];
        uncertain = false;
        await checkpoint('ready');
        if (version === sessionVersion.current) storeDraft(key, pending);
      }
      if (envelope) await bufferRequest({ op: 'remove', key, revision: envelope.revision });
      if (version !== sessionVersion.current) return;
      track(null);
      storeDraft(key, emptyLessonDraft());
      if (key === draftKey) { setGroupStudents(null); setGroupId(''); setGroupName(''); setDetail(null); }
      setNotice('Изменения урока сохранены в Omni.');
    } catch (reason) {
      // Explicit server rejections confirm no write; transport/auth failures do not.
      if (reason instanceof ConnectionError && ['THEME_REJECTED', 'ATTENDANCE_REJECTED', 'MARK_REJECTED', 'REWARD_REJECTED', 'THEME_CONFLICT', 'ATTENDANCE_CONFLICT', 'MARK_CONFLICT', 'REWARD_CONFLICT', 'BAD_INPUT', 'THEME_UNAVAILABLE'].includes(reason.code)) uncertain = false;
      if (envelope) {
        const retryAfterLogin = !mutationStarted && reason instanceof ConnectionError && ['AUTH_REQUIRED', 'CHALLENGE', 'OFFLINE'].includes(reason.code);
        try { await checkpoint(uncertain || !mutationStarted && envelope.state === 'uncertain' ? 'uncertain' : retryAfterLogin ? 'ready' : 'review', true); }
        catch { /* Previous durable checkpoint remains conservative after navigation/storage failure. */ }
      }
      if (version === sessionVersion.current) {
        storeDraft(key, { ...pending, needsReload: true });
        failed(reason);
      }
    } finally { if (version === sessionVersion.current) { operation.current = false; setBusy(false); setAttendanceSaving(false); setRosterRevision(value => value + 1); } }
  }

return { storeDraft, reconcileDrafts, stageMark, stageBulk, stageFill, stageRewardAllocation, stageReward, loadPreviousLesson, stagePreviousLesson, loadLessonThemes, stageTheme, markAttendance, clearLessonDraft, saveLessonDraft };
}

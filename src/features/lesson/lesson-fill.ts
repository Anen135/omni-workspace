import { stageMarkChange, type LessonDraft } from './lesson-draft';
import { lessonSortNumber } from './lesson-table-sort';

type Row = Record<string, unknown>;
export type LessonFillRequest = {
  target: 'mark2' | 'mark4'; method: 'constant' | 'field' | 'mean'; value: string;
  source: 'average' | 'mark2' | 'mark4'; rounding: 'ceil' | 'floor' | 'nearest';
  empty: 'block' | 'skip'; overwrite: boolean; targetIds: readonly string[]; sourceIds: readonly string[];
};
export type LessonFillSnapshot = { students: readonly Row[]; averages?: ReadonlyMap<string, string>; context: string; sourceUnavailable?: string };
export type LessonFillProposal = {
  fingerprint: string; blockedReason: string; aggregate: number | null;
  sources: { id: string; name: string; value: number | null; reason: string }[];
  rows: { id: string; name: string; before: string; after: number | null; reason: string; apply: boolean }[];
};
const idOf = (row: Row) => String(row.id_stud ?? '');
const missing = (value: unknown) => value == null || typeof value === 'string' && value.trim() === '';
const encode = (value: unknown) => [typeof value, String(value)];
const averageRaw = (snapshot: LessonFillSnapshot, row: Row): unknown => snapshot.averages?.has(idOf(row))
  ? snapshot.averages.get(idOf(row)) : row.gpa ?? row.average ?? row.avg_mark;

export function lessonFillRows(students: readonly Row[], draft: LessonDraft): Row[] {
  return students.map(row => {
    const id = idOf(row);
    return { ...row, mark2: draft.marks[`${id}:2`]?.mark ?? row.mark2, mark4: draft.marks[`${id}:4`]?.mark ?? row.mark4 };
  });
}

export function lessonFillFingerprint(snapshot: LessonFillSnapshot, request: LessonFillRequest): string {
  return JSON.stringify([snapshot.context, snapshot.sourceUnavailable || '', { ...request, targetIds: [...request.targetIds].sort(), sourceIds: [...request.sourceIds].sort() },
    snapshot.students.map(row => [idOf(row), row.fio_stud, ...['id_vizit', 'mark2', 'mark4'].map(key => encode(row[key])),
      encode(averageRaw(snapshot, row))]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ]);
}

/** Calculate every value from the same immutable effective snapshot. No draft is changed. */
export function createLessonFill(snapshot: LessonFillSnapshot, request: LessonFillRequest): LessonFillProposal {
  const proposal: LessonFillProposal = { fingerprint: lessonFillFingerprint(snapshot, request), blockedReason: '', aggregate: null, sources: [], rows: [] };
  const fail = (reason: string) => { proposal.blockedReason ||= reason; };
  const ids = snapshot.students.map(idOf);
  if (ids.some(id => !/^[1-9]\d{0,11}$/.test(id)) || new Set(ids).size !== ids.length) fail('Состав учеников содержит некорректные или повторяющиеся ID. Загрузите урок.');
  if (!['mark2', 'mark4'].includes(request.target) || !['constant', 'field', 'mean'].includes(request.method)
    || !['average', 'mark2', 'mark4'].includes(request.source) || !['ceil', 'floor', 'nearest'].includes(request.rounding)
    || !['block', 'skip'].includes(request.empty) || typeof request.overwrite !== 'boolean') fail('Недопустимые параметры заполнения.');
  function resolve(targetIds: readonly string[], label: string) {
    if (!targetIds.length || new Set(targetIds).size !== targetIds.length || targetIds.some(id => !ids.includes(id))) {
      fail(`Проверьте область «${label}»: нужны существующие уникальные ученики.`); return [];
    }
    return [...targetIds].sort().map(id => snapshot.students.find(row => idOf(row) === id)!);
  }
  const targets = resolve(request.targetIds, 'Получатели');
  const sourceRows = request.method === 'mean' ? resolve(request.sourceIds, 'Область расчёта') : request.method === 'field' ? targets : [];
  if (request.method !== 'constant' && request.source === 'average' && snapshot.sourceUnavailable) fail(snapshot.sourceUnavailable);
  const sourceValues = new Map<string, number | null>();
  for (const row of sourceRows) {
    const id = idOf(row);
    const raw = request.source === 'average' ? averageRaw(snapshot, row) : row[request.source];
    const value = lessonSortNumber(raw);
    let reason = '';
    if (missing(raw)) {
      reason = request.empty === 'skip' ? 'Пустой источник исключён явно.' : 'Нет исходной оценки.';
      if (request.empty !== 'skip') fail('Есть пустые источники. Проверьте строки или явно разрешите их исключение.');
    } else if (value === null || value < 1 || value > 100) { reason = 'Источник должен быть конечным числом от 1 до 100.'; fail(reason); }
    const usable = !reason ? value : null;
    sourceValues.set(id, usable);
    proposal.sources.push({ id, name: String(row.fio_stud ?? 'Имя не получено'), value: usable, reason });
  }
  if (request.method === 'mean') {
    const values = [...sourceValues.values()].filter((value): value is number => value !== null);
    if (!values.length) fail('Нет допустимых значений для расчёта среднего.');
    else proposal.aggregate = values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  const constant = lessonSortNumber(request.value);
  if (request.method === 'constant' && (constant === null || !Number.isInteger(constant) || constant < 1 || constant > 100)) fail('Введите целую оценку от 1 до 100.');
  const round = request.rounding === 'ceil' ? Math.ceil : request.rounding === 'floor' ? Math.floor : Math.round;
  for (const row of targets) {
    const id = idOf(row), before = missing(row[request.target]) ? '' : String(row[request.target]);
    const raw = request.method === 'constant' ? constant : request.method === 'mean' ? proposal.aggregate : sourceValues.get(id) ?? null;
    const after = raw === null ? null : request.method === 'constant' ? raw : round(raw);
    let reason = after === null ? 'Нет результата для ученика.' : '';
    if (after !== null && (!Number.isInteger(after) || after < 1 || after > 100)) { reason = 'Результат вне допустимой шкалы 1–100.'; fail(reason); }
    if (before && !request.overwrite) reason = 'Заполненная оценка сохранена.';
    else if (after !== null && lessonSortNumber(before) === after) reason = 'Значение уже совпадает.';
    proposal.rows.push({ id, name: String(row.fio_stud ?? id), before, after, reason, apply: !reason && after !== null });
  }
  return proposal;
}

/** Recompute from current data before publishing a complete candidate using original baselines. */
export function stageLessonFill(students: readonly Row[], draft: LessonDraft, averages: ReadonlyMap<string, string> | undefined,
  context: string, request: LessonFillRequest, fingerprint: string, sourceUnavailable = ''): LessonDraft {
  if (draft.needsReload) throw new Error('Перед заполнением загрузите урок заново.');
  const snapshot = { students: lessonFillRows(students, draft), averages, context, sourceUnavailable };
  const proposal = createLessonFill(snapshot, request);
  if (proposal.fingerprint !== fingerprint) throw new Error('Данные или контекст изменились. Рассчитайте заполнение заново.');
  if (proposal.blockedReason) throw new Error(proposal.blockedReason);
  const byId = new Map(students.map(row => [idOf(row), row]));
  return proposal.rows.filter(row => row.apply).reduce((next, row) => stageMarkChange(next, byId.get(row.id)!, request.target === 'mark2' ? 2 : 4, row.after!), draft);
}

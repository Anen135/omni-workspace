import type { RemoteRecord } from '../../services/omni-client';

const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const object = (value: unknown): value is RemoteRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const fail = (): never => { throw new Error('Omni вернул неподдерживаемый формат истории домашних заданий.'); };
export const homeworkHistoryId = (value: unknown): string => /^[1-9]\d{0,11}$/.test(text(value)) ? text(value) : '';

function entries(value: unknown): [string, RemoteRecord][] {
  if (!Array.isArray(value) && !object(value)) return fail();
  return Object.entries(value).map(([key, item]) => object(item) ? [key, item] : fail());
}

export type HomeworkHistoryGroup = { id: string; name: string; subjects: { key: string; name: string; source: RemoteRecord }[] };

/** The type-0 get-group-spec catalog; subject tuples must retain their original values. */
export function homeworkHistoryGroups(data: unknown): HomeworkHistoryGroup[] {
  if (!object(data) || (!object(data.groups_spec) && !Array.isArray(data.groups_spec))) return fail();
  const scalar = (value: unknown) => value == null || typeof value === 'string' || typeof value === 'number' && Number.isFinite(value);
  const groups = entries(data.groups_spec).map(([key, group]) => {
    const id = homeworkHistoryId(group.id_tgroups ?? key);
    if (!id) return fail();
    const subjects = entries(group.data).map(([, subject]) => {
      if (subject.id_spec === null ? !homeworkHistoryId(subject.id_base_spec) : !homeworkHistoryId(subject.id_spec)) return fail();
      if (!scalar(subject.source) || !scalar(subject.id_base_spec)) return fail();
      return {
        key: JSON.stringify([subject.id_spec === null ? null : String(subject.id_spec), subject.source ?? null, subject.id_base_spec ?? null]),
        name: text(subject.name_spec || subject.name) || text(subject.id_spec ?? subject.id_base_spec), source: subject,
      };
    });
    if (new Set(subjects.map(subject => subject.key)).size !== subjects.length) return fail();
    return { id, name: text(group.name_tgroups || group.name) || id, subjects };
  });
  if (new Set(groups.map(group => group.id)).size !== groups.length) return fail();
  return groups;
}

export type HomeworkHistoryStatus = 'pending' | 'checked' | 'new' | 'retake' | 'overdue' | 'unknown';
export type HomeworkHistoryFilter = 'all' | 'submitted' | HomeworkHistoryStatus;
export const homeworkHistoryStatusLabels: Record<HomeworkHistoryStatus, string> = {
  pending: 'Не сдано', checked: 'Проверено', new: 'Новая работа', retake: 'Пересдача', overdue: 'Просрочено', unknown: 'Статус неизвестен',
};

/** Only the official status field is evidence of a submission state. */
export function homeworkHistoryStatus(cell: unknown): HomeworkHistoryStatus {
  if (!object(cell)) return 'unknown';
  const value = cell.status;
  if (typeof value !== 'number' && typeof value !== 'string') return 'unknown';
  switch (value) {
    case 0: case '0': return 'pending';
    case 1: case '1': return 'checked';
    case 2: case '2': return 'new';
    case 3: case '3': return 'retake';
    case 4: case '4': return 'overdue';
    default: return 'unknown';
  }
}

export type HomeworkHistoryRow = {
  key: string; studentId: string; studentName: string; homeworkId: string; theme: string;
  status: HomeworkHistoryStatus; assignment: RemoteRecord; cell: RemoteRecord | null;
};

export function homeworkHistoryMatches(row: HomeworkHistoryRow, filter: HomeworkHistoryFilter): boolean {
  return filter === 'all' || (filter === 'submitted' ? ['checked', 'new'].includes(row.status) : row.status === filter);
}

/** Official matrix: table_body[studentId][homeworkId]. Missing cells stay unknown. */
export function homeworkHistoryModel(students: unknown, homeworks: unknown, offset = 0, limit = 10): {
  rows: HomeworkHistoryRow[]; assignmentCount: number; hasNext: boolean;
} {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) return fail();
  if (!object(homeworks) || !Array.isArray(homeworks.table_header)) return fail();
  const body = homeworks.table_body;
  if (!object(body) && !Array.isArray(body)) return fail();
  const headers = entries(homeworks.table_header).map(([, header]) => {
    if (!homeworkHistoryId(header.id_domzad)) return fail();
    return header;
  });
  if (new Set(headers.map(header => String(header.id_domzad))).size !== headers.length) return fail();
  // Official responses can include all headers or just the requested page.
  const page = headers.length > limit ? headers.slice(offset, offset + limit) : headers;
  const roster = entries(students).map(([, student]) => {
    if (!homeworkHistoryId(student.id_stud)) return fail();
    return student;
  });
  if (new Set(roster.map(student => String(student.id_stud))).size !== roster.length) return fail();
  const rosterById = new Map(roster.map(student => [String(student.id_stud), student]));
  const matrixStudents = Object.entries(body).map(([studentKey, value]) => {
    const studentId = homeworkHistoryId(studentKey);
    if (!studentId) return fail();
    if (!object(value) && !Array.isArray(value)) return fail();
    for (const cell of Object.values(value)) {
      if (cell != null && !object(cell)) return fail();
      if (object(cell) && cell.stud_stud != null && homeworkHistoryId(cell.stud_stud) !== studentId) return fail();
    }
    const cellName = Object.values(value).map(cell => object(cell) ? text(cell.fio_stud) : '').find(Boolean);
    return { id_stud: studentId, fio_stud: cellName || text(rosterById.get(studentId)?.fio_stud) || studentId };
  });
  // Matrix keys describe the actual history cohort. The roster supplies names and
  // covers empty matrices without manufacturing submission statuses.
  const studentList = matrixStudents.length ? matrixStudents : roster;
  const rows = studentList.flatMap(student => page.map(assignment => {
    const studentId = String(student.id_stud), homeworkId = String(assignment.id_domzad);
    const studentBody = (body as Record<string, unknown>)[studentId];
    const rawCell = studentBody && typeof studentBody === 'object' ? (studentBody as RemoteRecord)[homeworkId] : null;
    const cell = object(rawCell) ? rawCell : null;
    return { key: `${studentId}:${homeworkId}`, studentId, studentName: text(student.fio_stud) || studentId,
      homeworkId, theme: text(assignment.dz_theme) || text(assignment.theme) || homeworkId, status: homeworkHistoryStatus(cell), assignment, cell };
  }));
  return { rows, assignmentCount: page.length, hasNext: headers.length > limit ? offset + limit < headers.length : page.length === limit };
}

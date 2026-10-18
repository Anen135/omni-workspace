import type { RemoteRecord } from '../../services/omni-client';

export const HOMEWORK_RESPONSE_LIMIT = 4000;
export type HomeworkResponseDraft = { comment: string; previousComment: string | null };

export type HomeworkReviewItem = {
  key: string;
  studentId: string;
  studentName: string;
  groupName: string;
  subject: string;
  theme: string;
  submittedAt: string;
  mark: number | null;
  source: RemoteRecord;
  canGrade: boolean;
};

const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const id = (value: unknown): string => /^[1-9]\d{0,11}$/.test(text(value)) ? text(value) : '';
const object = (value: unknown): RemoteRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as RemoteRecord : {};
export const homeworkMark = (value: unknown): number | null => text(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

export function homeworkGroupName(source: RemoteRecord): string {
  // The official homework modal displays its submission's `group` field.
  for (const value of [source.name_tgroups, source.group_name, source.group]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

// Official homeWorkCtrl.getModalData receives these three collections, not a flat table.
export function homeworkItems(data: unknown): HomeworkReviewItem[] {
  const container = object(data);
  const collections: [string, unknown][] = Array.isArray(data)
    ? [['homework', data]]
    : ['homework', 'lab_work', 'requests'].map(kind => [kind, container[kind]]);
  const result = collections.flatMap(([kind, collection]) => {
    const values = Array.isArray(collection) ? collection : Object.values(object(collection));
    return values.map((value, index) => {
      const source = object(value);
      const studentId = id(source.id_stud || source.stud_stud);
      const workId = id(source.id_domzad || source.id_domzad_teach);
      const submissionId = id(source.id || source.id_domzadstud);
      const identified = !!studentId && !!workId && !!submissionId;
      return {
        key: identified ? `${kind}:${submissionId}:${workId}:${studentId}` : `readonly:${kind}:${index}`,
        studentId, studentName: text(source.fio_stud),
        groupName: homeworkGroupName(source),
        subject: text(source.name_spec || source.spec_name), theme: text(source.theme || source.title),
        submittedAt: text(source.stud_date || source.time || source.date_upload || source.submitted_at),
        mark: homeworkMark(source.mark), source,
        // Retake requests require their separate official approval flow.
        canGrade: identified && kind !== 'requests' && ['0', '1'].includes(text(source.ospr)),
      };
    });
  });
  const counts = new Map<string, number>();
  for (const row of result) counts.set(row.key, (counts.get(row.key) || 0) + 1);
  return result.map(row => counts.get(row.key) === 1 ? row : { ...row, canGrade: false });
}

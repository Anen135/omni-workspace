export type LessonAccessTarget = { date?: string; group?: string; slot?: string };
export type LessonAccessData = {
  account: { id: string };
  dates: string[];
  requests: { date: string; status: string; approver: string; canOpen: boolean }[];
};

// Original Omni offers DD-MM-YYYY and stores request history as YYYY-MM-DD.
export function lessonAccessDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(value) ? value.split('-').reverse().join('-') : value;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}

export function lessonTeacherType(value: unknown): 0 | 1 | null {
  return value === 0 || value === '0' ? 0 : value === 1 || value === '1' ? 1 : null;
}

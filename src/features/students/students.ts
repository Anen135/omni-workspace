import type { RemoteRecord } from '../../services/omni-client';

export type StudentColumnKey = 'name' | 'average' | 'attendance' | 'age' | 'email' | 'phone' | 'login' | 'lastVisit';
export type StudentColumn = { key: StudentColumnKey; label: string; numeric?: boolean };
export const studentColumns: readonly StudentColumn[] = [
  { key: 'name', label: 'Студент' },
  { key: 'average', label: 'Средний балл', numeric: true },
  { key: 'attendance', label: 'Посещаемость, %', numeric: true },
  { key: 'age', label: 'Возраст', numeric: true },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Телефон' },
  { key: 'login', label: 'Логин' },
  { key: 'lastVisit', label: 'Последний вход в MyStat' },
];

export function studentText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function studentId(student: RemoteRecord): string {
  const id = studentText(student.id_stud);
  return /^[1-9]\d{0,11}$/.test(id) ? id : '';
}

export type StudentRow = { source: RemoteRecord; id: string; values: Record<StudentColumnKey, string> };

export function studentRow(student: RemoteRecord): StudentRow {
  return {
    source: student,
    id: studentId(student),
    values: {
      name: studentText(student.fio_stud),
      average: studentText(student.gpa ?? student.average ?? student.avg_mark),
      attendance: studentText(student.percent_vizit),
      age: studentText(student.age),
      email: studentText(student.st_email),
      phone: studentText(student.phone_stud),
      login: studentText(student.st_login),
      lastVisit: studentDate(student.last_date_vizit),
    },
  };
}

// Omni supplies calendar dates and SQL-style local timestamps. Keep their calendar
// components instead of letting browser locale/timezone parsing shift the day.
function dateParts(value: unknown): { year: number; month: number; day: number; time: string } | null {
  const text = studentText(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text);
  const local = /^(\d{2})\.(\d{2})\.(\d{4})(?: (\d{2}:\d{2}(?::\d{2})?))?$/.exec(text);
  if (!iso && !local) return null;
  const year = Number(iso ? iso[1] : local![3]);
  const month = Number(iso ? iso[2] : local![2]);
  const day = Number(iso ? iso[3] : local![1]);
  const time = (iso ? iso[4] : local![4]) || '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day || (time && (Number(time.slice(0, 2)) > 23 || Number(time.slice(3, 5)) > 59 || Number(time.slice(6)) > 59))) return null;
  return { year, month, day, time };
}

export function studentDate(value: unknown): string {
  const text = studentText(value);
  if (/^0000-00-00(?:[ T].*)?$/.test(text)) return '';
  const date = dateParts(text);
  return date ? `${String(date.day).padStart(2, '0')}.${String(date.month).padStart(2, '0')}.${date.year}${date.time ? ` ${date.time}` : ''}` : text;
}

function dateValue(value: string): number | null {
  const date = dateParts(value);
  return date ? Date.UTC(date.year, date.month - 1, date.day, Number(date.time.slice(0, 2)), Number(date.time.slice(3, 5)), Number(date.time.slice(6))) : null;
}

function numericValue(value: string): number | null {
  const text = value.replace(/\s/g, '').replace(',', '.').replace(/%$/, '');
  return text && Number.isFinite(Number(text)) ? Number(text) : null;
}

export function selectStudents(items: StudentRow[], query: string, key: StudentColumnKey, ascending: boolean): StudentRow[] {
  const words = query.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean);
  const numeric = studentColumns.find(column => column.key === key)?.numeric;
  return items.filter(item => {
    const searchable = Object.values(item.values).join(' ').toLocaleLowerCase('ru');
    return words.every(word => searchable.includes(word));
  }).sort((left, right) => {
    const a = left.values[key], b = right.values[key];
    // Unavailable values remain last in both directions.
    if (!a || !b) return a ? -1 : b ? 1 : 0;
    const an = key === 'lastVisit' ? dateValue(a) : numeric ? numericValue(a) : null;
    const bn = key === 'lastVisit' ? dateValue(b) : numeric ? numericValue(b) : null;
    if (key === 'lastVisit' && ((an === null) !== (bn === null))) return an === null ? 1 : -1;
    const order = an !== null && bn !== null ? an - bn : a.localeCompare(b, 'ru', { numeric: true });
    return order * (ascending ? 1 : -1);
  });
}

export function studentProfileData(student: RemoteRecord, details: unknown): { student: RemoteRecord; mismatch: boolean } {
  const detail = asRecord(details);
  const mismatch = Object.hasOwn(detail, 'id_stud') && (!studentId(student) || studentId(detail) !== studentId(student));
  if (mismatch) return { student, mismatch: true };
  const merged = { ...student, ...detail };
  if (studentText(detail.st_mob1)) merged.phone_stud = detail.st_mob1;
  return { student: merged, mismatch: false };
}

function asRecord(value: unknown): RemoteRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as RemoteRecord : {};
}

export type StudentAttendance = { source: RemoteRecord; date: string; subject: string; theme: string; teacher: string; status: string; marks: string[]; comment: string };
export const studentAttendanceMarks = ['Домашняя работа', 'Контрольная работа', 'Работа на уроке', 'Лабораторная работа', 'Практическая работа'];

export function studentAttendance(data: unknown): StudentAttendance[] {
  const object = asRecord(data);
  const entries = Array.isArray(data) ? data : Object.hasOwn(object, 'date_vizit') ? [object] : Object.values(object);
  return entries.map(asRecord).filter(item => ['date_vizit', 'name_spec', 'was', 'homework_mark', 'control_mark', 'work_in_class', 'labwork_mark', 'mark5'].some(key => Object.hasOwn(item, key))).map(source => ({
    source,
    date: studentDate(source.date_vizit), subject: studentText(source.name_spec), theme: studentText(source.theme), teacher: studentText(source.fio_teach),
    status: source.was === 0 || source.was === '0' ? 'Отсутствовал' : source.was === 1 || source.was === '1' ? 'Присутствовал' : source.was === 2 || source.was === '2' ? 'Опоздал' : 'Не отмечено',
    marks: ['homework_mark', 'control_mark', 'work_in_class', 'labwork_mark', 'mark5'].map(key => {
      const text = studentText(source[key]);
      return (numericValue(text) ?? 0) > 0 ? text : '';
    }),
    comment: studentText(source.comments),
  }));
}

export function studentPage(items: StudentRow[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.max(0, Math.min(page, pages - 1));
  return { items: items.slice(current * size, (current + 1) * size), page: current, pages };
}

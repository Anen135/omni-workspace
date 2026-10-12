import { initialLesson, students, type Lesson } from './data';

const draftKey = 'omni:demo:teacher:lesson-grid:draft:v1';
const archiveKey = 'omni:demo:teacher:lesson-grid:archive:v1';
function validLesson(value: unknown): value is Lesson {
  if (!value || typeof value !== 'object') return false;
  const lesson = value as Lesson;
  return typeof lesson.topic === 'string' && !!lesson.entries && !!lesson.reviews &&
    students.every(student => {
      const entry = lesson.entries[student.id];
      return entry && typeof entry.present === 'boolean' && typeof entry.mark === 'string' && typeof entry.comment === 'string';
    }) && Object.values(lesson.reviews).every(review => review && typeof review.mark === 'string' && typeof review.comment === 'string');
}
export const demoRepository = {
  load(): { lesson: Lesson; error: boolean } {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return { lesson: structuredClone(initialLesson), error: false };
      const parsed: unknown = JSON.parse(raw);
      if (!validLesson(parsed)) throw new Error('Invalid draft');
      return { lesson: parsed, error: false };
    } catch { return { lesson: structuredClone(initialLesson), error: true }; }
  },
  save(lesson: Lesson) { localStorage.setItem(draftKey, JSON.stringify(lesson)); },
  archive(lesson: Lesson) { localStorage.setItem(archiveKey, JSON.stringify({ lesson, savedAt: new Date().toISOString() })); },
  getArchive(): { lesson: Lesson; savedAt: string } | null {
    try {
      const raw = localStorage.getItem(archiveKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return validLesson(parsed.lesson) && typeof parsed.savedAt === 'string' ? parsed : null;
    } catch { return null; }
  },
};

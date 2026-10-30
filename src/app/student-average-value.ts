/** Retain valid raw roster values; malformed nonempty shapes must not become skippable blanks. */
export function studentAverageValue(row: Record<string, unknown>): string | undefined {
  const raw = row.gpa ?? row.average ?? row.avg_mark;
  if (raw == null || typeof raw === 'string' && raw.trim() === '') return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number' || typeof raw === 'number' && !Number.isFinite(raw)) {
    throw new Error('Omni вернул некорректный средний балл. Обновите данные перед расчётом оценок.');
  }
  return String(raw);
}

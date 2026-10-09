// The attendance schedule is separate from the weekly timetable.
// Omni's click_lenta passes the schedule collection key, not a schedule ID.
export function presentLessons(value: unknown): { slot: string; title: string; time: string }[] {
  if (!value || typeof value !== 'object') return [];
  const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return Object.entries(value).flatMap(([slot, entry]) => {
    if (!/^\d{1,12}$/.test(slot) || entry === null || entry === undefined || entry === false || entry === '') return [];
    if (typeof entry === 'object') {
      if (Array.isArray(entry) || !Object.keys(entry).length) return [];
      const item = entry as Record<string, unknown>;
      const title = text(item.name_spec) || text(item.eventName) || text(item.name) || text(item.title) || (text(item.n_lenta) ? `Пара ${text(item.n_lenta)}` : `Пара · ${slot}`);
      return [{ slot, title, time: [text(item.l_start), text(item.l_end)].filter(Boolean).join(' – ') }];
    }
    const title = text(entry);
    return title ? [{ slot, title, time: '' }] : [];
  });
}

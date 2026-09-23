type DataRecord = Record<string, unknown>;
const record = (value: unknown): DataRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as DataRecord : {};
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const entries = (value: unknown) => Object.entries(value && typeof value === 'object' ? value : {});

export function materialLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const link = value.trim();
  if (/[\\\u0000-\u001f]/.test(link)) return null;
  if (!/^https?:\/\//i.test(link) && !/^\/(?!\/)/.test(link)) return null;
  try {
    const url = new URL(link, 'https://omni.top-academy.ru');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export type TeachingMaterial = {
  key: string; title: string; description: string; type: string;
  file: string | null; url: string | null; content: unknown;
};
export type MaterialTopic = { week: string; title: string; materials: TeachingMaterial[] };

export function materialTopics(value: unknown, themes: unknown): MaterialTopic[] {
  const names = new Map(entries(themes).map(([, item]) => {
    const theme = record(item);
    return [text(theme.week), text(theme.theme_week)];
  }));
  return entries(value).map(([week, item]) => {
    const topic = record(item);
    const materials = entries(topic.data).flatMap(([type, group]) => entries(group).map(([index, value]) => {
      const material = record(value);
      return {
        // The generic id belongs to the week; public_materials_id identifies a file.
        key: `${week}:${type}:${text(material.public_materials_id) || index}`,
        title: text(material.theme) || text(material.name_quiz) || 'Материал',
        description: text(material.description), type: text(material.type) || type,
        file: materialLink(material.file_url) || materialLink(material.filename),
        url: materialLink(material.url), content: material.content,
      };
    }));
    return { week, title: text(topic.theme) || names.get(week) || `Тема ${week}`, materials };
  }).sort((a, b) => Number(a.week) - Number(b.week));
}

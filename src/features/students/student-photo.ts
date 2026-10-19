// photo_pas is supplied by Omni's student roster and profile templates.
export function studentPhotoUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text || /[\u0000-\u001f\u007f\\]/.test(text)) return '';
  const scheme = /^[a-z][a-z\d+.-]*:/i.test(text);
  if (scheme && !/^https?:\/\//i.test(text)) return '';
  try {
    const url = new URL(text, 'https://omni.top-academy.ru/');
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

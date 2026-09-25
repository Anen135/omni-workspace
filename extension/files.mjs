import { allowedFile } from './policy.mjs';
const maxSize = 8 * 1024 * 1024;
export async function previewFile(url) {
  if (!allowedFile(url)) throw new Error('Недопустимый адрес файла.');
  // Browser follows redirects under extension host permissions, without cookies.
  const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(25000), referrerPolicy: 'no-referrer' });
  if (!response.ok || !allowedFile(response.url)) { await response.body?.cancel(); throw new Error('Хранилище не вернуло доступный файл.'); }
  if (Number(response.headers.get('content-length')) > maxSize) { await response.body?.cancel(); throw new Error('Лимит превью расширения — 8 МБ.'); }
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxSize) throw new Error('Лимит превью расширения — 8 МБ.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const head = new TextDecoder().decode(bytes.subarray(0, 12));
  let type;
  if (head.startsWith('%PDF-')) type = 'application/pdf';
  else if ([137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) type = 'image/png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = 'image/jpeg';
  else if (/^GIF8[79]a/.test(head)) type = 'image/gif';
  else if (head.startsWith('RIFF') && head.endsWith('WEBP')) type = 'image/webp';
  else throw new Error('Формат файла не поддерживается для превью.');
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { type, base64: btoa(binary) };
}

const maxBytes = 50 * 1024 * 1024;

export function allowedPreviewUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && (
      url.hostname === 'fs.top-academy.ru' && /^\/api\/v1\/files\/[A-Za-z0-9_-]+$/.test(url.pathname) ||
      url.hostname === 'storage.yandexcloud.net' && url.pathname.startsWith('/top-academy-services-omni/')
    );
  } catch { return false; }
}

export async function loadFilePreview(value, fetchFile = fetch) {
  let url = value;
  const signal = AbortSignal.timeout(30000);
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (typeof url !== 'string' || !allowedPreviewUrl(url)) throw new Error('Недопустимый адрес файла.');
    let response;
    try { response = await fetchFile(url, { redirect: 'manual', signal, credentials: 'omit' }); }
    catch { throw new Error('Не удалось связаться с хранилищем файлов. Проверьте подключение и повторите загрузку.'); }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get('location');
      if (!location) throw new Error('Хранилище не вернуло адрес файла.');
      url = new URL(location, url).href;
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Хранилище вернуло HTTP ${response.status}.`); }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      await response.body?.cancel(); throw new Error('Файл превышает лимит превью 50 МБ.');
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes) throw new Error('Файл превышает лимит превью 50 МБ.');
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    let type;
    if (data.subarray(0, 5).toString() === '%PDF-') type = 'application/pdf';
    else if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) type = 'image/png';
    else if (data[0] === 255 && data[1] === 216 && data[2] === 255) type = 'image/jpeg';
    else if (/^GIF8[79]a/.test(data.subarray(0, 6).toString())) type = 'image/gif';
    else if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP') type = 'image/webp';
    else throw new Error('Этот формат нельзя показать в превью. Откройте оригинал по ссылке.');
    return { data, type };
  }
  throw new Error('Слишком много перенаправлений при загрузке файла.');
}

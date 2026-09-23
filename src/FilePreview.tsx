import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { materialLink } from './teaching-materials';
import './file-preview.css';
import { desktopRequest, isDesktop } from './desktop-client';
const PdfPreview = lazy(() => import('./PdfPreview'));

type Kind = 'image' | 'pdf' | 'unknown' | 'unsupported';
function fileKind(url: string, filename: string, mime: string, fallback?: 'pdf'): Kind {
  if (/^image\/(png|jpe?g|gif|webp|avif|bmp)/i.test(mime)) return 'image';
  if (/application\/pdf/i.test(mime)) return 'pdf';
  const path = filename || new URL(url).pathname;
  if (/\.(png|jpe?g|gif|webp|avif|bmp)(?:[?#]|$)/i.test(path)) return 'image';
  if (/\.pdf(?:[?#]|$)/i.test(path)) return 'pdf';
  if (/\.[a-z0-9]{2,5}(?:[?#]|$)/i.test(path) || mime && mime !== 'application/octet-stream') return 'unsupported';
  return fallback || 'unknown';
}

export function FilePreview({ url, filename = '', mime = '', fallback, linkLabel = 'Открыть файл', localObjectUrl = false }: {
  url: string; filename?: string; mime?: string; fallback?: 'pdf'; linkLabel?: string; localObjectUrl?: boolean;
}) {
  const safeUrl = localObjectUrl && url.startsWith(`blob:${location.origin}/`) ? url : materialLink(url);
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function hide() { clearTimeout(timer.current); setHover(null); }
  useEffect(() => {
    setExpanded(false); hide();
    return () => clearTimeout(timer.current);
  }, [url]);
  useEffect(() => {
    const dismiss = () => setHover(null);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  if (!safeUrl) return null;
  const kind = fileKind(safeUrl, filename, mime, fallback);
  const title = filename || 'Вложение';
  return <div className="file-preview">
    <div className="file-preview-actions">
      {kind !== 'unsupported' && <button type="button" className="file-preview-toggle" aria-expanded={expanded} aria-controls={id} aria-describedby={hover ? `${id}-hover` : undefined}
        onClick={() => { hide(); setExpanded(value => !value); }}
        onPointerEnter={event => {
          if (expanded || event.pointerType === 'touch') return;
          point.current = { x: event.clientX, y: event.clientY };
          clearTimeout(timer.current); timer.current = setTimeout(() => setHover(point.current), 250);
        }}
        onPointerMove={event => { point.current = { x: event.clientX, y: event.clientY }; if (hover) setHover(point.current); }}
        onPointerLeave={hide} onBlur={hide}
        onFocus={event => {
          if (!expanded && event.currentTarget.matches(':focus-visible')) {
            const box = event.currentTarget.getBoundingClientRect(); setHover({ x: box.left, y: box.bottom });
          }
        }}>
        {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}{expanded ? 'Свернуть превью' : 'Превью'}
      </button>}
      <a href={safeUrl} target="_blank" rel="noopener noreferrer">{linkLabel}<ExternalLink size={13}/></a>
    </div>
    {expanded && <div className="file-preview-full" id={id}><Preview key={safeUrl} url={safeUrl} kind={kind} title={title}/><small>Если встроенный просмотр недоступен, используйте ссылку «{linkLabel}».</small></div>}
    {hover && !expanded && createPortal(<div className="file-preview-hover" id={`${id}-hover`} role="tooltip" style={{
      left: Math.max(8, Math.min(hover.x + 16, window.innerWidth - 328)),
      top: Math.max(8, hover.y + 246 > window.innerHeight ? hover.y - 246 : hover.y + 16),
    }}><Preview key={safeUrl} url={safeUrl} kind={kind} title={title} compact/><span>Нажмите «Превью», чтобы раскрыть</span></div>, document.body)}
  </div>;
}

function Preview({ url, kind, title, compact = false }: { url: string; kind: Kind; title: string; compact?: boolean }) {
  const host = new URL(url).hostname;
  if (host === 'fs.top-academy.ru' || host === 'storage.yandexcloud.net') return <AcademyPreview url={url} title={title} compact={compact}/>;
  return <DirectPreview url={url} kind={kind} title={title} compact={compact}/>;
}

function AcademyPreview({ url, title, compact }: { url: string; title: string; compact: boolean }) {
  const [file, setFile] = useState<{ url: string; kind: Kind } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setFile(null); setError('');
    void (async () => {
      try {
        if (isDesktop()) {
          const result = await desktopRequest<{ type: string; base64: string }>('file-preview', { url });
          if (controller.signal.aborted) return;
          const bytes = Uint8Array.from(atob(result.base64), value => value.charCodeAt(0));
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: result.type }));
          setFile({ url: objectUrl, kind: fileKind(objectUrl, '', result.type) });
          return;
        }
        const response = await fetch('/api/omni/file-preview', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Omni-Client': 'workspace' },
          body: JSON.stringify({ url }), signal: controller.signal,
        });
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.error?.message || 'Не удалось загрузить файл.');
        }
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setFile({ url: objectUrl, kind: fileKind(objectUrl, '', blob.type) });
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить файл.');
      }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  if (error) return <p className="file-preview-error">{error}</p>;
  if (!file) return <p className="file-preview-loading">Загружаю файл…</p>;
  return <DirectPreview url={file.url} kind={file.kind} title={title} compact={compact}/>;
}

function DirectPreview({ url, kind, title, compact = false }: { url: string; kind: Kind; title: string; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  if ((kind === 'image' || kind === 'unknown') && !imageFailed) return <img src={url} alt={title} onError={() => setImageFailed(true)}/>;
  if (kind === 'pdf' || kind === 'unknown') {
    return <Suspense fallback={<p className="file-preview-loading">Загружаю PDF…</p>}><PdfPreview url={url} compact={compact}/></Suspense>;
  }
  return <p className="file-preview-error">Не удалось показать изображение. Откройте файл по ссылке.</p>;
}

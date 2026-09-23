import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfPreview({ url, compact }: { url: string; compact: boolean }) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setDocument(null); setError(false);
    const task = getDocument({ url });
    void task.promise.then(result => { if (!cancelled) setDocument(result); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; void task.destroy().catch(() => {}); };
  }, [url]);
  if (error) return <p className="file-preview-error">PDF недоступен для встроенного просмотра. Откройте файл по ссылке.</p>;
  if (!document) return <p className="file-preview-loading" role="status">Загружаю PDF…</p>;
  return <div className={compact ? 'pdf-preview pdf-preview-compact' : 'pdf-preview'}>
    {!compact && <div className="pdf-page-count">Страниц: {document.numPages}</div>}
    {Array.from({ length: compact ? 1 : document.numPages }, (_, index) => <PdfPage key={index} document={document} number={index + 1} compact={compact}/>)}
  </div>;
}

function PdfPage({ document, number, compact }: { document: PDFDocumentProxy; number: number; compact: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(compact);
  const [error, setError] = useState(false);
  useEffect(() => {
    const node = container.current!;
    const resize = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    resize.observe(node);
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => { resize.disconnect(); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined;
    setError(false);
    void document.getPage(number).then(async page => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = compact ? Math.min(width / base.width, 185 / base.height) : width / base.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * ratio });
      const node = canvas.current;
      node.width = Math.ceil(viewport.width); node.height = Math.ceil(viewport.height);
      node.style.width = `${viewport.width / ratio}px`; node.style.height = `${viewport.height / ratio}px`;
      render = page.render({ canvas: node, viewport });
      await render.promise;
      if (!cancelled) node.dataset.rendered = 'true';
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; render?.cancel(); };
  }, [document, number, compact, width, visible]);
  return <div ref={container} className="pdf-page">{error ? <p className="file-preview-error">Не удалось отобразить страницу {number}.</p> : <canvas ref={canvas} role="img" aria-label={`Страница PDF ${number}`}/>}</div>;
}

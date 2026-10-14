import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function DossierSection({ title, description, error, busy = false, empty = false, emptyText, onRetry, children }: {
  title: string;
  description?: string;
  error?: string | null;
  busy?: boolean;
  empty?: boolean;
  emptyText?: string;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  return <section className="dossier-section" aria-label={title} aria-busy={busy}>
    <header className="dossier-section-heading"><div><h3>{title}</h3>{description && <p>{description}</p>}</div></header>
    {error && <div className="dossier-section-error" role="alert">
      <AlertCircle size={16}/><p>{error}</p>
      {onRetry && <button className="button secondary" disabled={busy} onClick={onRetry}><RefreshCw size={14}/>Повторить загрузку: {title}</button>}
    </div>}
    {busy && empty ? <div className="dossier-skeleton" role="status" aria-label={`Загрузка: ${title}`}>
      <span/><span/><span/>
    </div> : empty ? !error && <p className="dossier-empty">{emptyText || 'Omni пока не вернул данные для этого раздела.'}</p> : children}
  </section>;
}

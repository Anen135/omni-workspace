import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, UserRound } from 'lucide-react';
import { ConnectionError, omniRequest, type Section } from '../../services/omni-client';
import './teacher-dossier.css';

type Dossier = { account: { id: string; name: string }; single: Section; graphics: Section; all: Section };
const sections = [['single', 'Показатели'], ['graphics', 'Динамика'], ['all', 'Подробные данные']] as const;

export function TeacherDossier({ accountId, accountName, disabled, onConnectionError }: {
  accountId: string; accountName: string; disabled: boolean; onConnectionError: (reason: unknown) => void;
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const initialRequested = useRef(false);

  async function load() {
    if (disabled) return;
    const id = ++requestId.current;
    setBusy(true); setError('');
    try {
      const result = await omniRequest<Dossier>('teacher-dossier', {});
      if (id !== requestId.current) return;
      if (result.account.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.');
      setDossier(result);
    } catch (reason) {
      if (id !== requestId.current) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить досье преподавателя.');
      if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) {
        setDossier(null); onConnectionError(reason);
      }
    } finally { if (id === requestId.current) setBusy(false); }
  }
  useEffect(() => () => { requestId.current++; initialRequested.current = false; }, []);
  useEffect(() => {
    if (!disabled && !initialRequested.current) { initialRequested.current = true; void load(); }
  }, [disabled]);

  const locked = disabled || busy;
  return <section className="panel teacher-dossier" aria-label="Досье преподавателя" aria-busy={busy}>
    <div className="panel-heading"><div><h2><UserRound size={19}/>{dossier?.account.name || accountName}</h2><p>Досье преподавателя · данные Omni</p></div><button className="button secondary" disabled={locked} onClick={() => void load()}><RefreshCw size={15}/>Обновить досье</button></div>
    {(busy || disabled && !dossier && !error) && <div className="dossier-status" role="status"><LoaderCircle className="spin" size={17}/>{dossier ? 'Обновляем досье…' : 'Загружаем досье…'}</div>}
    {error && <div className="dossier-error"><div className="warning" role="alert">{error}</div><button className="button secondary" disabled={locked} onClick={() => void load()}>Повторить загрузку</button></div>}
    {dossier && sections.map(([key, title]) => <section className="dossier-section" key={key} aria-label={title}>
      <h3>{title}</h3>
      {dossier[key].error && <div className="dossier-error"><div className="warning" role="alert">{dossier[key].error}</div><button className="button secondary" disabled={locked} onClick={() => void load()}>Повторить загрузку: {title}</button></div>}
      {hasData(dossier[key].data) ? <DossierValue value={dossier[key].data}/> : !dossier[key].error && <p className="dossier-empty">Omni пока не вернул данные для этого раздела.</p>}
    </section>)}
  </section>;
}

/*
 * Omni does not document the dossier responses, so DossierValue renders any JSON generically, recursively:
 *  - object  -> «field: value» list (underscores in names become spaces); nested objects become sub-sections;
 *  - array of objects -> a table whose columns are the union of all keys; other arrays -> a one-column list;
 *  - empty values show «—», booleans «Да»/«Нет». Field labels are Omni's own keys, not translated names.
 * Nesting is capped at 12 levels (below that a notice replaces the content). The size of a response is not
 * limited or paginated, so a very large response is rendered in full. User-facing notes: extension/README.md,
 * «Досье преподавателя».
 */
function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasData);
  if (value && typeof value === 'object') return Object.values(value).some(hasData);
  return value !== null && value !== undefined && value !== '';
}
function fieldName(key: string): string { return key.replace(/_/g, ' '); }
function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return String(value);
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }

function DossierValue({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (depth > 12) return <p className="dossier-empty">Данные содержат слишком много вложенных разделов.</p>;
  if (Array.isArray(value)) {
    if (!value.length) return <span className="dossier-empty">Нет данных</span>;
    if (value.every(isRecord)) {
      const columns = [...new Set(value.flatMap(item => Object.keys(item)))];
      return <div className="dossier-table-scroll" tabIndex={0} role="region" aria-label="Таблица данных досье"><table className="dossier-table"><thead><tr>{columns.map(key => <th scope="col" key={key}>{fieldName(key)}</th>)}</tr></thead><tbody>{value.map((item, index) => <tr key={index}>{columns.map(key => <td key={key}><DossierValue value={item[key]} depth={depth + 1}/></td>)}</tr>)}</tbody></table></div>;
    }
    return <div className="dossier-table-scroll" tabIndex={0} role="region" aria-label="Список данных досье"><table className="dossier-table"><thead><tr><th scope="col">Значение</th></tr></thead><tbody>{value.map((item, index) => <tr key={index}><td><DossierValue value={item} depth={depth + 1}/></td></tr>)}</tbody></table></div>;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return <span className="dossier-empty">Нет данных</span>;
    const primitives = entries.filter(([, item]) => !item || typeof item !== 'object');
    const nested = entries.filter(([, item]) => item && typeof item === 'object');
    return <>
      {!!primitives.length && <dl className="dossier-metrics">{primitives.map(([key, item]) => <div className="dossier-metric" key={key}><dt>{fieldName(key)}</dt><dd>{text(item)}</dd></div>)}</dl>}
      {nested.map(([key, item]) => <section className="dossier-nested" key={key}><h4>{fieldName(key)}</h4><DossierValue value={item} depth={depth + 1}/></section>)}
    </>;
  }
  return <span className="dossier-value">{text(value)}</span>;
}

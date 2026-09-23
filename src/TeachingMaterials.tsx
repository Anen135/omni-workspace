import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, FileText, LoaderCircle, RefreshCw } from 'lucide-react';
import { ConnectionError, label, omniRequest, record, rows, type Section } from './omni-client';
import { materialLink, materialTopics } from './teaching-materials';
import './teaching-materials.css';
import { FilePreview } from './FilePreview';

type Catalog = { account: { id: string }; forms: Section; directions: Section; packages: Section; types: Section };
type MethodPackage = { account: { id: string }; materials: Section; themes: Section };
type Filter = { form?: string; direction?: string };
const empty: Section = { data: null, error: null };

export function TeachingMaterials({ accountId, disabled, onConnectionError }: {
  accountId: string; disabled: boolean; onConnectionError: (reason: unknown) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [pack, setPack] = useState<MethodPackage | null>(null);
  const [form, setForm] = useState('');
  const [direction, setDirection] = useState('');
  const [spec, setSpec] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  async function run<Result extends { account: { id: string } }>(action: string, input: object, accept: (result: Result) => void) {
    const id = ++requestId.current;
    setBusy(true); setError('');
    try {
      const result = await omniRequest<Result>(action, input);
      if (id !== requestId.current) return;
      if (result.account.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.');
      accept(result);
    } catch (reason) {
      if (id !== requestId.current) return;
      setError(reason instanceof Error ? reason.message : 'Не удалось загрузить методички.');
      if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) onConnectionError(reason);
    } finally { if (id === requestId.current) setBusy(false); }
  }
  function loadCatalog(filter: Filter) {
    setSpec(''); setPack(null); setSearch(''); setType('');
    setCatalog(previous => previous ? { ...previous, directions: empty, packages: empty } : null);
    return run<Catalog>('materials-catalog', filter, setCatalog);
  }
  function loadPackage(nextSpec: string) {
    setSpec(nextSpec); setPack(null); setSearch(''); setType('');
    if (nextSpec) return run<MethodPackage>('method-package', { spec: nextSpec }, setPack);
  }
  useEffect(() => {
    void loadCatalog({});
    return () => { requestId.current++; };
  }, []);

  const locked = busy || disabled;
  const packages = rows(catalog?.packages.data);
  const topics = materialTopics(pack?.materials.data, pack?.themes.data);
  const query = search.trim().toLocaleLowerCase('ru-RU');
  const visible = topics.map(topic => ({ ...topic, materials: topic.materials.filter(item =>
    (!type || item.type === type) && (!query || `${topic.title} ${item.title} ${item.description}`.toLocaleLowerCase('ru-RU').includes(query))),
  })).filter(topic => topic.materials.length);
  const types = rows(catalog?.types.data);
  const sectionErrors = [catalog?.forms, catalog?.directions, catalog?.packages, catalog?.types, pack?.materials, pack?.themes].flatMap(section => section?.error ? [section.error] : []);

  return <section className="panel teaching-materials" aria-label="Методички для подготовки">
    <div className="panel-heading"><div><h2>Методички для подготовки</h2><p>Доступны до начала урока. Выберите форму обучения и методпакет.</p></div><button className="button secondary" disabled={locked} onClick={() => void (spec ? loadPackage(spec) : loadCatalog({ ...(form ? { form } : {}), ...(direction ? { direction } : {}) }))}><RefreshCw size={15}/>Обновить методички</button></div>
    <div className="method-filters">
      <label>Форма обучения<select aria-label="Форма обучения" value={form} disabled={locked || !catalog} onChange={event => { const value = event.target.value; setForm(value); setDirection(''); void loadCatalog(value ? { form: value } : {}); }}><option value="">Выберите форму обучения</option>{rows(catalog?.forms.data).map(item => <option key={label(item.id_form)} value={label(item.id_form)}>{label(item.name_form)}</option>)}</select></label>
      <label>Направление<select aria-label="Направление" value={direction} disabled={locked || !form} onChange={event => { const value = event.target.value; setDirection(value); void loadCatalog({ form, ...(value ? { direction: value } : {}) }); }}><option value="">Все направления</option>{rows(catalog?.directions.data).map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.dir_name)}</option>)}</select></label>
      <label className="method-package-select">Методпакет<select aria-label="Методпакет" value={spec} disabled={locked || !packages.length} onChange={event => void loadPackage(event.target.value)}><option value="">Выберите предмет / курс</option>{packages.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.name_spec)}</option>)}</select></label>
    </div>
    {busy && <div className="method-status" role="status"><LoaderCircle className="spin" size={17}/>Загружаю методички…</div>}
    {error && <div className="warning" role="alert">{error}</div>}
    {sectionErrors.map((message, index) => <div className="warning" role="alert" key={index}>{message}</div>)}
    {!busy && !error && !sectionErrors.length && !spec && <div className="empty"><BookOpen size={28}/><h3>{form && !packages.length ? 'Для выбранной формы методпакеты не найдены' : 'Выберите методпакет для подготовки'}</h3><p>Текущая пара и список учеников для этого не нужны.</p></div>}
    {pack && !pack.materials.error && <>
      <div className="method-filters method-search"><label>Поиск по темам и материалам<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название урока или методички"/></label><label>Тип материала<select aria-label="Тип материала" value={type} onChange={event => setType(event.target.value)}><option value="">Все материалы</option>{types.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.name)}</option>)}</select></label></div>
      <div className="method-topics">{visible.map((topic, index) => <details className="method-topic" key={topic.week} open={index === 0 || !!query}>
        <summary><span className="method-week">{topic.week}</span><span>{topic.title}</span><small>{topic.materials.length} мат.</small></summary>
        <div className="method-cards">{topic.materials.map(item => <article className="method-card" key={item.key}>
          <span className="method-type">{label(types.find(type => label(type.id) === item.type)?.name) || 'Учебный материал'}</span><h3><FileText size={17}/>{item.title}</h3>{item.description && <p>{item.description}</p>}
          <div className="method-links">{item.file && <FilePreview url={item.file}/ >}{item.url && item.url !== item.file && <a className="button secondary" href={item.url} target="_blank" rel="noopener noreferrer">Открыть материал<ExternalLink size={14}/></a>}</div>
          {!!item.content && <details className="method-content"><summary>Читать содержимое</summary><MaterialContent value={item.content}/></details>}
          {!item.file && !item.url && !item.content && <p className="muted">У этого материала нет доступного файла или ссылки.</p>}
        </article>)}</div>
      </details>)}</div>
      {!visible.length && <div className="empty"><h3>{topics.some(topic => topic.materials.length) ? 'По вашему запросу ничего не найдено' : 'В этом методпакете пока нет материалов'}</h3></div>}
    </>}
  </section>;
}

function plainText(value: unknown): string {
  return new DOMParser().parseFromString(label(value), 'text/html').body.textContent || '';
}
function MaterialContent({ value }: { value: unknown }) {
  let content = value;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { return <p>{plainText(content)}</p>; }
  }
  if (!content || typeof content !== 'object' || !('blocks' in content) || !Array.isArray(content.blocks)) return <p>Содержимое этого формата доступно в оригинальном Omni.</p>;
  return <div>{content.blocks.map((block, index) => {
    const item = record(block);
    const data = record(item.data);
    if (item.type === 'header') return <h4 key={index}>{plainText(data.text)}</h4>;
    if (item.type === 'paragraph' || item.type === 'quote') return <p key={index}>{plainText(data.text)}</p>;
    if (item.type === 'code') return <pre key={index}>{label(data.code)}</pre>;
    if (item.type === 'list' && Array.isArray(data.items)) return <ul key={index}>{data.items.map((item: unknown, i: number) => <li key={i}>{plainText(typeof item === 'object' && item && 'content' in item ? item.content : item)}</li>)}</ul>;
    const url = materialLink(record(data.file).url || data.url || data.link || data.source);
    return url ? <p key={index}><a href={url} target="_blank" rel="noopener noreferrer">{plainText(data.caption || data.title) || 'Открыть вложение'}</a></p> : <p key={index}>Этот блок доступен в оригинальном Omni.</p>;
  })}</div>;
}

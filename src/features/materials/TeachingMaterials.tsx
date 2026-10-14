import { useEffect, useRef, useState } from 'react';
import { BookOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { ConnectionError, label, omniRequest, rows, type Section } from '../../services/omni-client';
import { materialTopics } from './teaching-materials';
import './teaching-materials.css';
import { MaterialCard } from './MaterialCard';
import { SearchableSelect } from '../../components/ui/SearchableSelect';

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
  const initialRequested = useRef(false);

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
  useEffect(() => () => { requestId.current++; initialRequested.current = false; }, []);
  useEffect(() => {
    if (!disabled && !initialRequested.current) {
      initialRequested.current = true;
      void loadCatalog({});
    }
  }, [disabled]);

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
    <div className="panel-heading"><div><h2>Методички для подготовки</h2><p>Доступны до начала урока. Выберите методпакет; форма обучения и направление необязательны.</p></div><button className="button secondary" disabled={locked} onClick={() => void (spec ? loadPackage(spec) : loadCatalog({ ...(form ? { form } : {}), ...(direction ? { direction } : {}) }))}><RefreshCw size={15}/>Обновить методички</button></div>
    <div className="method-filters">
      <SearchableSelect label="Форма обучения" value={form} disabled={locked || !catalog} placeholder="Все формы обучения"
        options={rows(catalog?.forms.data).map(item => ({ value: label(item.id_form), label: label(item.name_form) }))}
        onChange={value => { setForm(value); setDirection(''); void loadCatalog(value ? { form: value } : {}); }}/>
      <SearchableSelect label="Направление" value={direction} disabled={locked || !rows(catalog?.directions.data).length} placeholder="Все направления"
        options={rows(catalog?.directions.data).map(item => ({ value: label(item.id), label: label(item.dir_name) }))}
        onChange={value => { setDirection(value); void loadCatalog({ ...(form ? { form } : {}), ...(value ? { direction: value } : {}) }); }}/>
      <SearchableSelect className="method-package-select" label="Методпакет" value={spec} disabled={locked || !packages.length} placeholder="Выберите предмет / курс"
        options={packages.map(item => ({ value: label(item.id), label: label(item.name_spec) }))} onChange={value => void loadPackage(value)}/>
    </div>
    {busy && <div className="method-status" role="status"><LoaderCircle className="spin" size={17}/>Загружаю методички…</div>}
    {error && <div className="warning" role="alert">{error}</div>}
    {sectionErrors.map((message, index) => <div className="warning" role="alert" key={index}>{message}</div>)}
    {!busy && !error && !sectionErrors.length && !spec && <div className="empty"><BookOpen size={28}/><h3>{form && !packages.length ? 'Для выбранной формы методпакеты не найдены' : 'Выберите методпакет для подготовки'}</h3><p>Текущая пара и список учеников для этого не нужны.</p></div>}
    {pack && !pack.materials.error && <>
      <div className="method-filters method-search"><label>Поиск по темам и материалам<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название урока или методички"/></label><label>Тип материала<select aria-label="Тип материала" value={type} onChange={event => setType(event.target.value)}><option value="">Все материалы</option>{types.map(item => <option key={label(item.id)} value={label(item.id)}>{label(item.name)}</option>)}</select></label></div>
      <div className="method-topics">{visible.map((topic, index) => <details className="method-topic" key={topic.week} open={index === 0 || !!query}>
        <summary><span className="method-week">{topic.week}</span><span>{topic.title}</span><small>{topic.materials.length} мат.</small></summary>
        <div className="method-cards">{topic.materials.map(item => <MaterialCard key={item.key} material={item} typeName={label(types.find(type => label(type.id) === item.type)?.name)}/>)}</div>
      </details>)}</div>
      {!visible.length && <div className="empty"><h3>{topics.some(topic => topic.materials.length) ? 'По вашему запросу ничего не найдено' : 'В этом методпакете пока нет материалов'}</h3></div>}
    </>}
  </section>;
}

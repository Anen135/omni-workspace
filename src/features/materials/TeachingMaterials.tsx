import { useTeachingMaterials } from './useTeachingMaterials';
import { BookOpen, LoaderCircle, RefreshCw } from 'lucide-react';
import { ConnectionError, label, omniRequest, rows, type Section } from '../../services/omni-client';
import { materialTopics } from './teaching-materials';
import './teaching-materials.css';
import { MaterialCard } from './MaterialCard';
import { SearchableSelect } from '../../components/ui/SearchableSelect';
import { HelpTip } from '../../components/ui/HelpTip';

export function TeachingMaterials({ accountId, disabled, onConnectionError, active = true, refreshKey }: {
  accountId: string; disabled: boolean; active?: boolean; refreshKey?: unknown; onConnectionError: (reason: unknown) => void;
}) {
  const { catalog, pack, form, setForm, direction, setDirection, spec, search, setSearch, type, setType, busy, error, locked, packages, topics, query, visible, types, sectionErrors, loadCatalog, loadPackage } = useTeachingMaterials({ accountId, disabled, onConnectionError, active, refreshKey });
  return <section className="panel teaching-materials" aria-label="Методички для подготовки">
    <div className="panel-heading"><div className="help-heading"><h2>Методички для подготовки</h2><HelpTip label="О разделе «Методички для подготовки»">Выберите методпакет; форма обучения и направление необязательны. Текущий урок и список учеников для подготовки не нужны.</HelpTip></div><button className="button secondary" disabled={locked} onClick={() => void (spec ? loadPackage(spec) : loadCatalog({ ...(form ? { form } : {}), ...(direction ? { direction } : {}) }, true))}><RefreshCw size={15}/>Обновить методички</button></div>
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
    {!busy && !error && !sectionErrors.length && !spec && <div className="empty"><BookOpen size={28}/><h3>{form && !packages.length ? 'Для выбранной формы методпакеты не найдены' : 'Выберите методпакет для подготовки'}</h3></div>}
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

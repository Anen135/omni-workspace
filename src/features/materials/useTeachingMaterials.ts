import { useEffect, useRef, useState } from 'react';
import { ConnectionError, omniRequest, rows, type Section } from '../../services/omni-client';
import { materialTopics } from './teaching-materials';
type Catalog = { account: { id: string }; forms: Section; directions: Section; packages: Section; types: Section };
type MethodPackage = { account: { id: string }; materials: Section; themes: Section };
type Filter = { form?: string; direction?: string };
const empty: Section = { data: null, error: null };

export type MaterialsOptions = { accountId: string; disabled: boolean; active?: boolean; refreshKey?: unknown; onConnectionError: (reason: unknown) => void };
export function useTeachingMaterials({ accountId, disabled, onConnectionError, active = true, refreshKey }: MaterialsOptions) {
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
  function loadCatalog(filter: Filter, includeMetadata = !catalog || !!catalog.forms.error || !!catalog.types.error) {
    setSpec(''); setPack(null); setSearch(''); setType('');
    setCatalog(previous => previous ? { ...previous, directions: empty, packages: empty } : null);
    return run<Catalog>('materials-catalog', { ...filter, ...(includeMetadata ? {} : { includeMetadata: false }) }, result => setCatalog(previous => includeMetadata || !previous ? result : { ...result, forms: previous.forms, types: previous.types }));
  }
  function loadPackage(nextSpec: string) {
    setSpec(nextSpec); setPack(null); setSearch(''); setType('');
    if (nextSpec) return run<MethodPackage>('method-package', { spec: nextSpec }, setPack);
  }
  useEffect(() => () => { requestId.current++; }, []);
  useEffect(() => {
    requestId.current++; initialRequested.current = false;
    setCatalog(null); setPack(null); setSpec(''); setForm(''); setDirection(''); setBusy(false); setError('');
  }, [refreshKey]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (active && !disabled && !initialRequested.current) {
        initialRequested.current = true;
        void loadCatalog({});
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [active, disabled, refreshKey]);

  const locked = busy || disabled;
  const packages = rows(catalog?.packages.data);
  const topics = materialTopics(pack?.materials.data, pack?.themes.data);
  const query = search.trim().toLocaleLowerCase('ru-RU');
  const visible = topics.map(topic => ({ ...topic, materials: topic.materials.filter(item =>
    (!type || item.type === type) && (!query || `${topic.title} ${item.title} ${item.description}`.toLocaleLowerCase('ru-RU').includes(query))),
  })).filter(topic => topic.materials.length);
  const types = rows(catalog?.types.data);
  const sectionErrors = [catalog?.forms, catalog?.directions, catalog?.packages, catalog?.types, pack?.materials, pack?.themes].flatMap(section => section?.error ? [section.error] : []);

  return { catalog, pack, form, setForm, direction, setDirection, spec, search, setSearch, type, setType, busy, error, locked, packages, topics, query, visible, types, sectionErrors, loadCatalog, loadPackage };
}

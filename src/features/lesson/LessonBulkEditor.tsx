import { useEffect, useId, useRef, useState } from 'react';
import { TableBulkEditor, type BulkField } from '../../components/data/TableBulkEditor';
import { createLessonFill, lessonFillFingerprint, type LessonFillRequest, type LessonFillSnapshot } from './lesson-fill';

type Row = Record<string, unknown>;
const idOf = (row: Row) => String(row.id_stud ?? '');
const sources = [{ value: 'average', label: 'Средняя оценка' }, { value: 'mark4', label: 'Работа на уроке' }, { value: 'mark2', label: 'Контрольная' }];
const scopeLabels = { selected: 'Выбранные ученики', filtered: 'Все по фильтрам', all: 'Вся группа' };
type Scope = keyof typeof scopeLabels;

export function LessonBulkEditor({ fields, items, filteredRows, selectedRows, locked, contextKey, contextToken, averages, averageUnavailable = '', onBulkApply, onFill }: {
  fields: readonly BulkField<Row>[]; items: readonly Row[]; filteredRows: readonly Row[]; selectedRows: readonly Row[];
  locked: boolean; contextKey: unknown; contextToken: string; averages?: ReadonlyMap<string, string>; averageUnavailable?: string;
  onBulkApply: (rows: readonly Row[], column: string, value: string) => void;
  onFill: (request: LessonFillRequest, fingerprint: string) => void;
}) {
  const [method, setMethod] = useState<LessonFillRequest['method']>('constant');
  const [rounding, setRounding] = useState<LessonFillRequest['rounding']>('ceil');
  const [empty, setEmpty] = useState<LessonFillRequest['empty']>('block');
  const [overwrite, setOverwrite] = useState(false);
  const [scope, setScope] = useState<Scope>('selected');
  const [preview, setPreview] = useState<{ request: LessonFillRequest; result: ReturnType<typeof createLessonFill>; contextKey: unknown; settings: string; sourceScope: string } | null>(null);
  const [failure, setFailure] = useState('');
  const sourceRows = scope === 'all' ? items : scope === 'filtered' ? filteredRows : selectedRows;
  const scopeSignature = JSON.stringify([selectedRows.map(idOf).sort(), filteredRows.map(idOf).sort()]);
  const settings = JSON.stringify([method, rounding, empty, overwrite, scope, scopeSignature]);
  const snapshot: LessonFillSnapshot = { students: items, averages, context: contextToken, sourceUnavailable: averageUnavailable };
  const stale = !!preview && (preview.contextKey !== contextKey || preview.settings !== settings || preview.result.fingerprint !== lessonFillFingerprint(snapshot, preview.request));
  const fillFields = method === 'constant' ? fields : fields.filter(field => field.id === 'mark2' || field.id === 'mark4').map(field => ({
    ...field, input: { kind: 'select' as const, options: sources }, validate: (value: string) => sources.some(source => source.value === value) ? '' : 'Выберите источник оценки.',
  }));
  const close = () => { setPreview(null); setFailure(''); };
  return <>
    <div className="table-bulk-editor table-bulk-controls lesson-fill-options">
      <label>Способ заполнения<select aria-label="Способ заполнения" disabled={locked} value={method} onChange={event => setMethod(event.target.value as LessonFillRequest['method'])}>
        <option value="constant">Одинаковое значение</option><option value="field">Поле каждого ученика</option><option value="mean">Среднее по области</option>
      </select></label>
      {method !== 'constant' && <label>Округление<select aria-label="Округление оценки" disabled={locked} value={rounding} onChange={event => setRounding(event.target.value as LessonFillRequest['rounding'])}>
        <option value="ceil">Вверх</option><option value="floor">Вниз</option><option value="nearest">До ближайшего целого (0,5 вверх)</option>
      </select></label>}
      {method === 'mean' && <label>Область расчёта<select aria-label="Область расчёта среднего" disabled={locked} value={scope} onChange={event => setScope(event.target.value as Scope)}>
        {(Object.keys(scopeLabels) as Scope[]).map(key => <option key={key} value={key}>{scopeLabels[key]} ({(key === 'all' ? items : key === 'filtered' ? filteredRows : selectedRows).length})</option>)}
      </select></label>}
      {method !== 'constant' && <label>Пустые источники<select aria-label="Обработка пустых источников" disabled={locked} value={empty} onChange={event => setEmpty(event.target.value as LessonFillRequest['empty'])}>
        <option value="block">Блокировать расчёт</option><option value="skip">Исключить с пояснением</option>
      </select></label>}
      <label><span><input type="checkbox" disabled={locked} checked={overwrite} onChange={event => setOverwrite(event.target.checked)}/> Заменить заполненные оценки, включая черновик</span></label>
    </div>
    <TableBulkEditor key={method} contextKey={contextKey} fields={fillFields} filteredRows={filteredRows} selectedRows={selectedRows} allRows={items} locked={locked}
      defaultField="mark4" defaultValue={method === 'constant' ? '12' : 'average'} valueLabel="Значение / расчёт" applyLabel="Заполнить столбец" maxTargets={Math.max(100, items.length)}
      onApply={(rows, column, value) => {
        if (column !== 'mark2' && column !== 'mark4') { onBulkApply(rows, column, value); return; }
        const request: LessonFillRequest = { target: column, method, value: method === 'constant' ? value : '', source: method === 'constant' ? 'average' : value as LessonFillRequest['source'],
          rounding, empty, overwrite, targetIds: rows.map(idOf), sourceIds: method === 'mean' ? sourceRows.map(idOf) : [] };
        setFailure(''); setPreview({ request, result: createLessonFill(snapshot, request), contextKey, settings, sourceScope: method === 'mean' ? scopeLabels[scope] : 'Каждый получатель отдельно' });
      }}/>
    {preview && <LessonFillPreview preview={preview} stale={stale} locked={locked} failure={failure} onClose={close} onApply={() => {
      if (stale || locked || preview.result.blockedReason) return;
      try { onFill(preview.request, preview.result.fingerprint); close(); }
      catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Не удалось добавить заполнение в черновик.'); }
    }}/>}</>;
}

function LessonFillPreview({ preview, stale, locked, failure, onClose, onApply }: {
  preview: { request: LessonFillRequest; result: ReturnType<typeof createLessonFill>; sourceScope: string };
  stale: boolean; locked: boolean; failure: string; onClose: () => void; onApply: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const root = dialog.current?.getRootNode();
    const opener = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    dialog.current?.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  const { request, result } = preview;
  const changes = result.rows.filter(row => row.apply).length;
  return <dialog ref={dialog} className="lesson-table-settings lesson-fill-preview" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const root = event.currentTarget.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    const index = controls.findIndex(control => control === active);
    event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
  }}>
    <div className="lesson-table-settings-heading"><h2 id={title}>Предварительное заполнение</h2><button type="button" className="button secondary" autoFocus onClick={onClose}>Закрыть</button></div>
    <p>Столбец: {request.target === 'mark4' ? 'Работа на уроке' : 'Контрольная'}. {request.method === 'constant' ? `Одинаковое значение: ${request.value}.` : `Источник: ${sources.find(source => source.value === request.source)?.label}. ${request.method === 'mean' ? `Среднее по области «${preview.sourceScope}»` : 'Индивидуальное значение'}. Округление: ${{ ceil: 'вверх', floor: 'вниз', nearest: 'до ближайшего целого, 0,5 вверх' }[request.rounding]}.`}</p>
    <p>Получателей: {result.rows.length}. Изменений: {changes}. {request.overwrite ? 'Заполненные оценки будут заменены.' : 'Заполненные оценки сохраняются.'} {request.method !== 'constant' && (request.empty === 'skip' ? 'Пустые источники исключаются явно.' : 'Пустые источники блокируют расчёт.')}</p>
    {request.method === 'mean' && <p>Источников: {result.sources.length}. Допустимых: {result.sources.filter(source => source.value !== null).length}. Среднее до округления: {result.aggregate ?? 'не рассчитано'}.</p>}
    {stale && <p role="alert">Данные, выбор или параметры изменились. Закройте окно и рассчитайте заново.</p>}
    {result.blockedReason && <p role="alert">{result.blockedReason}</p>}
    {failure && <p role="alert">{failure}</p>}
    <div className="table-scroll"><table className="data-table"><caption>Получатели: было → станет</caption><thead><tr><th>Ученик</th><th>Было</th><th>Станет</th><th>Причина</th></tr></thead><tbody>
      {result.rows.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.before || '—'}</td><td>{row.apply ? row.after : row.before || '—'}</td><td>{row.reason || 'Будет добавлено в черновик'}</td></tr>)}
    </tbody></table></div>
    {result.sources.length > 0 && <div className="table-scroll"><table className="data-table"><caption>Исходные значения для расчёта</caption><thead><tr><th>Ученик</th><th>Значение</th><th>Причина исключения</th></tr></thead><tbody>
      {result.sources.map(source => <tr key={source.id}><td>{source.name}</td><td>{source.value ?? '—'}</td><td>{source.reason || 'Участвует в расчёте'}</td></tr>)}
    </tbody></table></div>}
    <div className="table-bulk-controls"><button type="button" className="button primary" disabled={locked || stale || !!result.blockedReason || !changes} onClick={onApply}>В черновик ({changes})</button></div>
    <p className="table-bulk-help">Технический диапазон оценок урока: 1–100. Отправка в Omni — общей кнопкой «Сохранить» после проверки результата.</p>
  </dialog>;
}

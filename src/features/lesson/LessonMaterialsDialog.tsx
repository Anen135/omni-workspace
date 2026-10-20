import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { SectionView } from '../../components/data/RemoteData';
import { ConnectionError, label, omniRequest, record, type Account, type RemoteLesson, type RemoteRecord, type Section } from '../../services/omni-client';
import { MaterialCard } from '../materials/MaterialCard';
import { materialTopics } from '../materials/teaching-materials';
import { attendanceDraftKey } from './attendance';
import '../materials/teaching-materials.css';
import './lesson-materials.css';

type MethodPackage = { account: Account; materials: Section; themes: Section };
export type LessonMaterialsDialogProps = {
  open: boolean;
  contextToken: string;
  account: Account;
  currentLesson: RemoteLesson | null;
  theme?: RemoteRecord;
  busy?: boolean;
  onClose: () => void;
  onLoadCurrent: () => Promise<unknown> | void;
  onConnectionError?: (reason: unknown) => void;
};

export function LessonMaterialsDialog({ open, contextToken, account, currentLesson, theme, busy = false, onClose, onLoadCurrent, onConnectionError }: LessonMaterialsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const connectionError = useRef(onConnectionError);
  connectionError.current = onConnectionError;
  const packageId = label(theme?.package_id);
  const week = label(theme?.week);
  // Omni's lesson theme selection identifies an exact package/week pair.
  // Never guess a package from the course, theme title or public_week_id.
  const canPreview = /^[1-9]\d{0,11}$/.test(packageId) && /^[1-9]\d{0,3}$/.test(week);
  const key = JSON.stringify([contextToken, account.id, account.branch || '', packageId, week, label(theme?.public_week_id)]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const [pack, setPack] = useState<{ key: string; value: MethodPackage } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const visiblePack = pack?.key === key ? pack.value : null;
  const topics = materialTopics(visiblePack?.materials.data, visiblePack?.themes.data).filter(topic => topic.week === week);
  const currentMatches = !!currentLesson && currentLesson.account.id === account.id &&
    (currentLesson.account.branch === undefined || currentLesson.account.branch === (account.branch || '')) &&
    attendanceDraftKey(account.id, account.branch || '', record(currentLesson.presents)) === contextToken;

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);
  useEffect(() => {
    const id = ++requestId.current;
    if (!open || !canPreview || !theme) return;
    const controller = new AbortController();
    setPack(null); setFailure(null); setLoading(key);
    void omniRequest<MethodPackage>('method-package', { spec: packageId }, { signal: controller.signal }).then(result => {
      if (id !== requestId.current || activeKey.current !== key) return;
      if (result.account.id !== account.id || result.account.branch !== undefined && result.account.branch !== (account.branch || '')) {
        throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Материалы выбранной темы не показаны.');
      }
      setPack({ key, value: result });
    }).catch(reason => {
      if (id !== requestId.current || activeKey.current !== key) return;
      setFailure({ key, message: reason instanceof Error ? reason.message : 'Не удалось загрузить материалы выбранной темы.' });
      if (reason instanceof ConnectionError && ['ACCOUNT_CHANGED', 'AUTH_REQUIRED', 'CHALLENGE'].includes(reason.code)) connectionError.current?.(reason);
    }).finally(() => { if (id === requestId.current) setLoading(null); });
    return () => { requestId.current++; controller.abort(); };
  }, [open, key]);

  async function reloadCurrent() {
    const requestedKey = key;
    const requestedId = requestId.current;
    try { await onLoadCurrent(); }
    catch (reason) {
      if (requestId.current === requestedId && activeKey.current === requestedKey) setFailure({ key: requestedKey, message: reason instanceof Error ? reason.message : 'Не удалось загрузить выданные материалы.' });
    }
  }

  if (!open) return null;
  return <dialog ref={dialog} className="lesson-materials-dialog" aria-labelledby="lesson-materials-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="lesson-materials-heading"><h2 id="lesson-materials-title">Материалы занятия</h2><button type="button" className="icon" aria-label="Закрыть материалы занятия" onClick={onClose}><X size={20} aria-hidden="true"/></button></div>
    <div className="lesson-materials-body">
      <section className="lesson-issued-materials" aria-label="Уже выдано на занятии">
        <div className="lesson-materials-heading"><div><h3>Уже выдано на занятии</h3><p>Материалы и домашнее задание сохранённого урока.</p></div><button type="button" className="button secondary" disabled={busy} onClick={() => void reloadCurrent()}><RefreshCw size={15} aria-hidden="true"/>Загрузить выданные материалы</button></div>
        {currentMatches ? <>
          <h4>Материалы</h4><SectionView fileFallback="pdf" section={currentLesson!.materials} emptyTitle="Выданных материалов нет"/>
          <h4>Домашнее задание</h4><SectionView section={currentLesson!.homework} emptyTitle="Домашнее задание не выдано"/>
        </> : <p className="lesson-materials-help">Загрузите выданные материалы для выбранного занятия. Данные другого урока здесь не отображаются.</p>}
      </section>
      {theme && <section className="lesson-prospective-materials" aria-label="Материалы выбранной темы">
        <h3>Материалы выбранной темы</h3><p>{label(theme.theme)}</p>
        <p className="lesson-materials-help">Это содержание методпакета для выбранной темы. Просмотр не выдаёт материалы ученикам и не сохраняет тему.</p>
        {!canPreview ? <p role="status">Omni не передал точную привязку темы к методпакету и неделе. Предпросмотр этой темы недоступен.</p>
          : loading === key ? <p role="status">Загружаем материалы темы…</p>
          : visiblePack && <>
            {[visiblePack.materials, visiblePack.themes].flatMap(section => section.error ? [section.error] : []).map((message, index) => <p className="warning" role="alert" key={index}>{message}</p>)}
            {!visiblePack.materials.error && <div className="method-cards">{topics.flatMap(topic => topic.materials).map(material => <MaterialCard key={material.key} material={material} typeName=""/>)}</div>}
            {!visiblePack.materials.error && !topics.some(topic => topic.materials.length) && <p role="status">В ответе Omni нет материалов для выбранной недели.</p>}
          </>}
      </section>}
      {failure?.key === key && <p className="warning" role="alert">{failure.message}</p>}
    </div>
  </dialog>;
}

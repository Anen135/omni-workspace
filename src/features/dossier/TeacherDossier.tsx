import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw, UserRound } from 'lucide-react';
import { ConnectionError, omniRequest } from '../../services/omni-client';
import { dossierModel, type TeacherDossierData } from './dossier-model';
import { DossierProfile } from './components/DossierProfile';
import { DossierOverview } from './components/DossierOverview';
import { DossierDynamics } from './components/DossierDynamics';
import { DossierDetails } from './components/DossierDetails';
import { DossierSection } from './components/DossierSection';
import './teacher-dossier.css';
import { DossierIncome } from './components/DossierIncome';
import type { Section } from '../../services/omni-client';

type Dossier = TeacherDossierData;

export function TeacherDossier({ accountId, accountName, branch, schedule, today, disabled, onConnectionError, onIncomeLoading }: {
  accountId: string; accountName: string; branch?: string; schedule: Section; today: string; disabled: boolean; onConnectionError: (reason: unknown) => void; onIncomeLoading?: (loading: boolean) => void;
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
  const model = dossier ? dossierModel(dossier) : null;
  const retry = disabled ? undefined : () => void load();
  return <section className="panel teacher-dossier" aria-label="Досье преподавателя" aria-busy={busy}>
    <div className="panel-heading"><div><h2><UserRound size={19}/>{dossier?.account.name || accountName}</h2><p>Досье преподавателя · данные Omni</p></div><button className="button secondary" disabled={locked} onClick={() => void load()}><RefreshCw size={15}/>Обновить досье</button></div>
    {(busy || disabled && !dossier && !error) && <div className="dossier-status" role="status"><LoaderCircle className="spin" size={17}/>{dossier ? 'Обновляем досье…' : 'Загружаем досье…'}</div>}
    {error && <div className="dossier-error"><div className="warning" role="alert">{error}</div><button className="button secondary" disabled={locked} onClick={() => void load()}>Повторить загрузку</button></div>}
    {dossier && model && <>
      <DossierIncome accountId={accountId} branch={branch} schedule={schedule} today={today} disabled={locked} onConnectionError={onConnectionError} onLoadingChange={onIncomeLoading}/>
      {dossier.all.error && <div className="dossier-error"><div className="warning" role="alert">{dossier.all.error}</div><button className="button secondary" disabled={locked} onClick={() => void load()}>Повторить загрузку досье</button></div>}
      <DossierSection title="Профиль" busy={busy} empty={!model.profile.length}><DossierProfile fields={model.profile}/></DossierSection>
      <DossierSection title="Показатели" description="Учебная работа и результаты студентов" error={model.errors.metrics === dossier.all.error ? null : model.errors.metrics} busy={busy} empty={!model.metrics.length} onRetry={retry}><DossierOverview metrics={model.metrics}/></DossierSection>
      <DossierSection title="Динамика" description="Показатели по месяцам" error={model.errors.dynamics === dossier.all.error ? null : model.errors.dynamics} busy={busy} empty={!model.series.length} onRetry={retry}><DossierDynamics series={model.series}/></DossierSection>
      <DossierSection title="Предметы" busy={busy} empty={!model.subjects.length}><DossierDetails tables={model.subjects}/></DossierSection>
      <DossierSection title="По периодам" busy={busy} empty={!model.periods.length}><DossierDetails tables={model.periods}/></DossierSection>
      <DossierSection title="Обратная связь" busy={busy} empty={!model.feedback.length}><DossierDetails tables={model.feedback}/></DossierSection>
      <DossierSection title="Нужна помощь" busy={busy} empty={!model.assistance.length} emptyText="Omni не вернул студентов, которым нужна помощь."><DossierDetails tables={model.assistance}/></DossierSection>
    </>}
  </section>;
}

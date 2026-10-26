import { useEffect, useRef, useState } from 'react';
import { HelpTip } from '../../components/ui/HelpTip';
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

export function TeacherDossier({ accountId, accountName, branch, schedule, today, disabled, active = true, refreshKey, onConnectionError, onIncomeLoading }: {
  accountId: string; accountName: string; branch?: string; schedule: Section; today: string; disabled: boolean; active?: boolean; refreshKey?: unknown; onConnectionError: (reason: unknown) => void; onIncomeLoading?: (loading: boolean) => void;
}) {
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const initialRequested = useRef(false);
  const inFlight = useRef<number | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(false);

  async function load() {
    if (disabled || !active || inFlight.current !== null || incomeLoading) return;
    const id = ++requestId.current;
    inFlight.current = id;
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
    } finally {
      if (inFlight.current === id) { inFlight.current = null; setBusy(false); }
    }
  }
  useEffect(() => {
    initialRequested.current = false;
    requestId.current++;
    setDossier(null);
    return () => { requestId.current++; };
  }, [refreshKey]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (active && !disabled && !busy && !incomeLoading && !initialRequested.current) { initialRequested.current = true; void load(); }
    }, 0);
    return () => clearTimeout(timer);
  }, [active, disabled, busy, incomeLoading, refreshKey]);

  const locked = disabled || busy || incomeLoading || !active;
  const model = dossier ? dossierModel(dossier) : null;
  const retry = disabled ? undefined : () => void load();
  return <section className="panel teacher-dossier" aria-label="Досье преподавателя" aria-busy={busy}>
    <div className="panel-heading"><div className="help-heading"><h2><UserRound size={19}/>{dossier?.account.name || accountName}</h2><HelpTip label="О досье преподавателя">Профиль, показатели и результаты студентов из Omni.</HelpTip></div><button className="button secondary" disabled={locked} onClick={() => void load()}><RefreshCw size={15}/>Обновить досье</button></div>
    {(busy || disabled && !dossier && !error) && <div className="dossier-status" role="status"><LoaderCircle className="spin" size={17}/>{dossier ? 'Обновляем досье…' : 'Загружаем досье…'}</div>}
    {error && <div className="dossier-error"><div className="warning" role="alert">{error}</div><button className="button secondary" disabled={locked} onClick={() => void load()}>Повторить загрузку</button></div>}
    {dossier && model && <>
      <DossierIncome accountId={accountId} branch={branch} schedule={schedule} today={today} disabled={disabled || busy || !initialRequested.current} active={active} refreshKey={refreshKey} onConnectionError={onConnectionError} onLoadingChange={loading => { setIncomeLoading(loading); onIncomeLoading?.(loading); }}/>
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

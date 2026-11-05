import { useTeacherDossier } from './useTeacherDossier';
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
  const { dossier, busy, error, initialRequested, setIncomeLoading, locked, model, retry, load } = useTeacherDossier({ accountId, disabled, active, refreshKey, onConnectionError });
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

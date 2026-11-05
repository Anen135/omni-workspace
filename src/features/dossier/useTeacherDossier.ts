import { useEffect, useRef, useState } from 'react';
import { ConnectionError, omniRequest } from '../../services/omni-client';
import { dossierModel, type TeacherDossierData } from './dossier-model';
type Dossier = TeacherDossierData;
export function useTeacherDossier({ accountId, disabled, active, refreshKey, onConnectionError }: { accountId: string; disabled: boolean; active: boolean; refreshKey?: unknown; onConnectionError: (reason: unknown) => void }) {
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
  return { dossier, busy, error, initialRequested, setIncomeLoading, locked, model, retry, load };
}

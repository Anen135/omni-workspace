import { useEffect, useMemo, useState } from 'react';
import { incomeStorageKey, readIncomeConfig } from '../features/dossier/income';
import { lessonEstimates, currentLessonEstimate } from '../features/dossier/lesson-estimate';
import type { RemoteRecord } from '../services/omni-client';

export function useLessonEstimates(accountId: string, branch: string, tab: string, schedule: RemoteRecord, presents: RemoteRecord) {
  const [revision, setRevision] = useState(0);
  const key = incomeStorageKey(accountId, branch);
  useEffect(() => {
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) setRevision(value => value + 1); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [key]);
  // Returning from Income picks up settings saved in this document as well.
  const pricing = useMemo(() => {
    let storage: Storage | null = null;
    let initial = true;
    try { storage = window.localStorage; initial = !storage.getItem(key); } catch { /* Use labelled initial rates. */ }
    const result = readIncomeConfig(storage, accountId, branch);
    return { config: result.config, initial: initial || !!result.error };
  }, [accountId, branch, key, tab, revision]);
  return {
    byKey: useMemo(() => lessonEstimates(schedule, pricing.config, pricing.initial), [schedule, pricing]),
    current: useMemo(() => currentLessonEstimate(schedule, pricing.config, pricing.initial, presents), [schedule, pricing, presents]),
  };
}

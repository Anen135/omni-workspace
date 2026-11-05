import { useEffect, useRef, useState } from 'react';
import { ConnectionError, omniRequest, type Section } from '../../services/omni-client';
import { incomeRequestWeeks, incomeSnapshotWeek, isIncomeDatedWeekSchedule, isIncomeWeekSchedule, type IncomeHistoryWeek } from './income';
export function useIncomeHistory({ accountId, schedule, today, payday, active, disabled, refreshKey, onConnectionError, onLoadingChange }: { accountId: string; schedule: Section; today: string; payday: number; active: boolean; disabled: boolean; refreshKey?: unknown; onConnectionError?: (reason: unknown) => void; onLoadingChange?: (loading: boolean) => void }) {
  const [history, setHistory] = useState<IncomeHistoryWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);
  const inFlight = useRef<number | null>(null);
  const retained = useRef<IncomeHistoryWeek[]>([]);
  const attempted = useRef(new Set<number>());
  const [includeYear, setIncludeYear] = useState(false);
  const latest = useRef({ active, disabled });
  latest.current = { active, disabled };
  const onConnectionErrorRef = useRef(onConnectionError);
  onConnectionErrorRef.current = onConnectionError;
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  const desiredWeeks = incomeRequestWeeks(today, payday, includeYear);
  const desiredKey = desiredWeeks.join(',');

  async function load(fresh = false) {
    if (!latest.current.active || latest.current.disabled || inFlight.current !== null) return;
    if (fresh) {
      retained.current = [];
      attempted.current.clear();
      setHistory([]);
    }
    const weeks = desiredWeeks.filter(week => !attempted.current.has(week)
      && !retained.current.some(item => item.week === week && isIncomeWeekSchedule(item.schedule, today, week)));
    if (!weeks.length) return;
    const id = ++requestId.current;
    inFlight.current = id;
    // Capture this worker's owner. A later render/context must not release it.
    const notifyLoading = onLoadingChangeRef.current;
    setLoading(true); setLoadError('');
    notifyLoading?.(true);
    try {
      for (let offset = 0; offset < weeks.length; offset += 16) {
        if (id !== requestId.current || !latest.current.active || latest.current.disabled) break;
        const batch = weeks.slice(offset, offset + 16);
        batch.forEach(week => attempted.current.add(week));
        let items: IncomeHistoryWeek[];
        try {
          const result = await omniRequest<{ account: { id: string }; weeks: IncomeHistoryWeek[] }>('schedule-range', { accountId, weeks: batch });
          if (id !== requestId.current) return;
          if (result.account?.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.');
          items = batch.map(week => {
            const matches = Array.isArray(result.weeks) ? result.weeks.filter(item => item?.week === week) : [];
            const item = matches[0];
            return matches.length === 1 && item?.schedule && isIncomeDatedWeekSchedule(item.schedule, today, week)
              ? item : { week, schedule: { data: null, error: item?.schedule?.error || 'Omni не вернул датированное расписание недели.' } };
          });
        } catch (reason) {
          if (id !== requestId.current) return;
          if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) throw reason;
          const message = reason instanceof Error ? reason.message : 'Не удалось загрузить расписание.';
          items = batch.map(week => ({ week, schedule: { data: null, error: message } }));
        }
        retained.current = [...retained.current.filter(item => !batch.includes(item.week)), ...items];
        setHistory(retained.current);
      }
      if (id === requestId.current && retained.current.some(item => desiredWeeks.includes(item.week) && !isIncomeWeekSchedule(item.schedule, today, item.week))) {
        setLoadError('Часть недель не загружена. Известные суммы приблизительны; повторите загрузку недостающих недель.');
      }
    } catch (reason) {
      if (id !== requestId.current) return;
      setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить расписание.');
      desiredWeeks.forEach(week => attempted.current.add(week));
      retained.current = []; setHistory([]);
      onConnectionErrorRef.current?.(reason);
    } finally {
      // Even invalidated workers hold ownership until the transport settles.
      if (inFlight.current === id) {
        inFlight.current = null;
        setLoading(false);
        notifyLoading?.(false);
      }
    }
  }

  useEffect(() => {
    requestId.current++;
    const supplied = incomeSnapshotWeek(schedule, today);
    retained.current = supplied ? [supplied] : [];
    attempted.current.clear();
    setHistory(retained.current); setLoadError('');
    return () => { requestId.current++; };
  }, [today, refreshKey]);
  useEffect(() => {
    // Scope changes may retry missing or failed weeks. Navigation alone keeps
    // attempted partial responses, while unrequested batches can still resume.
    attempted.current.clear();
  }, [desiredKey]);
  useEffect(() => {
    // StrictMode's disposable probe must not issue a remote request.
    const timer = setTimeout(() => { if (active && !disabled) void load(); }, 0);
    return () => clearTimeout(timer);
  }, [today, refreshKey, active, disabled, desiredKey, loading]);

  return { history, loading, loadError, desiredWeeks, attempted, includeYear, setIncludeYear, load };
}

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { ConnectionError, omniRequest, rows, type Account, type Snapshot } from '../services/omni-client';
import { studentRow } from '../features/students/students';

// Read-only roster data is kept separate from lesson drafts and homework records.
export function useStudentAverages(snapshot: Snapshot | null, groupIds: string[], enabled: boolean, operation: MutableRefObject<boolean>) {
  const groupKey = JSON.stringify(groupIds);
  // A fresh snapshot/session must never reactivate a previous roster cache.
  const context = useMemo(() => ({}), [snapshot, groupKey]);
  const account = snapshot?.account;
  const [result, setResult] = useState<{ context: object; values: ReadonlyMap<string, string>; photos: ReadonlyMap<string, string> }>();
  const [loading, setLoading] = useState(false);
  const [wake, setWake] = useState(0);
  const running = useRef(false);
  const completed = useRef<object | null>(null);
  useEffect(() => { setResult(undefined); }, [context]);
  useEffect(() => {
    if (!account || !enabled || !groupIds.length || running.current || operation.current || completed.current === context) return;
    completed.current = context;
    running.current = true;
    operation.current = true;
    setLoading(true);
    let cancelled = false;
    const values = new Map<string, string>();
    const photos = new Map<string, string>();
    async function readGroup(group: string) {
      // A page we just left may still own the transport. Only BUSY reads can
      // wait and retry; mutation commands never pass through this helper.
      for (let attempt = 0; attempt < 60 && !cancelled; attempt++) {
        try { return await omniRequest<{ account: Account; students: unknown }>('group', { group }); }
        catch (error) {
          if (!(error instanceof ConnectionError) || error.code !== 'BUSY' || attempt === 59) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 300));
        }
      }
      return null;
    }
    void (async () => {
      try {
        for (const group of groupIds) {
          if (cancelled) return;
          try {
            const response = await readGroup(group);
            if (cancelled || !response) return;
            if (response.account.id !== account.id || (response.account.branch !== undefined && response.account.branch !== (account.branch || ''))) return;
            for (const source of rows(response.students)) {
              const student = studentRow(source);
              if (student.id && student.values.average) values.set(student.id, student.values.average);
              if (student.id && typeof source.photo_pas === 'string' && source.photo_pas.trim()) photos.set(student.id, source.photo_pas.trim());
            }
            setResult({ context, values: new Map(values), photos: new Map(photos) });
          } catch { /* Unavailable statistics stay empty until the next snapshot. */ }
        }
      } finally {
        // Keep the workspace locked until the actual transport request finishes,
        // even if navigation/session changes have stopped accepting its response.
        running.current = false;
        operation.current = false;
        setLoading(false);
        setWake(value => value + 1);
      }
    })();
    return () => { cancelled = true; };
  }, [context, enabled, wake]);
  return { values: result?.context === context ? result.values : undefined, photos: result?.context === context ? result.photos : undefined, loading };
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { omniRequest, type Account, type Section } from '../../services/omni-client';
import { homeworkHistoryGroups, homeworkHistoryModel, type HomeworkHistoryFilter } from './homework-history';
type HistoryResponse = { account: Account; students: Section; homeworks: Section };
export function useHomeworkHistory({ accountId, catalog }: { accountId: string; catalog: Section }) {
  const limit = 10;
  const catalogModel = useMemo(() => {
    try { return { groups: catalog.error ? [] : homeworkHistoryGroups(catalog.data), error: catalog.error }; }
    catch (error) { return { groups: [], error: error instanceof Error ? error.message : 'Не удалось прочитать список групп.' }; }
  }, [catalog]);
  const [groupId, setGroupId] = useState('');
  const group = catalogModel.groups.find(item => item.id === groupId) ?? catalogModel.groups[0];
  const [specKey, setSpecKey] = useState('');
  const subject = group?.subjects.find(item => item.key === specKey) ?? group?.subjects[0];
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<HomeworkHistoryFilter>('all');
  const [result, setResult] = useState<ReturnType<typeof homeworkHistoryModel> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<string | null>(null);
  const signature = JSON.stringify([accountId, group?.id, subject?.key, year, month, offset]);
  const latestSignature = useRef(signature);
  latestSignature.current = signature;
  const requestId = useRef(0);
  const mounted = useRef(false);
  // Layout cleanup invalidates before promise callbacks can publish an old context.
  useLayoutEffect(() => {
    mounted.current = true;
    requestId.current++;
    setResult(null); setError(''); setBusy(false); setDetail(null);
    return () => { mounted.current = false; requestId.current++; };
  }, [signature, catalog]);

  function invalidate() { requestId.current++; setResult(null); setError(''); setBusy(false); setDetail(null); }
  async function load() {
    if (!group || !subject || !accountId) return;
    if (year && !/^(19|20)\d{2}$/.test(year)) { setError('Укажите год от 1900 до 2099 или оставьте поле пустым.'); return; }
    const id = ++requestId.current, context = signature;
    const current = () => mounted.current && requestId.current === id && latestSignature.current === context;
    setBusy(true); setError(''); setResult(null); setDetail(null);
    try {
      const response = await omniRequest<HistoryResponse>('homework-history', {
        accountId, groupId: group.id, specKey: subject.key, year, month, limit, offset,
      });
      if (!current()) return;
      if (response.account?.id !== accountId) throw new Error('Аккаунт изменился. Загрузите историю заново.');
      if (!response.students || !response.homeworks) throw new Error('Omni вернул неполный ответ истории.');
      if (response.students.error || response.homeworks.error) {
        throw new Error([response.students.error, response.homeworks.error].filter(Boolean).join(' · '));
      }
      setResult(homeworkHistoryModel(response.students.data, response.homeworks.data, offset, limit));
    } catch (cause) {
      if (current()) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить историю.');
    } finally { if (current()) setBusy(false); }
  }
  return { catalogModel, group, subject, year, month, offset, filter, result, busy, error, detail, setGroupId, setSpecKey, setYear, setMonth, setOffset, setFilter, setDetail, invalidate, load, limit };
}

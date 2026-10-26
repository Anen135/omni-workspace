import { ConnectionError, omniRequest, type Account, type RequestOptions } from '../services/omni-client';

export type RosterResponse = { account: Account; students: unknown };
/** One workspace generation only. No profile cache and no persisted student data. */
export function createRosterCache(account: Account) {
  const values = new Map<string, RosterResponse>();
  const pending = new Map<string, Promise<RosterResponse>>();
  function read(group: string, options: RequestOptions = {}, refresh = false): Promise<RosterResponse> {
    if (options.signal?.aborted) return Promise.reject(new DOMException('Запрос отменён.', 'AbortError'));
    if (refresh) values.delete(group);
    const existing = pending.get(group);
    if (existing) {
      return existing.then(result => refresh ? read(group, options, true) : result, reason => {
        // Navigation can cancel a queued background read. Another consumer may
        // start its own read; an already-started transport is never preempted.
        if (reason instanceof DOMException && reason.name === 'AbortError' && !options.signal?.aborted) return read(group, options, refresh);
        throw reason;
      });
    }
    const cached = values.get(group);
    if (cached) return Promise.resolve(cached);
    const operation = omniRequest<RosterResponse>('group', { group }, options).then(result => {
      if (result.account.id !== account.id || result.account.branch !== undefined && result.account.branch !== (account.branch || '')) throw new ConnectionError('ACCOUNT_CHANGED', 'Контекст студентов изменился. Обновите данные.');
      values.set(group, result);
      return result;
    }).finally(() => { if (pending.get(group) === operation) pending.delete(group); });
    pending.set(group, operation);
    return operation;
  }
  return { read };
}
export type RosterCache = ReturnType<typeof createRosterCache>;

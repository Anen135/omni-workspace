import { BridgeError, validateInput } from './bridge-protocol.mjs';

// Only load schedule sections; income calculations do not need full snapshots.
export async function loadScheduleRange(input, { identity, section }) {
  validateInput('schedule-range', input);
  const accountId = input.accountId;
  const requestedWeeks = [...input.weeks];
  const account = await identity();
  if (account.id !== accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные перед загрузкой расписания.', 409);
  const weeks = [];
  for (const week of requestedWeeks) {
    const schedule = await section('/schedule/get-schedule', { week });
    if ((await identity()).id !== accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился во время загрузки расписания. Обновите подключение.', 409);
    weeks.push({ week, schedule });
  }
  return { account, weeks };
}

import { BridgeError, validateInput } from './bridge-protocol.mjs';

// Narrow read used by the homework page; never reload unrelated workspace data.
export async function loadHomeworkQueue(input, { identity, section }) {
  validateInput('homework-queue', input);
  const account = await identity();
  if (account.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.', 409);
  const newHomework = await section('/homework/get-new-homeworks', {});
  if ((await identity()).id !== account.id) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился во время загрузки работ.', 409);
  return { account, newHomework };
}

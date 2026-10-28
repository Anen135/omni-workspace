import { BridgeError, validateInput } from './bridge-protocol.mjs';
import { homeworkHistoryGroups } from '../src/features/homework/homework-history.ts';

// Read-only equivalent of homeWorkCtrl.getStudents/getHomeworks. Resolve the
// subject from Omni's current catalog instead of accepting arbitrary API fields.
export async function loadHomeworkHistory(input, { identity, section }) {
  validateInput('homework-history', input);
  const account = await identity();
  const checkAccount = next => {
    if (next.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.', 409);
  };
  checkAccount(account);
  const catalog = await section('/homework/get-group-spec', { type: 0 });
  if (catalog.error) throw new BridgeError('UPSTREAM_ERROR', catalog.error);
  const group = homeworkHistoryGroups(catalog.data).find(item => item.id === input.groupId);
  const subject = group?.subjects.find(item => item.key === input.specKey)?.source;
  if (!subject) throw new BridgeError('HOMEWORK_CHANGED', 'Группа или предмет изменились. Обновите данные Omni.', 409);
  const common = { id_tgroups: input.groupId, source: subject.source ?? null, id_base_spec: subject.id_base_spec ?? null, transferred: false };
  const students = await section('/homework/get-students', { ...common, spec: subject.id_spec });
  const homeworks = await section('/homework/get-homeworks', {
    ...common, id_spec: subject.id_spec, limit: input.limit, offset: input.offset,
    type: 0, year: input.year, month: input.month,
  });
  checkAccount(await identity());
  return { account, students, homeworks };
}

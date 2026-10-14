import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';
import { attendanceStudents, attendanceStatus } from '../src/features/lesson/attendance.ts';
import { rewardValue, rewardMatches } from '../src/features/lesson/lesson-reward.ts';

// Official presentsCtrl.setPrize / presents_factory.setPrize. Levels 1..3;
// REMOVE_REWARD=4. Never send student metadata or a URL supplied by the UI.
export async function saveLessonReward(input, { request, identity }) {
  validateInput('set-lesson-reward', input);
  const account = async () => {
    const value = await identity();
    if (value.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Перечитайте урок.');
    return value;
  };
  const params = { date: input.date, group: input.group, lenta: input.lenta };
  const studentIn = presents => {
    if (!presents || presents.cur_date !== input.date || String(presents.cur_group) !== input.group || String(presents.cur_lenta) !== input.lenta || String(presents.cur_schedule) !== input.schedule) throw new BridgeError('LESSON_CHANGED', 'Omni вернул другое занятие. Перечитайте урок.');
    const matches = attendanceStudents(presents.students).filter(student => String(student.id_stud) === input.stud);
    if (matches.length !== 1 || String(matches[0].id_vizit) !== input.visit) throw new BridgeError('REWARD_CONFLICT', 'Запись посещения изменилась. Перечитайте урок.');
    return matches[0];
  };
  await account();
  const before = await request('/presents/get-presents', params);
  const student = studentIn(before);
  const previous = rewardValue(student.prize);
  if (previous !== input.previousReward) throw new BridgeError('REWARD_CONFLICT', 'Топкойны уже изменились в Omni. Перечитайте урок.');
  if (![null, '1', '2', '3'].includes(previous) || ![1, 2].includes(attendanceStatus(student.was)) || input.reward === 4 && previous === null) throw new BridgeError('REWARD_UNAVAILABLE', 'Топкойны доступны присутствующим или опоздавшим ученикам; снимать можно только существующую награду.');
  await account();
  let response;
  try {
    // Exactly one mutation; an uncertain outcome must be reread, not retried.
    response = await request('/presents/set-prize', { prizes: { 0: { id: student.id_vizit, reward: input.reward } } });
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'REWARD_REJECTED'].includes(error.code)) throw error;
    throw new BridgeError('REWARD_UNCONFIRMED', 'Не удалось подтвердить топкойны. Перечитайте урок перед повторной отправкой.');
  }
  if (!response?.success || response.error) {
    const reason = typeof response?.error === 'string' ? response.error : typeof response?.message === 'string' ? response.message : '';
    throw new BridgeError('REWARD_REJECTED', `Omni отклонил топкойны.${reason ? ' ' + reason.replace(/<[^>]*>/g, '').slice(0, 250) : ''} Перечитайте урок.`);
  }
  try {
    const presents = await request('/presents/get-presents', params);
    const saved = studentIn(presents);
    const confirmed = await account();
    if (!rewardMatches(saved.prize, input.reward)) throw new Error('Readback mismatch');
    return { account: confirmed, presents };
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error;
    throw new BridgeError('REWARD_UNCONFIRMED', 'Запрос отправлен, но Omni не подтвердил топкойны. Перечитайте урок.');
  }
}

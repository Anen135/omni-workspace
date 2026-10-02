import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';
import { attendanceStudents } from '../src/attendance.ts';
export const markValue = value => value === undefined || value === null || value === '' ? null : String(value);
// Official presentsCtrl: setMarkSend({ marks: { key: { type, mark, vizit } } }).
export async function saveLessonMark(input, { request, identity }) {
  validateInput('set-lesson-mark', input);
  const account = async () => {
    const result = await identity();
    if (result.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Перечитайте урок.');
    return result;
  };
  const params = { date: input.date, group: input.group, lenta: input.lenta };
  const studentIn = presents => {
    if (!presents || presents.cur_date !== input.date || String(presents.cur_group) !== input.group || String(presents.cur_lenta) !== input.lenta || String(presents.cur_schedule) !== input.schedule) throw new BridgeError('LESSON_CHANGED', 'Omni вернул другое занятие. Перечитайте урок.');
    const matches = attendanceStudents(presents.students).filter(row => String(row.id_stud) === input.stud);
    if (matches.length !== 1 || String(matches[0].id_vizit) !== input.visit) throw new BridgeError('MARK_CONFLICT', 'Запись посещения изменилась. Перечитайте урок.');
    return matches[0];
  };
  await account();
  const before = await request('/presents/get-presents', params);
  const student = studentIn(before);
  const field = `mark${input.type}`;
  if (markValue(student[field]) !== input.previousMark) throw new BridgeError('MARK_CONFLICT', 'Оценка уже изменилась в Omni. Перечитайте урок.');
  await account();
  let response;
  try {
    response = await request('/presents/set-mark', { marks: { 0: { type: input.type, mark: input.mark, vizit: student.id_vizit } } });
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'MARK_REJECTED'].includes(error.code)) throw error;
    throw new BridgeError('MARK_UNCONFIRMED', 'Не удалось подтвердить оценку. Перечитайте урок перед повторной отправкой.');
  }
  if (!response?.success || response.error) throw new BridgeError('MARK_REJECTED', `Omni отклонил оценку. ${typeof response?.message === 'string' ? response.message.replace(/<[^>]*>/g, '').slice(0, 250) : 'Проверьте допустимую оценку и доступ к этому занятию.'}`);
  try {
    const presents = await request('/presents/get-presents', params);
    const saved = studentIn(presents);
    const confirmed = await account();
    if (markValue(saved[field]) !== String(input.mark)) throw new Error('Readback mismatch');
    return { account: confirmed, presents };
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error;
    throw new BridgeError('MARK_UNCONFIRMED', 'Запрос отправлен, но оценка не подтверждена. Перечитайте урок.');
  }
}

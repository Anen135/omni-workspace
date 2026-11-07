import { BridgeError, validateInput } from './bridge-protocol.mjs';
import { lessonAccessDate } from '../src/features/lesson/lesson-access.ts';

const text = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').slice(0, 2000) : '';

// Fixed commands verified against original presents_factory.js and presents/index.
export async function lessonAccess(action, input, { request, identity }) {
  validateInput(action, input);
  const account = async () => {
    const current = await identity();
    if (current.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные.');
    return current;
  };
  const load = async () => {
    const raw = await request('/presents/get-data-request-zavuch', {});
    if (!raw || !Array.isArray(raw.dates) || !Array.isArray(raw.requests) || raw.dates.some(date => !lessonAccessDate(date)) || raw.requests.some(row => !row || !lessonAccessDate(row.date_req))) throw new BridgeError('SCHEMA_CHANGED', 'Не удалось распознать даты и историю запросов Omni.');
    if (new Set(raw.dates.map(lessonAccessDate)).size !== raw.dates.length) throw new BridgeError('SCHEMA_CHANGED', 'Omni вернул неоднозначные даты запроса.');
    return { raw, dates: [...new Set(raw.dates.map(lessonAccessDate))], requests: raw.requests.map(row => ({
      date: lessonAccessDate(row.date_req), status: text(row.approve),
      approver: Number(row.zavuch_id) > 0 ? text(row.fio_teach) : '', canOpen: row.can_set === 1 || row.can_set === '1',
    })) };
  };
  await account();
  const before = await load();
  const result = data => ({ dates: data.dates, requests: data.requests });
  if (action === 'lesson-access') return { ...result(before), account: await account() };
  const date = before.raw.dates.find(date => lessonAccessDate(date) === input.date);
  if (!date) throw new BridgeError('ACCESS_DATE_UNAVAILABLE', 'Эта дата недоступна для запроса. Обновите историю.');
  if (before.requests.some(row => row.date === input.date)) throw new BridgeError('ACCESS_REQUEST_EXISTS', 'Для этой даты уже есть запрос. Проверьте его статус в истории.');
  await account();
  let response;
  try { response = await request('/presents/send-request-zavuch', { date, message: input.message.trim() }); }
  catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'ACCESS_REJECTED'].includes(error.code)) throw error;
    throw new BridgeError('ACCESS_UNCONFIRMED', 'Не удалось подтвердить отправку. Проверьте историю запросов; повторная отправка этой даты заблокирована до проверки в оригинальном Omni.');
  }
  const accepted = response?.success === true || typeof response?.success === 'string' && response.success.trim().length > 0;
  if (!accepted) {
    if (typeof response?.error === 'string' && response.error.trim()) throw new BridgeError('ACCESS_REJECTED', text(response.error));
    throw new BridgeError('ACCESS_UNCONFIRMED', 'Omni не подтвердил результат отправки. Проверьте историю и оригинальный Omni перед повторной отправкой.');
  }
  try {
    const after = await load();
    const confirmed = await account();
    if (!after.requests.some(row => row.date === input.date)) throw new Error('Missing request');
    return { ...result(after), account: confirmed, message: text(response.success) || 'Запрос отправлен. Статус доступен в истории.' };
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error;
    throw new BridgeError('ACCESS_UNCONFIRMED', 'Omni принял запрос, но запись в истории не подтверждена. Проверьте её в оригинальном Omni перед повторной отправкой.');
  }
}

import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';
import { attendanceLessonInfo } from '../src/attendance.ts';

// Verified against Omni presentsCtrl.js getMethodpackageThemes / saveTheme.
export async function lessonTheme(action, input, { request, identity }) {
  validateInput(action, input);
  const account = async () => {
    const result = await identity();
    if (result.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите урок.');
    return result;
  };
  const params = { date: input.date, group: input.group, lenta: input.lenta };
  const check = presents => {
    if (!presents || presents.cur_date !== input.date || String(presents.cur_group) !== input.group || String(presents.cur_lenta) !== input.lenta || String(presents.cur_schedule) !== input.schedule) throw new BridgeError('LESSON_CHANGED', 'Omni вернул другое занятие. Загрузите урок заново.');
  };
  await account();
  const before = await request('/presents/get-presents', params);
  check(before);
  const themes = before.scheduleType === 'planned' ? await request('/presents/get-methodpackage-themes', { schedule: before.cur_schedule }) : [];
  if (!Array.isArray(themes) || themes.some(row => !row || typeof row.theme !== 'string' || !/^[1-9]\d{0,11}$/.test(String(row.public_week_id)))) throw new BridgeError('SCHEMA_CHANGED', 'Не удалось распознать список тем Omni.');
  if (action === 'lesson-themes') return { account: await account(), presents: before, themes };
  const info = attendanceLessonInfo(before);
  if (!info || before.can_set_theme === false || before.can_set_theme === 0 || before.can_set_theme === '0') throw new BridgeError('THEME_UNAVAILABLE', 'Omni не разрешает изменить тему этого занятия.');
  if ((info.theme || '') !== input.previousTheme) throw new BridgeError('THEME_CONFLICT', 'Тема уже изменилась в Omni. Загрузите урок заново.');
  let theme = input.theme.trim();
  if (input.publicWeekId !== null) {
    const matches = themes.filter(row => String(row.public_week_id) === input.publicWeekId);
    if (matches.length !== 1 || matches[0].theme !== input.theme) throw new BridgeError('THEME_CONFLICT', 'Выбранная тема больше не доступна. Перечитайте список тем.');
    const selected = matches[0];
    if (input.issueHomework && !selected.has_homework || input.issueLabwork && !selected.has_labwork) throw new BridgeError('BAD_INPUT', 'У выбранной темы нет запрошенных материалов.');
    theme = selected.theme;
  } else if (input.issueHomework || input.issueLabwork) throw new BridgeError('BAD_INPUT', 'Выдача материалов требует темы из методпакета.');
  if (before.scheduleType === 'event' && theme !== before.scheduleData?.theme) throw new BridgeError('THEME_UNAVAILABLE', 'Тема мероприятия задана расписанием.');
  await account();
  let response;
  try {
    response = await request('/presents/set-theme', {
      ...params, theme, spec: before.cur_spec?.id_spec, source: before.cur_spec?.source,
      id_base_spec: before.cur_spec?.id_base_spec, public_week_id: input.publicWeekId === null ? null : Number(input.publicWeekId),
      issue_homework: input.issueHomework, issue_labwork: input.issueLabwork,
      schedule: before.cur_schedule, scheduleType: before.scheduleType,
      teach_type: info.primary_teach || 0, numberParticipants: before.scheduleData?.number_participants || null,
    });
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'THEME_REJECTED'].includes(error.code)) throw error;
    throw new BridgeError('THEME_UNCONFIRMED', 'Не удалось подтвердить сохранение темы. Загрузите урок перед повторной отправкой.');
  }
  if (!response?.success && !response?.theme_saved) throw new BridgeError('THEME_REJECTED', `Omni не сохранил тему. ${typeof response?.message === 'string' ? response.message.replace(/<[^>]*>/g, '').slice(0, 250) : 'Перечитайте урок.'}`);
  try {
    const presents = await request('/presents/get-presents', params);
    check(presents);
    const confirmedAccount = await account();
    const saved = attendanceLessonInfo(presents);
    if (saved?.theme !== theme || input.publicWeekId !== null && String(saved.public_week_id) !== input.publicWeekId) throw new Error('Readback mismatch');
    return { account: confirmedAccount, presents, themes, warning: response.success ? '' : 'Тема сохранена, но Omni сообщил об ошибке выдачи материалов. Проверьте выданные материалы.' };
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error;
    throw new BridgeError('THEME_UNCONFIRMED', 'Запрос отправлен, но тема не подтверждена. Загрузите урок и проверьте результат.');
  }
}

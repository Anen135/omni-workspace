// Executed only in our dedicated Omni tab, in MAIN to use Omni's session cleanup.
// Keep this function self-contained: executeScript serializes it without imports.
export async function switchTeacherInPage(input, verifyOnly = false) {
  const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
  try {
    if (location.origin !== 'https://omni.top-academy.ru' || location.pathname.startsWith('/login') || document.querySelector('input[type=password]')) fail('AUTH_REQUIRED', 'Завершите вход в Omni.');
    if (!input || !['teacherId', 'accountId'].every(key => typeof input[key] === 'string' && /^[1-9]\d{0,11}$/.test(input[key]))) fail('BAD_INPUT', 'Некорректный преподаватель.');
    async function request(path, data = {}) {
      const response = await fetch(path, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000), headers: {
        'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '',
        'Id-Local-Hash': sessionStorage.getItem('IdLocalHash') || '',
      }, body: JSON.stringify(data) });
      if ([401, 403].includes(response.status) || response.url.includes('/login')) fail('AUTH_REQUIRED', 'Сессия истекла. Войдите снова.');
      if (response.status === 409) fail('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные.');
      if (!response.ok) fail('SWITCH_FAILED', 'Omni не выполнил переключение. Обновите данные.');
      return response.json();
    }
    const profile = (await request('/profile/get-profile'))?.teach_info;
    if (!profile?.id_teach || typeof profile.fio_teach !== 'string') fail('SCHEMA_CHANGED', 'Не удалось распознать профиль Omni.');
    const account = { id: String(profile.id_teach), name: profile.fio_teach };
    if (account.id !== (verifyOnly ? input.teacherId : input.accountId)) fail('ACCOUNT_CHANGED', 'Не удалось подтвердить преподавателя. Обновите подключение.');
    if (verifyOnly) return { data: { account } };
    const teachers = await request('/auth/get-teach-list');
    if (!Array.isArray(teachers)) fail('SCHEMA_CHANGED', 'Не удалось распознать список преподавателей.');
    if (!teachers.some(teacher => String(teacher.id_teach) === input.teacherId)) fail('TEACHER_NOT_ALLOWED', 'Преподаватель отсутствует в доступном списке Omni.');
    if (account.id === input.teacherId) return { data: { account } };
    const root = globalThis.angular?.element(document.body).injector()?.get('$rootScope');
    if (typeof root?.clearLocalStorage !== 'function') fail('SWITCH_UNAVAILABLE', 'Omni ещё не готов к переключению. Дождитесь загрузки официальной вкладки.');
    // Recheck after permission lookup before mutating the official session.
    if (String((await request('/profile/get-profile'))?.teach_info?.id_teach) !== input.accountId) fail('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные.');
    root.clearLocalStorage();
    const result = await request('/auth/change-user', { id_user: input.teacherId });
    if (result === false || result?.success === false || result?.error) fail('SWITCH_FAILED', 'Omni отклонил переключение преподавателя.');
    return { data: { switched: true } };
  } catch (error) {
    return { error: { code: error.code || 'SWITCH_FAILED', message: error.code ? error.message : 'Не удалось переключить преподавателя. Обновите подключение.' } };
  }
}

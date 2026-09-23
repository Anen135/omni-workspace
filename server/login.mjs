// Runs inside the official Omni origin. Never return cookies, CSRF or IdLocalHash.
export async function submitOfficialLogin({ username, password }) {
  if (location.origin !== 'https://omni.top-academy.ru') return { code: 'AUTH_REQUIRED' };
  const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (!csrf || !document.querySelector('input[type=password]')) return { code: 'CHALLENGE' };
  try {
    const response = await fetch('/auth/login', {
      method: 'POST', credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-CSRF-Token': csrf },
      body: JSON.stringify({ LoginForm: { id_city: null, username, password } }),
    });
    if (response.status === 429) return { code: 'LOGIN_RATE_LIMIT' };
    if (response.status === 403) return { code: 'CHALLENGE' };
    if (!response.ok) return { code: 'LOGIN_UNAVAILABLE' };
    let result;
    try { result = await response.json(); } catch { return { code: 'CHALLENGE' }; }
    if (result.success === true) {
      if (typeof result.IdLocalHash === 'string') {
        sessionStorage.setItem('IdLocalHash', result.IdLocalHash);
        sessionStorage.removeItem('isWarned');
      }
      return { success: true };
    }
    // Do not echo arbitrary server errors: they may contain credentials or HTML.
    return { code: result.error_permission ? 'LOGIN_PERMISSION' : 'LOGIN_REJECTED' };
  } catch { return { code: 'LOGIN_UNAVAILABLE' }; }
}

export const loginErrors = {
  AUTH_REQUIRED: 'Не удалось открыть страницу входа Omni.',
  CHALLENGE: 'Omni требует проверку браузера. Откройте официальное окно, пройдите проверку и повторите вход.',
  LOGIN_RATE_LIMIT: 'Слишком много попыток входа. Подождите и повторите позже.',
  LOGIN_UNAVAILABLE: 'Omni не ответил на запрос входа. Повторите позже или войдите через официальное окно.',
  LOGIN_PERMISSION: 'Omni не подтвердил доступ. Продолжите вход в официальном окне.',
  LOGIN_REJECTED: 'Omni отклонил вход. Проверьте логин и пароль; при необходимости используйте официальное окно.',
};

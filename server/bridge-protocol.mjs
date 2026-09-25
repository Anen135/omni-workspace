export class BridgeError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateInput(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BridgeError('BAD_INPUT', 'Некорректный запрос.', 400);
  if (!['connect', 'login', 'status', 'snapshot', 'lesson', 'student', 'group', 'switch-teacher', 'materials-catalog', 'method-package'].includes(action)) throw new BridgeError('NOT_FOUND', 'Неизвестное действие.', 404);
  const allowed = { connect: [], login: ['username', 'password'], status: [], snapshot: ['week'], lesson: ['date', 'group', 'lenta'], student: ['stud'], group: ['group'], 'switch-teacher': ['teacherId', 'accountId'], 'materials-catalog': ['form', 'direction'], 'method-package': ['spec'] }[action];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new BridgeError('BAD_INPUT', 'Неизвестный параметр.', 400);
  if (action === 'login' && (typeof input.username !== 'string' || !input.username.trim() || input.username.length > 256 || typeof input.password !== 'string' || !input.password || input.password.length > 1024)) throw new BridgeError('BAD_INPUT', 'Введите логин и пароль допустимой длины.', 400);
  if (input.week !== undefined && (!Number.isInteger(input.week) || Math.abs(input.week) > 52)) throw new BridgeError('BAD_INPUT', 'Неделя вне допустимого диапазона.', 400);
  if (action === 'lesson' && (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date)) throw new BridgeError('BAD_INPUT', 'Некорректная дата.', 400);
  for (const key of ['group', 'stud', 'lenta']) {
    if (input[key] !== undefined && !/^\d{1,12}$/.test(String(input[key]))) throw new BridgeError('BAD_INPUT', 'Некорректный идентификатор.', 400);
  }
  if ((action === 'student' && input.stud === undefined) || (action === 'group' && input.group === undefined)) throw new BridgeError('BAD_INPUT', 'Не указан идентификатор.', 400);
  if (action === 'switch-teacher') {
    for (const key of ['teacherId', 'accountId']) {
      if (typeof input[key] !== 'string' || !/^[1-9]\d{0,11}$/.test(input[key])) throw new BridgeError('BAD_INPUT', key === 'teacherId' ? 'Omni вернул неподдерживаемый идентификатор выбранного преподавателя.' : 'Omni вернул неподдерживаемый идентификатор текущего аккаунта.', 400);
    }
  }
  for (const key of ['form', 'direction', 'spec']) {
    if (input[key] !== undefined && !((typeof input[key] === 'string' || Number.isSafeInteger(input[key])) && /^[1-9]\d{0,11}$/.test(String(input[key])))) throw new BridgeError('BAD_INPUT', 'Некорректный идентификатор методпакета.', 400);
  }
  if ((action === 'method-package' && input.spec === undefined) || (input.direction !== undefined && input.form === undefined)) throw new BridgeError('BAD_INPUT', 'Не выбрана форма обучения или методпакет.', 400);
  return input;
}

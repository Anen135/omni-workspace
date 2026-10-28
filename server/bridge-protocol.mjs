export class BridgeError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateInput(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BridgeError('BAD_INPUT', 'Некорректный запрос.', 400);
  if (action === 'homework-history') {
    const fields = ['accountId', 'groupId', 'specKey', 'year', 'month', 'limit', 'offset'];
    const validId = value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value);
    if (Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key)) ||
        !validId(input.accountId) || !validId(input.groupId) || typeof input.specKey !== 'string' || !input.specKey || input.specKey.length > 512 ||
        !(input.year === '' || typeof input.year === 'string' && /^(20\d{2}|19\d{2})$/.test(input.year)) ||
        !(input.month === '' || typeof input.month === 'string' && /^(?:[1-9]|1[0-2])$/.test(input.month)) ||
        !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50 || !Number.isInteger(input.offset) || input.offset < 0 || input.offset > 10000) {
      throw new BridgeError('BAD_INPUT', 'Некорректные параметры журнала домашних заданий.', 400);
    }
    return input;
  }
  if (action === 'homework-queue') {
    if (Object.keys(input).length !== 1 || typeof input.accountId !== 'string' || !/^[1-9]\d{0,11}$/.test(input.accountId)) throw new BridgeError('BAD_INPUT', 'Укажите аккаунт для загрузки работ.', 400);
    return input;
  }
  if (action === 'schedule-range') {
    if (Object.keys(input).some(key => !['accountId', 'weeks'].includes(key)) || typeof input.accountId !== 'string' || !/^[1-9]\d{0,11}$/.test(input.accountId) || !Array.isArray(input.weeks) || input.weeks.length < 1 || input.weeks.length > 16 || [...input.weeks].some(week => !Number.isInteger(week) || Math.abs(week) > 52) || new Set(input.weeks).size !== input.weeks.length) throw new BridgeError('BAD_INPUT', 'Укажите аккаунт и от 1 до 16 разных недель в допустимом диапазоне.', 400);
    return input;
  }
  if (action === 'set-lesson-reward') {
    const fields = ['accountId', 'date', 'group', 'lenta', 'schedule', 'stud', 'visit', 'reward', 'previousReward'];
    const id = value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value);
    if (Object.keys(input).some(key => !fields.includes(key)) || !['accountId', 'group', 'schedule', 'stud', 'visit'].every(key => id(input[key])) || typeof input.lenta !== 'string' || !/^\d{1,12}$/.test(input.lenta) || ![1, 2, 3, 4].includes(input.reward) || !(input.previousReward === null || ['1', '2', '3'].includes(input.previousReward))) throw new BridgeError('BAD_INPUT', 'Некорректные топкойны или занятие.', 400);
    validateInput('lesson', { date: input.date, group: input.group, lenta: input.lenta });
    return input;
  }
  if (action === 'set-homework-marks') {
    // Homework grades are whole numbers 1-12: Omni's server rejects anything above 12, so this mirrors
    // its limit and does not choose a scale. (Lesson marks below use a technical 1-100 bound instead;
    // the real scale and the right to write are decided by Omni.) See extension/README.md, «Шкала оценок».
    if (Object.keys(input).some(key => !['accountId', 'mark', 'items', 'response'].includes(key)) || typeof input.accountId !== 'string' || !/^[1-9]\d{0,11}$/.test(input.accountId) || !Number.isInteger(input.mark) || input.mark < 1 || input.mark > 12 || !Array.isArray(input.items) || !input.items.length || input.items.length > 100 || input.items.some(item => !item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['key', 'previousMark', 'submittedAt'].includes(key)) || typeof item.key !== 'string' || !/^(homework|lab_work):[1-9]\d{0,11}:[1-9]\d{0,11}:[1-9]\d{0,11}$/.test(item.key) || !(item.previousMark === null || Number.isFinite(item.previousMark) && item.previousMark > 0 && item.previousMark <= 100) || typeof item.submittedAt !== 'string' || item.submittedAt.length > 100) || new Set(input.items.map(item => item.key)).size !== input.items.length) throw new BridgeError('BAD_INPUT', 'Выберите до 100 работ и целую оценку от 1 до 12.', 400);
    // A response belongs to one identified submission and always accompanies an explicit grade.
    // Bound both strings so even JSON-escaped control characters fit the extension message limit.
    if (Object.hasOwn(input, 'response')) {
      const response = input.response;
      if (input.items.length !== 1 || !response || typeof response !== 'object' || Array.isArray(response) ||
          Object.keys(response).some(key => !['comment', 'previousComment'].includes(key)) ||
          typeof response.comment !== 'string' || response.comment.length > 4000 ||
          !(response.previousComment === null || typeof response.previousComment === 'string' && response.previousComment.length <= 4000)) {
        throw new BridgeError('BAD_INPUT', 'Ответ преподавателя должен относиться к одной работе и содержать до 4000 символов.', 400);
      }
    }
    return input;
  }
  if (action === 'set-lesson-mark') {
    const fields = ['accountId', 'date', 'group', 'lenta', 'schedule', 'stud', 'visit', 'type', 'mark', 'previousMark'];
    if (Object.keys(input).some(key => !fields.includes(key)) || !['accountId', 'group', 'schedule', 'stud', 'visit'].every(key => typeof input[key] === 'string' && /^[1-9]\d{0,11}$/.test(input[key])) || typeof input.lenta !== 'string' || !/^\d{1,12}$/.test(input.lenta) || ![2, 4].includes(input.type) || !Number.isInteger(input.mark) || input.mark < 1 || input.mark > 100 || !(input.previousMark === null || typeof input.previousMark === 'string' && input.previousMark.length <= 16)) throw new BridgeError('BAD_INPUT', 'Некорректная оценка или занятие.', 400);
    validateInput('lesson', { date: input.date, group: input.group, lenta: input.lenta });
    return input;
  }
  if (action === 'lesson-themes' || action === 'set-lesson-theme') {
    const common = ['accountId', 'date', 'group', 'lenta', 'schedule'];
    const fields = action === 'lesson-themes' ? common : [...common, 'theme', 'publicWeekId', 'issueHomework', 'issueLabwork', 'previousTheme'];
    if (Object.keys(input).some(key => !fields.includes(key)) || !['accountId', 'group', 'schedule'].every(key => typeof input[key] === 'string' && /^[1-9]\d{0,11}$/.test(input[key])) || typeof input.lenta !== 'string' || !/^\d{1,12}$/.test(input.lenta)) throw new BridgeError('BAD_INPUT', 'Не указан аккаунт или занятие.', 400);
    validateInput('lesson', { date: input.date, group: input.group, lenta: input.lenta });
    if (action === 'set-lesson-theme' && (typeof input.theme !== 'string' || !input.theme.trim() || input.theme.length > 2000 || typeof input.previousTheme !== 'string' || input.previousTheme.length > 2000 || !(input.publicWeekId === null || typeof input.publicWeekId === 'string' && /^[1-9]\d{0,11}$/.test(input.publicWeekId)) || typeof input.issueHomework !== 'boolean' || typeof input.issueLabwork !== 'boolean')) throw new BridgeError('BAD_INPUT', 'Некорректная тема занятия.', 400);
    return input;
  }
  if (!['connect', 'login', 'status', 'snapshot', 'lesson', 'student', 'group', 'switch-teacher', 'materials-catalog', 'method-package', 'teacher-dossier', 'set-attendance'].includes(action)) throw new BridgeError('NOT_FOUND', 'Неизвестное действие.', 404);
  const allowed = { connect: [], login: ['username', 'password'], status: [], snapshot: ['week'], lesson: ['date', 'group', 'lenta'], student: ['stud'], group: ['group'], 'switch-teacher': ['teacherId', 'accountId'], 'materials-catalog': ['form', 'direction', 'includeMetadata'], 'method-package': ['spec'], 'teacher-dossier': [], 'set-attendance': ['accountId', 'date', 'group', 'lenta', 'schedule', 'changes'] }[action];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new BridgeError('BAD_INPUT', 'Неизвестный параметр.', 400);
  if (action === 'materials-catalog' && input.includeMetadata !== undefined && typeof input.includeMetadata !== 'boolean') throw new BridgeError('BAD_INPUT', 'Некорректный флаг справочников.', 400);
  if (action === 'login' && (typeof input.username !== 'string' || !input.username.trim() || input.username.length > 256 || typeof input.password !== 'string' || !input.password || input.password.length > 1024)) throw new BridgeError('BAD_INPUT', 'Введите логин и пароль допустимой длины.', 400);
  if (input.week !== undefined && (!Number.isInteger(input.week) || Math.abs(input.week) > 52)) throw new BridgeError('BAD_INPUT', 'Неделя вне допустимого диапазона.', 400);
  if (['lesson', 'set-attendance'].includes(action) && (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date)) throw new BridgeError('BAD_INPUT', 'Некорректная дата.', 400);
  if (action === 'set-attendance') {
    const id = value => typeof value === 'string' && /^[1-9]\d{0,11}$/.test(value);
    const status = value => value === 0 || value === 1 || value === 2;
    if (!['accountId', 'group', 'schedule'].every(key => id(input[key])) || typeof input.lenta !== 'string' || !/^\d{1,12}$/.test(input.lenta)) throw new BridgeError('BAD_INPUT', 'Не указан аккаунт или занятие.', 400);
    if (!Array.isArray(input.changes) || !input.changes.length || input.changes.length > 100 || input.changes.some(row => !row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['stud', 'was', 'previousWas', 'visit'].includes(key)) || !id(row.stud) || !status(row.was) || !(row.previousWas === null || status(row.previousWas)) || !(row.visit === null || typeof row.visit === 'string' && /^\d{1,12}$/.test(row.visit))) || new Set(input.changes.map(row => row.stud)).size !== input.changes.length) throw new BridgeError('BAD_INPUT', 'Некорректные отметки посещаемости (до 100 учеников).', 400);
  }
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
  if (action === 'method-package' && input.spec === undefined) throw new BridgeError('BAD_INPUT', 'Не выбран методпакет.', 400);
  return input;
}

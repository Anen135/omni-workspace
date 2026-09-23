import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { loadMaterialsCatalog, loadMethodPackage } from './teaching-materials.mjs';
import { loadFilePreview } from './file-preview.mjs';

const origin = 'https://omni.top-academy.ru';
const readPaths = new Set([
  '/profile/get-profile', '/auth/get-start-info', '/auth/get-teach-list', '/students/get-groups-list',
  '/students/get-students', '/students/get-details-stud', '/students/get-stud-vizit',
  '/schedule/get-schedule', '/presents/get-presents', '/presents/get-materials',
  '/presents/get-homework', '/homework/get-group-spec', '/homework/get-new-homeworks',
  '/bind/get-public-form', '/bind/get-public-direction', '/bind/get-public-spec',
  '/bind/get-materials-type', '/bind/get-materials', '/bind/get-count-week',
]);

export class BridgeError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function validateInput(action, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BridgeError('BAD_INPUT', 'Некорректный запрос.', 400);
  if (!['connect', 'status', 'snapshot', 'lesson', 'student', 'group', 'switch-teacher', 'materials-catalog', 'method-package'].includes(action)) throw new BridgeError('NOT_FOUND', 'Неизвестное действие.', 404);
  const allowed = { connect: [], status: [], snapshot: ['week'], lesson: ['date', 'group', 'lenta'], student: ['stud'], group: ['group'], 'switch-teacher': ['teacherId', 'accountId'], 'materials-catalog': ['form', 'direction'], 'method-package': ['spec'] }[action];
  if (Object.keys(input).some(key => !allowed.includes(key))) throw new BridgeError('BAD_INPUT', 'Неизвестный параметр.', 400);
  if (input.week !== undefined && (!Number.isInteger(input.week) || Math.abs(input.week) > 52)) throw new BridgeError('BAD_INPUT', 'Неделя вне допустимого диапазона.', 400);
  if (action === 'lesson' && (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date)) throw new BridgeError('BAD_INPUT', 'Некорректная дата.', 400);
  for (const key of ['group', 'stud', 'lenta']) {
    if (input[key] !== undefined && !/^\d{1,12}$/.test(String(input[key]))) throw new BridgeError('BAD_INPUT', 'Некорректный идентификатор.', 400);
  }
  if ((action === 'student' && input.stud === undefined) || (action === 'group' && input.group === undefined)) throw new BridgeError('BAD_INPUT', 'Не указан идентификатор.', 400);
  if (action === 'switch-teacher' && !['teacherId', 'accountId'].every(key => typeof input[key] === 'string' && /^[1-9]\d{0,11}$/.test(input[key]))) throw new BridgeError('BAD_INPUT', 'Не указан преподаватель или текущий аккаунт.', 400);
  for (const key of ['form', 'direction', 'spec']) {
    if (input[key] !== undefined && !((typeof input[key] === 'string' || Number.isSafeInteger(input[key])) && /^[1-9]\d{0,11}$/.test(String(input[key])))) throw new BridgeError('BAD_INPUT', 'Некорректный идентификатор методпакета.', 400);
  }
  if ((action === 'method-package' && input.spec === undefined) || (input.direction !== undefined && input.form === undefined)) throw new BridgeError('BAD_INPUT', 'Не выбрана форма обучения или методпакет.', 400);
  return input;
}

export function createBridge() {
  let browser;
  let context;
  let page;
  let connecting;
  let owned = false;

  async function attach() {
    if (page && !page.isClosed()) return page;
    if (connecting) return connecting;
    connecting = (async () => {
      if (owned) await context?.close().catch(() => {});
      else await browser?.close().catch(() => {});
      owned = false;
      context = undefined;
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9224', { timeout: 2000 });
        context = browser.contexts().find(candidate => candidate.pages().some(tab => tab.url().startsWith(origin + '/')));
        if (context) {
          page = context.pages().find(tab => tab.url().startsWith(origin + '/'));
          return page;
        }
        await browser.close();
      } catch { browser = undefined; }
      context = await chromium.launchPersistentContext(resolve('.omni-browser'), {
        channel: 'msedge', headless: false, viewport: null,
      });
      owned = true;
      page = context.pages()[0] || await context.newPage();
      await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
      return page;
    })().finally(() => { connecting = undefined; });
    return connecting;
  }

  async function status() {
    if (!page || page.isClosed()) return { connected: false, state: 'disconnected' };
    try {
      const current = new URL(page.url());
      if (current.origin !== origin) return { connected: false, state: 'disconnected' };
      const state = await page.evaluate(() => ({
        challenge: /DDOS.GUARD/i.test(document.title) || document.body.innerText.includes('Проверка браузера'),
        login: !!document.querySelector('input[type=password]'),
      }));
      if (state.challenge) return { connected: false, state: 'challenge' };
      if (state.login || current.pathname.startsWith('/login')) return { connected: false, state: 'login' };
      return { connected: true, state: 'ready' };
    } catch { return { connected: false, state: 'loading' }; }
  }

  async function request(path, data = {}, switching = false) {
    if (!readPaths.has(path) && !(switching && path === '/auth/change-user')) throw new BridgeError('NOT_ALLOWED', 'Запрос не разрешён.', 400);
    const state = await status();
    if (!state.connected) throw new BridgeError(state.state === 'challenge' ? 'CHALLENGE' : 'AUTH_REQUIRED', 'Откройте окно Omni и завершите вход.', 401);
    let response;
    try {
      response = await page.evaluate(async ({ path, data }) => {
        const result = await fetch(path, {
          method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000),
          headers: {
            'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            'Id-Local-Hash': sessionStorage.getItem('IdLocalHash') || '',
          },
          body: JSON.stringify(data),
        });
        const text = await result.text();
        if (result.status === 403 || result.status === 401 || result.url.includes('/login')) return { auth: true };
        if (result.status === 409) return { conflict: true };
        if (!result.ok) return { status: result.status };
        try { return { data: JSON.parse(text) }; }
        catch { return { invalid: true, challenge: /DDOS.GUARD|Проверка браузера/i.test(text) }; }
      }, { path, data });
    } catch { throw new BridgeError('CONNECTION_LOST', 'Запрос прерван. Проверьте окно Omni и повторите загрузку.'); }
    if (response.auth) throw new BridgeError('AUTH_REQUIRED', 'Сессия Omni истекла. Войдите снова.', 401);
    if (response.conflict) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт в Omni изменился. Обновите подключение.', 409);
    if (response.challenge) throw new BridgeError('CHALLENGE', 'Пройдите проверку браузера в окне Omni.', 401);
    if (response.invalid || response.status) throw new BridgeError('UPSTREAM_ERROR', `Omni не вернул данные${response.status ? ` (HTTP ${response.status})` : ''}. Повторите позже.`);
    return response.data;
  }

  const read = (path, data) => request(path, data);

  async function identity() {
    const profile = await read('/profile/get-profile');
    const info = profile?.teach_info;
    if (!info?.id_teach || typeof info.fio_teach !== 'string') throw new BridgeError('SCHEMA_CHANGED', 'Не удалось распознать профиль Omni.');
    return { id: String(info.id_teach), name: info.fio_teach };
  }

  async function section(path, params) {
    try { return { data: await read(path, params), error: null }; }
    catch (error) {
      if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(error.code)) throw error;
      return { data: null, error: error.message };
    }
  }

  const bridge = {
    async dispatch(action, input = {}) {
      validateInput(action, input);
      if (action === 'connect') {
        const tab = await attach();
        if ((await status()).connected || !tab.url().startsWith(origin + '/')) await tab.goto(origin, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await tab.bringToFront();
        return status();
      }
      if (action === 'status') return status();
      const account = await identity();
      if (action === 'switch-teacher') {
        if (account.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные перед переключением.', 409);
        const teachers = await read('/auth/get-teach-list');
        if (!Array.isArray(teachers)) throw new BridgeError('SCHEMA_CHANGED', 'Не удалось распознать список преподавателей.');
        if (!teachers.some(teacher => String(teacher.id_teach) === input.teacherId)) throw new BridgeError('TEACHER_NOT_ALLOWED', 'Этот преподаватель отсутствует в доступном списке Omni.', 403);
        if (account.id === input.teacherId) return { account };
        await page.evaluate(() => {
          const root = globalThis.angular?.element(document.body).injector()?.get('$rootScope');
          if (typeof root?.clearLocalStorage !== 'function') throw new Error('Omni session not ready');
          root.clearLocalStorage();
        });
        const result = await request('/auth/change-user', { id_user: input.teacherId }, true);
        if (result === false || result?.success === false || result?.error) throw new BridgeError('SWITCH_FAILED', 'Omni отклонил переключение преподавателя.');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        const switchedAccount = await identity();
        if (switchedAccount.id !== input.teacherId) throw new BridgeError('ACCOUNT_CHANGED', 'Не удалось подтвердить выбранного преподавателя. Обновите подключение.', 409);
        return { account: switchedAccount };
      }
      let result;
      if (action === 'snapshot') {
        const info = await read('/auth/get-start-info');
        result = {
          account: { ...account, branch: info?.branch?.name || '', timezone: info?.branch?.timezone_name || 'Europe/Moscow' },
          teachers: await section('/auth/get-teach-list', {}),
          schedule: await section('/schedule/get-schedule', { week: input.week || 0 }),
          presents: await section('/presents/get-presents', {}),
          groups: await section('/students/get-groups-list', {}),
          homework: await section('/homework/get-group-spec', { type: 0 }),
          newHomework: await section('/homework/get-new-homeworks', {}),
          counts: { homework: Number(info?.homeworks?.hm) || 0, practice: Number(info?.homeworks?.lw) || 0 },
          fetchedAt: new Date().toISOString(),
        };
      } else if (action === 'lesson') {
        const presents = await read('/presents/get-presents', input);
        const group = presents?.cur_group;
        const lenta = presents?.cur_lenta;
        const date = presents?.cur_date;
        result = {
          presents,
          materials: group && date && lenta !== undefined ? await section('/presents/get-materials', { group, lenta, date_vizit: date }) : { data: null, error: null },
          homework: group && date && lenta !== undefined ? await section('/presents/get-homework', { group, lenta, date, ospr: 0 }) : { data: null, error: null },
        };
      } else if (action === 'materials-catalog') result = await loadMaterialsCatalog(section, input);
      else if (action === 'method-package') result = await loadMethodPackage(section, input);
      else if (action === 'group') result = { students: await read('/students/get-students', { group: input.group }) };
      else result = { details: await section('/students/get-details-stud', { stud: input.stud }), attendance: await section('/students/get-stud-vizit', { stud: input.stud }) };
      const finalAccount = await identity();
      if (account.id !== finalAccount.id) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился во время загрузки. Обновите подключение.', 409);
      return { ...result, account: result.account || account };
    },
    async close() {
      if (owned) await context?.close();
      else await browser?.close();
      page = undefined;
    },
  };
  let pending = Promise.resolve();
  return {
    dispatch(action, input) {
      const operation = pending.then(() => bridge.dispatch(action, input));
      pending = operation.catch(() => {});
      return operation;
    },
    close() { return pending.then(() => bridge.close()); },
  };
}

export function createMiddleware(bridge) {
  return async (request, response, next) => {
    if (!request.url?.startsWith('/api/omni/')) return next();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { response.statusCode = status; response.end(JSON.stringify(data)); };
    const host = request.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) ||
      request.headers['sec-fetch-site'] === 'cross-site' || request.headers['x-omni-client'] !== 'workspace') {
      return send(403, { error: { code: 'FORBIDDEN', message: 'Подключение доступно только из локального интерфейса.' } });
    }
    if (request.method !== 'POST') return send(405, { error: { code: 'METHOD', message: 'Ожидается POST.' } });
    try {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (Buffer.byteLength(body) > 4096) throw new BridgeError('BAD_INPUT', 'Слишком большой запрос.', 413);
      }
      let input;
      try { input = JSON.parse(body || '{}'); } catch { throw new BridgeError('BAD_INPUT', 'Некорректный JSON.', 400); }
      const action = request.url.slice('/api/omni/'.length);
      if (action === 'file-preview') {
        let file;
        try { file = await loadFilePreview(input?.url); }
        catch (error) { throw new BridgeError('FILE_PREVIEW', error.name === 'TimeoutError' ? 'Хранилище не ответило вовремя. Повторите загрузку.' : error.message); }
        response.setHeader('Content-Type', file.type);
        response.setHeader('Content-Length', file.data.length);
        response.statusCode = 200;
        return response.end(file.data);
      }
      const data = await bridge.dispatch(action, input);
      send(200, data);
    } catch (error) {
      send(error instanceof BridgeError ? error.status : 500, { error: {
        code: error instanceof BridgeError ? error.code : 'BRIDGE_ERROR',
        message: error instanceof BridgeError ? error.message : 'Не удалось подключиться к Edge. Закройте прежнее окно подключения и повторите.',
      } });
    }
  };
}

export function omniBridge() {
  const bridge = createBridge();
  const install = server => {
    server.middlewares.use(createMiddleware(bridge));
    server.httpServer?.once('close', () => { void bridge.close(); });
  };
  return { name: 'omni-local-bridge', configureServer: install, configurePreviewServer: install };
}

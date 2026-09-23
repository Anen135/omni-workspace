import { validateInput, BridgeError } from '../server/bridge-protocol.mjs';
import { loadMaterialsCatalog, loadMethodPackage } from '../server/teaching-materials.mjs';

const origin = 'https://omni.top-academy.ru';
export async function dispatch(action, input = {}) {
  validateInput(action, input);
  if (location.origin !== origin) throw new BridgeError('AUTH_REQUIRED', 'Откройте официальный вход.');
  const state = /DDOS.GUARD/i.test(document.title) ? 'challenge' : location.pathname.startsWith('/login') || document.querySelector('input[type=password]') ? 'login' : 'ready';
  if (action === 'status' || action === 'connect') return { connected: state === 'ready', state };
  if (action === 'login' || action === 'switch-teacher') throw new BridgeError('NOT_SUPPORTED', 'В прототипе выполните это действие в официальном окне Omni.');
  if (state !== 'ready') throw new BridgeError('AUTH_REQUIRED', 'Завершите вход в официальном окне Omni.');
  async function read(path, data = {}) {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(20000), headers: {
      'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || '',
      'Id-Local-Hash': sessionStorage.getItem('IdLocalHash') || '',
    }, body: JSON.stringify(data) });
    if ([401, 403].includes(response.status) || response.url.includes('/login')) throw new BridgeError('AUTH_REQUIRED', 'Сессия истекла. Войдите снова.');
    if (response.status === 409) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные.');
    if (!response.ok) throw new BridgeError('UPSTREAM_ERROR', 'Omni не вернул данные.');
    try { return await response.json(); } catch { throw new BridgeError('UPSTREAM_ERROR', 'Не удалось прочитать ответ Omni.'); }
  }
  async function identity() {
    const p = (await read('/profile/get-profile'))?.teach_info;
    if (!p?.id_teach || typeof p.fio_teach !== 'string') throw new BridgeError('SCHEMA_CHANGED', 'Не удалось распознать профиль Omni.');
    return { id: String(p.id_teach), name: p.fio_teach };
  }
  async function section(path, params) {
    try { return { data: await read(path, params), error: null }; }
    catch (error) { if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error; return { data: null, error: error.message }; }
  }
  const account = await identity();
  let result;
  if (action === 'snapshot') {
    const info = await read('/auth/get-start-info');
    result = {
      account: { ...account, branch: info?.branch?.name || '', timezone: info?.branch?.timezone_name || 'Europe/Moscow' },
      teachers: await section('/auth/get-teach-list', {}), schedule: await section('/schedule/get-schedule', { week: input.week || 0 }),
      presents: await section('/presents/get-presents', {}), groups: await section('/students/get-groups-list', {}),
      homework: await section('/homework/get-group-spec', { type: 0 }), newHomework: await section('/homework/get-new-homeworks', {}),
      counts: { homework: Number(info?.homeworks?.hm) || 0, practice: Number(info?.homeworks?.lw) || 0 }, fetchedAt: new Date().toISOString(),
    };
  } else if (action === 'lesson') {
    const presents = await read('/presents/get-presents', input);
    const { cur_group: group, cur_lenta: lenta, cur_date: date } = presents || {};
    const empty = { data: null, error: null };
    result = { presents,
      materials: group && date && lenta !== undefined ? await section('/presents/get-materials', { group, lenta, date_vizit: date }) : empty,
      homework: group && date && lenta !== undefined ? await section('/presents/get-homework', { group, lenta, date, ospr: 0 }) : empty,
    };
  } else if (action === 'materials-catalog') result = await loadMaterialsCatalog(section, input);
  else if (action === 'method-package') result = await loadMethodPackage(section, input);
  else if (action === 'group') result = { students: await read('/students/get-students', { group: input.group }) };
  else if (action === 'student') result = { details: await section('/students/get-details-stud', { stud: input.stud }), attendance: await section('/students/get-stud-vizit', { stud: input.stud }) };
  else throw new BridgeError('NOT_SUPPORTED', 'Действие не поддерживается.');
  if ((await identity()).id !== account.id) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился во время загрузки.');
  return { ...result, account: result.account || account };
}

import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';
import { attendanceStudents, attendanceLessonInfo, attendanceUnavailable, attendanceStatus, attendanceVisit } from '../src/attendance.ts';

// Fixed official endpoint/payload, verified against presentsCtrl / presents_factory.
// Never accept visit metadata or an arbitrary endpoint from the UI.
export async function saveAttendance(input, { request, identity }) {
  validateInput('set-attendance', input);
  const assertAccount = async () => {
    const account = await identity();
    if (account.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите данные перед отметкой посещаемости.');
    return account;
  };
  const params = { date: input.date, group: input.group, lenta: input.lenta };
  const assertLesson = presents => {
    if (!presents || String(presents.cur_schedule) !== input.schedule || String(presents.cur_group) !== input.group || String(presents.cur_lenta) !== input.lenta || presents.cur_date !== input.date) throw new BridgeError('LESSON_CHANGED', 'Omni вернул другое занятие. Загрузите урок заново.');
  };
  await assertAccount();
  const before = await request('/presents/get-presents', params);
  assertLesson(before);
  const unavailable = attendanceUnavailable(before);
  if (unavailable) throw new BridgeError('ATTENDANCE_UNAVAILABLE', unavailable);
  const students = attendanceStudents(before.students);
  const info = attendanceLessonInfo(before);
  const visits = {};
  for (const [index, change] of input.changes.entries()) {
    const matches = students.filter(row => String(row.id_stud) === change.stud);
    if (matches.length !== 1) throw new BridgeError('LESSON_CHANGED', 'Список учеников изменился. Загрузите урок заново.');
    const student = matches[0];
    if (attendanceStatus(student.was) !== change.previousWas || attendanceVisit(student.id_vizit) !== change.visit) throw new BridgeError('ATTENDANCE_CONFLICT', 'Посещаемость уже изменена в Omni. Загрузите урок и проверьте отметки.');
    visits[String(index)] = {
      was: change.was, vizit: student.id_vizit, id_stud: student.id_stud,
      id_schedule: before.cur_schedule, primary_teach: info.primary_teach, theme: info.theme,
    };
  }
  await assertAccount();
  let response;
  try {
    // Exactly one write attempt. A timeout may mean that the server has saved it.
    response = await request('/presents/set-was', { visits, schedule: before.cur_schedule });
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'ATTENDANCE_REJECTED'].includes(error.code)) throw error;
    throw new BridgeError('ATTENDANCE_UNCONFIRMED', 'Не удалось подтвердить сохранение. Не отправляйте отметки повторно: загрузите урок и проверьте посещаемость.');
  }
  if (response === false || response?.error || response?.success === false) {
    const reason = typeof response?.error === 'string' ? response.error : typeof response?.message === 'string' ? response.message : '';
    throw new BridgeError('ATTENDANCE_REJECTED', `Omni отклонил отметки.${reason ? ' ' + reason.replace(/<[^>]*>/g, '').slice(0, 250) : ''} Загрузите урок перед повторной попыткой.`);
  }
  try {
    const presents = await request('/presents/get-presents', params);
    assertLesson(presents);
    const account = await assertAccount();
    const after = attendanceStudents(presents.students);
    if (input.changes.some(change => {
      const matches = after.filter(row => String(row.id_stud) === change.stud);
      return matches.length !== 1 || attendanceStatus(matches[0].was) !== change.was;
    })) throw new Error('Readback mismatch');
    return { account, presents };
  } catch (error) {
    if (['AUTH_REQUIRED', 'ACCOUNT_CHANGED'].includes(error.code)) throw error;
    throw new BridgeError('ATTENDANCE_UNCONFIRMED', 'Запрос отправлен, но Omni не подтвердил все отметки. Загрузите урок и проверьте посещаемость.');
  }
}

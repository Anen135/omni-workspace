import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';
import { homeworkItems } from '../src/features/homework/homework.ts';

// Official homeWorkCtrl.saveStudHw/updateMarks and homeworks-factory.js:
// POST /homework/save-homework with { HomeworkForm: freshSubmission }, including
// marks: { key: { id: id_domzad, mark, ospr, stud: id_stud } }.
// Preserve server-owned answer, comment and attachment fields; never accept them from the UI.
//
// Batch semantics (user-facing description: extension/README.md, «Оценки за домашние работы»):
// - Not atomic. Omni has no transaction, so submissions are written one at a time, in order.
// - Preflight: the whole selection is checked against a fresh list before the first write; if any
//   submission is already graded or changed, nothing is written (HOMEWORK_CHANGED).
// - Cost: 2 requests up front, then 6 per submission (3 profile reads, 2 list reads, 1 write), run
//   sequentially without pauses: about 600 requests for the maximum of 100 submissions.
// - Stops at the first failure and never retries a write. The result lists confirmedKeys; the state
//   of the submission being written when the error happened is unknown (the write may have gone through).
// - ACCOUNT_CHANGED / AUTH_REQUIRED are thrown only if nothing was confirmed yet; otherwise they come
//   back in `error` together with confirmedKeys.
export async function saveHomeworkMarks(input, { request, identity }) {
  validateInput('set-homework-marks', input);
  const checkAccount = async () => {
    const account = await identity();
    if (account.id !== input.accountId) throw new BridgeError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите список работ.');
    return account;
  };
  const read = async () => homeworkItems(await request('/homework/get-new-homeworks', {}));
  const find = (rows, expected) => {
    const matches = rows.filter(row => row.key === expected.key);
    const row = matches[0];
    if (matches.length !== 1 || !row.canGrade || row.mark !== expected.previousMark || row.submittedAt !== expected.submittedAt) {
      throw new BridgeError('HOMEWORK_CHANGED', 'Работа уже проверена или изменилась. Обновите список перед сохранением.');
    }
    return row;
  };
  let account = await checkAccount();
  const initial = await read();
  // Reject stale batches before making any write.
  for (const expected of input.items) find(initial, expected);
  const confirmedKeys = [];
  for (const expected of input.items) {
    try {
      await checkAccount();
      const row = find(await read(), expected);
      await checkAccount();
      const form = { ...row.source, id_domzad: row.source.id_domzad || row.source.id_domzad_teach,
        id_stud: row.source.id_stud || row.source.stud_stud, mark: input.mark };
      form.marks = { 0: { id: form.id_domzad, mark: input.mark, ospr: form.ospr, stud: form.id_stud } };
      const response = await request('/homework/save-homework', { HomeworkForm: form });
      if (!response?.success || response.error) throw new BridgeError('HOMEWORK_REJECTED',
        `Omni отклонил оценку. ${typeof response?.message === 'string' ? response.message.replace(/<[^>]*>/g, '').slice(0, 250) : 'Обновите работы и проверьте право оценивания.'}`);
      // Graded work normally leaves the pending list. Its absence alone is not
      // success: require the official save acknowledgement above as well.
      const after = await read();
      account = await checkAccount();
      const remaining = after.filter(item => item.key === expected.key);
      if (remaining.length > 1 || remaining.length === 1 && remaining[0].mark !== input.mark) {
        throw new BridgeError('HOMEWORK_UNCONFIRMED', 'Omni не подтвердил оценку. Обновите список перед повторной отправкой.');
      }
      confirmedKeys.push(expected.key);
    } catch (error) {
      // Session loss before anything was confirmed: throw, so the transport layer can
      // run its usual login / account-change handling. Once some grades are confirmed,
      // return them together with the error instead; throwing here would discard the
      // list of already saved submissions and the UI could not tell what was written.
      if (['ACCOUNT_CHANGED', 'AUTH_REQUIRED'].includes(error.code) && !confirmedKeys.length) throw error;
      return { account, confirmedKeys, error: {
        code: error.code || 'HOMEWORK_UNCONFIRMED',
        message: error.code ? error.message : 'Результат сохранения не подтверждён. Обновите список работ перед повторной отправкой.',
      } };
    }
  }
  return { account, confirmedKeys };
}

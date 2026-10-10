import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeworkItems } from '../src/homework.ts';
import { saveHomeworkMarks } from '../extension/homework.mjs';
import { validateInput } from '../server/bridge-protocol.mjs';

const row = (id = 1, student = 10) => ({ id, id_domzad_teach: 100 + id, stud_stud: student,
  fio_stud: 'Вымышленный студент', name_tgroups: 'Тест', theme: `Работа ${id}`,
  ospr: 0, mark: null, stud_date: '2026-10-10 10:00:00', answer_text: 'Ответ',
  comment: 'Существующий комментарий', comment_attach: 'https://fs.top-academy.ru/api/v1/files/fixture' });
function fixture(entries = [row(), row(2), row(3, 20)], mode = 'success') {
  let data = { homework: structuredClone(entries), lab_work: [], requests: [] };
  const writes = [];
  const request = async (path, input) => {
    if (path === '/homework/get-new-homeworks') return structuredClone(data);
    assert.equal(path, '/homework/save-homework');
    writes.push(structuredClone(input));
    if (mode === 'lost') throw new Error('Connection lost');
    if (mode === 'reject' || mode === 'partial' && writes.length === 2) return { success: false, message: 'Период закрыт' };
    const form = input.HomeworkForm;
    const expected = data.homework.find(item => item.id === form.id);
    assert.ok(expected);
    assert.equal(form.comment, expected.comment);
    assert.equal(form.comment_attach, expected.comment_attach);
    assert.equal(form.answer_text, expected.answer_text);
    assert.deepEqual(form.marks, { 0: { id: expected.id_domzad_teach, stud: expected.stud_stud, ospr: 0, mark: form.mark } });
    if (mode !== 'mismatch') data.homework = data.homework.filter(item => item.id !== form.id);
    return { success: 'Оценка сохранена' };
  };
  const input = { accountId: '1', mark: 12, items: homeworkItems(data).slice(0, 2).map(item => ({ key: item.key, previousMark: item.mark, submittedAt: item.submittedAt })) };
  return { input, writes, request, identity: async () => ({ id: '1' }), data: () => data };
}
test('homework unwraps official nested lists, preserves identity and refuses ambiguous/retake rows', () => {
  const result = homeworkItems({ homework: [row()], lab_work: [{ ...row(2), ospr: 1 }], requests: [row(3)] });
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(item => item.canGrade), [true, true, false]);
  assert.equal(result[0].studentId, '10');
  assert.equal(result[0].submittedAt, row().stud_date);
  assert.ok(homeworkItems({ homework: [row(), row()] }).every(item => !item.canGrade));
  assert.equal(homeworkItems([{ fio_stud: 'Без ID' }])[0].canGrade, false);
});
test('homework protocol accepts only explicit bounded submission selection', () => {
  const { input } = fixture();
  assert.doesNotThrow(() => validateInput('set-homework-marks', input));
  for (const bad of [{ ...input, mark: 13 }, { ...input, mark: 0 }, { ...input, url: '/anything' }, { ...input, items: [] }, { ...input, items: [...input.items, input.items[0]] }, { ...input, items: [{ ...input.items[0], submittedAt: null }] }]) {
    assert.throws(() => validateInput('set-homework-marks', bad));
  }
});
test('homework grade 12 affects only selected submissions, preserving answers/comments', async () => {
  const f = fixture();
  const result = await saveHomeworkMarks(f.input, f);
  assert.deepEqual(result.confirmedKeys, f.input.items.map(item => item.key));
  assert.equal(f.writes.length, 2);
  assert.deepEqual(f.data().homework.map(item => item.stud_stud), [20]);
});
test('homework preflight rejects whole stale selection without writing', async () => {
  const f = fixture();
  f.input.items[1].previousMark = 9;
  await assert.rejects(saveHomeworkMarks(f.input, f), { code: 'HOMEWORK_CHANGED' });
  assert.equal(f.writes.length, 0);
});
test('homework rejects switched account before writes', async () => {
  const f = fixture();
  await assert.rejects(saveHomeworkMarks(f.input, { ...f, identity: async () => ({ id: '2' }) }), { code: 'ACCOUNT_CHANGED' });
  assert.equal(f.writes.length, 0);
});
test('homework partial failure reports confirmed work and stops without retrying', async () => {
  const f = fixture([row(), row(2), row(3)], 'partial');
  const result = await saveHomeworkMarks(f.input, f);
  assert.deepEqual(result.confirmedKeys, [f.input.items[0].key]);
  assert.equal(result.error.code, 'HOMEWORK_REJECTED');
  assert.equal(f.writes.length, 2);
});
for (const mode of ['lost', 'reject', 'mismatch']) {
  test(`homework ${mode} never reports unconfirmed grades or retries writes`, async () => {
    const f = fixture(undefined, mode);
    const result = await saveHomeworkMarks(f.input, f);
    assert.deepEqual(result.confirmedKeys, []);
    assert.ok(result.error);
    assert.equal(f.writes.length, 1);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeworkGroupName, homeworkItems } from '../src/features/homework/homework.ts';
import { saveHomeworkMarks } from '../extension/homework.mjs';
import { BridgeError, validateInput } from '../server/bridge-protocol.mjs';

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
    assert.equal(form.comment_attach, expected.comment_attach);
    assert.equal(form.answer_text, expected.answer_text);
    assert.deepEqual(form.marks, { 0: { id: expected.id_domzad_teach, stud: expected.stud_stud, ospr: 0, mark: form.mark } });
    if (mode === 'response-retain' || mode === 'response-mismatch') {
      expected.mark = form.mark;
      if (mode === 'response-retain') expected.comment = form.comment;
    } else if (mode !== 'mismatch') data.homework = data.homework.filter(item => item.id !== form.id);
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
test('homework reads official group labels from flat and all nested collections without changing identity', () => {
  const submission = { ...row(), name_tgroups: undefined, group: '  Группа из Omni  ' };
  for (const data of [[submission], { homework: [submission] }, { lab_work: { first: submission } }, { requests: [submission] }]) {
    const [item] = homeworkItems(data);
    assert.equal(item.groupName, 'Группа из Omni');
    assert.equal(item.studentId, '10');
    assert.equal(item.source, submission);
    assert.equal(item.source.group, '  Группа из Omni  ', 'display normalization does not modify the source');
    const kind = !Array.isArray(data) && 'lab_work' in data ? 'lab_work' : !Array.isArray(data) && 'requests' in data ? 'requests' : 'homework';
    assert.equal(item.key, `${kind}:1:101:10`);
    assert.equal(item.canGrade, kind !== 'requests');
  }
});
test('homework group labels retain alias priority and do not guess missing or structured groups', () => {
  assert.equal(homeworkGroupName({ name_tgroups: ' Группа A ', group_name: 'Группа B', group: 'Группа C' }), 'Группа A');
  assert.equal(homeworkGroupName({ name_tgroups: '  ', group_name: ' Группа B ', group: 'Группа C' }), 'Группа B');
  assert.equal(homeworkGroupName({ name_tgroups: '', group_name: '  ', group: ' Группа C ' }), 'Группа C');
  for (const group of [undefined, null, '', '  ', 123, false, {}, { name: 'Не угадывать' }, ['Группа A', 'Группа B']]) {
    const [item] = homeworkItems([{ ...row(), name_tgroups: undefined, group }]);
    assert.equal(item.groupName, '');
    assert.equal(item.key, 'homework:1:101:10');
    assert.equal(item.canGrade, true, 'missing display metadata does not change grading eligibility');
  }
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
  assert.ok(f.writes.every(write => write.HomeworkForm.comment === row().comment));
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

test('homework account switch mid-batch still reports grades confirmed before it', async () => {
  const f = fixture();
  // identity() calls: 1 preflight, then 3 per fully confirmed submission; the 5th is the second submission's first check.
  let calls = 0;
  const identity = async () => ({ id: ++calls >= 5 ? '2' : '1' });
  const result = await saveHomeworkMarks(f.input, { ...f, identity });
  assert.deepEqual(result.confirmedKeys, [f.input.items[0].key]);
  assert.equal(result.error.code, 'ACCOUNT_CHANGED');
  assert.equal(result.account.id, '1', 'confirmed grades belong to the original account');
  assert.equal(f.writes.length, 1, 'no further writes after the account changed');
});
test('homework session loss mid-batch still reports grades confirmed before it', async () => {
  const f = fixture();
  const request = async (path, input) => {
    if (path === '/homework/save-homework' && f.writes.length === 1) throw new BridgeError('AUTH_REQUIRED', 'Сессия истекла. Войдите снова.');
    return f.request(path, input);
  };
  const result = await saveHomeworkMarks(f.input, { ...f, request });
  assert.deepEqual(result.confirmedKeys, [f.input.items[0].key]);
  assert.equal(result.error.code, 'AUTH_REQUIRED');
  assert.equal(f.writes.length, 1);
});
test('homework session loss before any confirmation is thrown for transport-level handling', async () => {
  const f = fixture();
  const request = async path => { if (path === '/homework/save-homework') throw new BridgeError('AUTH_REQUIRED', 'Сессия истекла. Войдите снова.'); return f.request(path, {}); };
  await assert.rejects(saveHomeworkMarks(f.input, { ...f, request }), { code: 'AUTH_REQUIRED' });
});

function responseInput(f, comment = 'Teacher response\nSecond line') {
  return { ...f.input, items: [f.input.items[0]], response: { comment, previousComment: row().comment } };
}

test('homework response protocol requires one bounded explicit response and baseline with valid grade', () => {
  const f = fixture();
  const input = responseInput(f);
  for (const comment of ['', 'Response', '\u0000'.repeat(4000)]) {
    assert.doesNotThrow(() => validateInput('set-homework-marks', { ...input, response: { comment, previousComment: null } }));
  }
  const invalid = [undefined, null, [], {}, { comment: 'text' }, { previousComment: null },
    { comment: 123, previousComment: null }, { comment: 'text', previousComment: 123 },
    { comment: 'x'.repeat(4001), previousComment: null }, { comment: '', previousComment: 'x'.repeat(4001) },
    { comment: 'text', previousComment: null, answer_text: 'injected' }];
  for (const response of invalid) assert.throws(() => validateInput('set-homework-marks', { ...input, response }), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('set-homework-marks', { ...input, items: f.input.items }), { code: 'BAD_INPUT' });
  assert.throws(() => validateInput('set-homework-marks', { ...input, mark: null }), { code: 'BAD_INPUT' });
});

for (const mode of ['response-retain']) {
  test(`homework response explicit save preserves answer/attachment fields with ${mode} readback`, async () => {
    const f = fixture(undefined, mode);
    const input = responseInput(f);
    const result = await saveHomeworkMarks(input, f);
    assert.deepEqual(result.confirmedKeys, [input.items[0].key]);
    assert.equal(f.writes.length, 1);
    assert.equal(f.writes[0].HomeworkForm.comment, input.response.comment);
    assert.equal(f.writes[0].HomeworkForm.answer_text, row().answer_text);
    assert.equal(f.writes[0].HomeworkForm.comment_attach, row().comment_attach);
  });
}

test('homework response can explicitly clear an existing response or start an absent response', async () => {
  for (const baseline of [undefined, null, '']) {
    const f = fixture([{ ...row(), comment: baseline }], 'response-retain');
    const input = responseInput(f, 'New response');
    input.response.previousComment = baseline ?? null;
    assert.deepEqual((await saveHomeworkMarks(input, f)).confirmedKeys, [input.items[0].key]);
    assert.equal(f.writes[0].HomeworkForm.comment, 'New response');
  }
  const f = fixture(undefined, 'response-retain');
  const input = responseInput(f, '');
  assert.deepEqual((await saveHomeworkMarks(input, f)).confirmedKeys, [input.items[0].key]);
  assert.equal(f.writes[0].HomeworkForm.comment, '');
});

test('homework response stale baseline rejects preflight without writes', async () => {
  const f = fixture();
  const input = responseInput(f);
  f.data().homework[0].comment = 'Changed by another teacher';
  await assert.rejects(saveHomeworkMarks(input, f), { code: 'HOMEWORK_CHANGED' });
  assert.equal(f.writes.length, 0);
});

test('homework response checks fresh baseline again immediately before writing', async () => {
  const f = fixture();
  const input = responseInput(f);
  let reads = 0;
  const request = async (path, body) => {
    if (path === '/homework/get-new-homeworks' && ++reads === 2) f.data().homework[0].comment = 'Concurrent response';
    return f.request(path, body);
  };
  const result = await saveHomeworkMarks(input, { ...f, request });
  assert.deepEqual(result.confirmedKeys, []);
  assert.equal(result.error.code, 'HOMEWORK_CHANGED');
  assert.equal(f.writes.length, 0);
});

test('homework grade-only save preserves a newer fresh response', async () => {
  const f = fixture();
  f.data().homework[0].comment = 'Newer server response';
  await saveHomeworkMarks(f.input, f);
  assert.equal(f.writes[0].HomeworkForm.comment, 'Newer server response');
});

for (const mode of ['lost', 'reject', 'response-mismatch', 'success']) {
  test(`homework response ${mode} never confirms or retries a write`, async () => {
    const f = fixture(undefined, mode);
    const result = await saveHomeworkMarks(responseInput(f), f);
    assert.deepEqual(result.confirmedKeys, []);
    assert.ok(result.error);
    if (mode === 'success') {
      assert.equal(result.error.code, 'HOMEWORK_UNCONFIRMED');
      assert.match(result.error.message, /ответа не подтверждено/);
    }
    assert.equal(f.writes.length, 1);
  });
}

test('homework response retains account and submission identity protections', async () => {
  const f = fixture();
  const input = responseInput(f);
  await assert.rejects(saveHomeworkMarks(input, { ...f, identity: async () => ({ id: '2' }) }), { code: 'ACCOUNT_CHANGED' });
  f.data().homework.push(structuredClone(f.data().homework[0]));
  await assert.rejects(saveHomeworkMarks(input, f), { code: 'HOMEWORK_CHANGED' });
  assert.equal(f.writes.length, 0);
});

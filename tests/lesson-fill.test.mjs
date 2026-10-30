import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/features/lesson/lesson-fill.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { createLessonFill, lessonFillRows, stageLessonFill } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const empty = () => ({ attendance: {}, marks: {}, rewards: {} });
const rows = () => [1, 2, 3].map(id => ({ id_stud: String(id), id_vizit: 10 + id, fio_stud: `Student ${id}`, mark2: 8 + id, mark4: '' }));
const averages = new Map([['1', '8'], ['2', '10'], ['3', '11']]);
const request = (extra = {}) => ({ target: 'mark4', method: 'mean', value: '', source: 'average', rounding: 'ceil', empty: 'block', overwrite: false, targetIds: ['1', '2', '3'], sourceIds: ['1', '2', '3'], ...extra });
const snapshot = (students = rows(), avg = averages) => ({ students, averages: avg, context: 'account/branch/lesson' });
function apply(snap, req, draft = empty(), base = snap.students) {
  const preview = createLessonFill(snap, req);
  return stageLessonFill(base, draft, snap.averages, snap.context, req, preview.fingerprint);
}

test('aggregate mean 29/3 ceil yields 10 for every recipient; individual preserves 8,10,11', () => {
  const req = request(), snap = snapshot();
  const proposal = createLessonFill(snap, req);
  assert.equal(proposal.aggregate, 29 / 3);
  assert.deepEqual(proposal.rows.map(row => row.after), [10, 10, 10]);
  assert.deepEqual(Object.values(apply(snap, req).marks).map(row => row.mark), [10, 10, 10]);
  assert.deepEqual(createLessonFill(snap, request({ method: 'field' })).rows.map(row => row.after), [8, 10, 11]);
  assert.deepEqual(snap.students, rows());
});

test('sources and recipients are independent; order does not affect result or fingerprint', () => {
  const req = request({ targetIds: ['3'], sourceIds: ['1', '2'] });
  const original = createLessonFill(snapshot(), req);
  assert.deepEqual(original.rows.map(row => row.after), [9]);
  const reordered = createLessonFill(snapshot([...rows()].reverse()), { ...req, sourceIds: ['2', '1'] });
  assert.deepEqual(reordered, original);
  assert.deepEqual(Object.keys(apply(snapshot(), req).marks), ['3:4']);
});

test('comma/dot decimals, source field and rounding rules use effective values without feedback', () => {
  const snap = snapshot(rows(), new Map([['1', '8,5'], ['2', '10.5'], ['3', '11.2']]));
  for (const [rounding, expected] of [['ceil', [9, 11, 12]], ['floor', [8, 10, 11]], ['nearest', [9, 11, 11]]]) {
    assert.deepEqual(createLessonFill(snap, request({ method: 'field', rounding })).rows.map(row => row.after), expected);
  }
  const base = rows().map((row, index) => ({ ...row, mark4: [8, 10, 11][index] }));
  const draft = apply(snapshot(base), request({ source: 'mark4', overwrite: true }));
  assert.deepEqual(Object.values(draft.marks).map(row => row.mark), [10, 10]); // unchanged 10 creates no draft
  assert.equal(draft.marks['1:4'].previousMark, '8');
  assert.equal(draft.marks['3:4'].previousMark, '11');
});

test('preserve filled values by default, explicit overwrite retains first baselines and visit IDs', () => {
  const base = rows(); base[0].mark4 = '9';
  const snap = snapshot(base);
  const req = request({ method: 'constant', value: '12' });
  const proposal = createLessonFill(snap, req);
  assert.match(proposal.rows[0].reason, /сохранена/);
  assert.deepEqual(Object.keys(apply(snap, req).marks), ['2:4', '3:4']);
  const first = apply(snap, request({ ...req, overwrite: true }));
  const nextSnap = snapshot(lessonFillRows(base, first));
  const next = apply(nextSnap, request({ ...req, value: '11', overwrite: true }), first, base);
  assert.deepEqual(next.marks['1:4'], { stud: '1', type: 4, mark: 11, previousMark: '9', visit: '11' });
  assert.equal(first.marks['1:4'].mark, 12);
});

test('empty sources block by default, explicit skipping reports each exclusion; invalid sources never skip', () => {
  const snap = snapshot(rows(), new Map([['1', '8'], ['2', ''], ['3', '11']]));
  assert.match(createLessonFill(snap, request()).blockedReason, /пустые/);
  const skipped = createLessonFill(snap, request({ empty: 'skip' }));
  assert.equal(skipped.aggregate, 9.5);
  assert.match(skipped.sources[1].reason, /исключён/);
  const individual = createLessonFill(snap, request({ method: 'field', empty: 'skip' }));
  assert.equal(individual.rows[1].apply, false);
  for (const raw of ['bad', '0', '101', 'Infinity', 'NaN', '1e300', false]) {
    const bad = snapshot(rows(), new Map([['1', '8'], ['2', raw], ['3', '11']]));
    assert.ok(createLessonFill(bad, request({ empty: 'skip' })).blockedReason);
  }
  assert.ok(createLessonFill(snapshot(rows(), new Map([['1', ''], ['2', ''], ['3', '']])), request({ empty: 'skip' })).blockedReason);
});

test('stale sources, draft values, visits, context or parameters reject atomically; no blind retries', () => {
  const snap = snapshot(), req = request(), draft = empty();
  const preview = createLessonFill(snap, req);
  const changed = rows(); changed[1].mark2 = 12;
  for (const [base, avg, context, input] of [
    [changed, averages, snap.context, req], [rows(), new Map([...averages, ['2', '9']]), snap.context, req],
    [rows(), averages, 'other-account/lesson', req], [rows(), averages, snap.context, { ...req, rounding: 'floor' }],
    [rows().map(row => ({ ...row, id_vizit: 999 })), averages, snap.context, req],
  ]) assert.throws(() => stageLessonFill(base, draft, avg, context, input, preview.fingerprint), /изменились/);
  assert.throws(() => stageLessonFill(rows(), { ...draft, needsReload: true }, averages, snap.context, req, preview.fingerprint), /загрузите/);
  assert.deepEqual(draft, empty());
});

test('duplicate/missing IDs, invalid policies, absent source area and unavailable averages never stage partial marks', () => {
  for (const req of [request({ targetIds: [] }), request({ sourceIds: [] }), request({ targetIds: ['1', '1'] }), request({ sourceIds: ['9'] }),
    request({ target: 'attendance' }), request({ rounding: 'javascript' }), request({ method: 'constant', value: '1.2' }), request({ method: 'constant', value: '101' })]) {
    assert.ok(createLessonFill(snapshot(), req).blockedReason);
    assert.throws(() => apply(snapshot(), req));
  }
  assert.ok(createLessonFill(snapshot([...rows(), rows()[0]]), request()).blockedReason);
  assert.ok(createLessonFill({ ...snapshot(), sourceUnavailable: 'Loading averages' }, request()).blockedReason);
});

test('fallback averages preserve raw invalid shapes instead of converting them into skippable blanks', () => {
  const req = request({ empty: 'skip' });
  for (const gpa of [false, NaN, Infinity, {}, 'bad', 0]) {
    const students = rows().map(row => ({ ...row, gpa: row.id_stud === '2' ? gpa : '8,5' }));
    const snap = { students, context: 'account/lesson' };
    const proposal = createLessonFill(snap, req);
    assert.ok(proposal.blockedReason, String(gpa));
    assert.throws(() => stageLessonFill(students, empty(), undefined, snap.context, req, proposal.fingerprint));
  }
  const snap = { students: rows().map(row => ({ ...row, gpa: '8,5' })), context: 'account/lesson' };
  assert.deepEqual(createLessonFill(snap, req).rows.map(row => row.after), [9, 9, 9]);
});

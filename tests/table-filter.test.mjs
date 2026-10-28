import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [resolve('src/components/data/table-filter.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { filterTableRows, getTableFilterOptions } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const filters = [
  { id: 'name', label: 'Имя', kind: 'text', value: row => row.profile?.name },
  { id: 'group', label: 'Группа', kind: 'select', value: row => row.group },
  { id: 'score', label: 'Баллы', kind: 'number', value: row => row.score },
  { id: 'date', label: 'Дата', kind: 'date', value: row => row.date },
  { id: 'active', label: 'Активен', kind: 'boolean', value: row => row.active },
  { id: 'present', label: 'Заполнено', kind: 'presence', value: row => row.field },
];
const apply = (rows, state) => filterTableRows(rows, filters, state);

test('combines declared filters with AND and nested accessors, preserving source order and objects', () => {
  const rows = Object.freeze([
    Object.freeze({ id: 1, profile: { name: 'АлЁна' }, group: 'a', score: 0, active: false }),
    Object.freeze({ id: 2, profile: { name: 'Алёна' }, group: 'b', score: 1, active: true }),
    Object.freeze({ id: 3, profile: { name: 'АЛЁНА' }, group: 'a', score: 2, active: false }),
    Object.freeze({ id: 4, profile: { name: 'Иван' }, group: 'a', score: 1, active: false }),
    Object.freeze({ id: 5, group: 'a', score: 1, active: false }),
  ]);
  const state = Object.freeze({ name: '  алЁ  ', group: 'a', score: { from: '0', to: '2' }, active: 'false' });
  const result = apply(rows, state);
  assert.deepEqual(result.map(row => row.id), [1, 3]);
  assert.equal(result[0], rows[0]);
  assert.notEqual(result, rows);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3, 4, 5]);
  assert.equal(state.name, '  алЁ  ');
});

test('empty inputs and unknown or inherited state IDs do not filter rows', () => {
  const rows = [{}, { score: 0 }, { profile: { name: 'Иван' } }];
  assert.deepEqual(apply(rows, { name: '  ', group: '', score: { from: ' ', to: '' }, date: { from: '', to: '' }, active: '', present: '', unknown: 'missing' }), rows);
  assert.deepEqual(apply(rows, Object.create({ name: 'absent' })), rows);
  assert.notEqual(apply(rows, {}), rows);
});

test('number ranges include zero and endpoints, reject missing values and malformed or inverted bounds', () => {
  const rows = [undefined, null, NaN, Infinity, -1, 0, 0.5, 1, 2].map(score => ({ score }));
  assert.deepEqual(apply(rows, { score: { from: '0', to: '1' } }).map(row => row.score), [0, 0.5, 1]);
  assert.deepEqual(apply(rows, { score: { from: '', to: '0' } }).map(row => row.score), [-1, 0]);
  assert.deepEqual(apply(rows, { score: { from: '1', to: '' } }).map(row => row.score), [1, 2]);
  for (const range of [{ from: '1', to: '0' }, { from: 'bad', to: '' }, { from: '', to: 'Infinity' }, { from: '0x10', to: '' }]) {
    assert.deepEqual(apply(rows, { score: range }), []);
  }
});

test('boolean false and select values zero/false remain distinct from missing values', () => {
  const rows = [undefined, null, false, true, 0, '0', 'false', ' false '].map(value => ({ group: value, active: value }));
  assert.deepEqual(apply(rows, { active: 'false' }).map(row => row.active), [false]);
  assert.deepEqual(apply(rows, { group: '0' }).map(row => row.group), [0, '0']);
  assert.deepEqual(apply(rows, { group: 'false' }).map(row => row.group), [false, 'false']);
  assert.deepEqual(apply(rows, { active: 'not-boolean' }), []);
});

test('presence includes zero and false while treating invalid values as empty', () => {
  const missing = [undefined, null, '', NaN, Infinity, new Date('invalid')];
  const filled = [0, false, ' ', new Date('2026-01-01')];
  const rows = [...missing, ...filled].map(field => ({ field }));
  assert.deepEqual(apply(rows, { present: 'empty' }).map(row => row.field), missing);
  assert.deepEqual(apply(rows, { present: 'filled' }).map(row => row.field), filled);
  assert.deepEqual(apply(rows, { present: 'invalid' }), []);
});

test('calendar date ranges include boundary days and accept only valid ISO dates/timestamps', () => {
  const values = [
    '2024-02-28', '2024-02-29', '2024-03-01',
    '2024-02-29T23:59:59+03:00', new Date('2024-03-01T00:30:00+03:00'),
    '2026-02-30', '29.02.2024', '2024-02-30T00:00:00Z', '2024-02-29 suffix',
    '2024-02-29T99:00:00Z', new Date('invalid'), null, undefined,
  ];
  const rows = values.map(date => ({ date }));
  assert.deepEqual(apply(rows, { date: { from: '2024-02-29', to: '2024-02-29' } }).map(row => row.date), [values[1], values[3], values[4]]);
  assert.deepEqual(apply(rows, { date: { from: '', to: '2024-02-29' } }).map(row => row.date), [values[0], values[1], values[3], values[4]]);
  assert.deepEqual(apply(rows, { date: { from: '2024-03-01', to: '' } }).map(row => row.date), [values[2]]);
  for (const range of [{ from: '2026-02-30', to: '' }, { from: '2024-03-01', to: '2024-02-29' }, { from: '', to: '29.02.2024' }]) {
    assert.deepEqual(apply(rows, { date: range }), []);
  }
});

test('select options use original rows, deduplicate serialized values, and preserve explicit labels', () => {
  const rows = [0, false, '0', 'b', 'a', null, undefined, '', NaN].map(group => ({ group }));
  const filter = filters.find(filter => filter.id === 'group');
  assert.deepEqual(getTableFilterOptions(rows, filter), [
    { value: '0', label: '0' }, { value: 'false', label: 'false' }, { value: 'b', label: 'b' }, { value: 'a', label: 'a' },
  ]);
  apply(rows, { group: 'a' });
  assert.equal(getTableFilterOptions(rows, filter).length, 4);
  const options = Object.freeze([{ value: 'internal-id', label: 'Читаемая подпись' }]);
  assert.equal(getTableFilterOptions(rows, { ...filter, options }), options);
  assert.deepEqual(getTableFilterOptions(rows, { ...filter, options: [] }), []);
});

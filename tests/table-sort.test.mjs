import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const { outputFiles } = await build({
  entryPoints: [resolve('src/components/data/table-sort.ts')],
  bundle: true, platform: 'node', format: 'esm', write: false,
});
const { sortTableRows, sortTableRowsByCriteria } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const columns = [{ id: 'value', kind: 'data', value: row => row.value }];
const sorted = (rows, direction = 'ascending', cols = columns) => sortTableRows(rows, cols, { columnId: 'value', direction });

test('sorts numbers numerically in both directions without mutating input and preserves ties', () => {
  const rows = Object.freeze([{ id: 'a', value: 10 }, { id: 'b', value: 2 }, { id: 'c', value: 2 }]);
  assert.deepEqual(sorted(rows).map(row => row.id), ['b', 'c', 'a']);
  assert.deepEqual(sorted(rows, 'descending').map(row => row.id), ['a', 'b', 'c']);
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c']);
  assert.notEqual(sorted(rows), rows);
});

test('uses natural Russian text ordering without interpreting numeric strings as numbers', () => {
  const rows = ['Урок 10', 'Урок 2', 'Урок 1'].map(value => ({ value }));
  assert.deepEqual(sorted(rows).map(row => row.value), ['Урок 1', 'Урок 2', 'Урок 10']);
  assert.deepEqual(sorted(rows, 'descending').map(row => row.value), ['Урок 10', 'Урок 2', 'Урок 1']);
  assert.deepEqual(sorted([{ value: '1' }, { value: 2 }]).map(row => row.value), [2, '1']);
});

test('keeps missing and invalid values last in stable order in either direction', () => {
  const missing = [null, undefined, '', NaN, Infinity, -Infinity, new Date('invalid')].map((value, index) => ({ id: `empty-${index}`, value }));
  const rows = [missing[0], { id: 'one', value: 1 }, ...missing.slice(1), { id: 'two', value: 2 }];
  for (const direction of ['ascending', 'descending']) {
    assert.deepEqual(sorted(rows, direction).map(row => row.id), [
      ...(direction === 'ascending' ? ['one', 'two'] : ['two', 'one']), ...missing.map(row => row.id),
    ]);
  }
});

test('compares dates, booleans and mixed types with explicit type ranking', () => {
  const early = new Date('2020-01-01');
  const late = new Date('2021-01-01');
  const values = ['text', true, late, 5, false, early];
  const rows = values.map(value => ({ value }));
  assert.deepEqual(sorted(rows).map(row => row.value), [5, early, late, false, true, 'text']);
  assert.deepEqual(sorted(rows, 'descending').map(row => row.value), ['text', true, false, late, early, 5]);
  const ties = [{ id: 1, value: early }, { id: 2, value: new Date(early) }];
  assert.deepEqual(sorted(ties, 'descending').map(row => row.id), [1, 2]);
});

test('ignores absent, unknown, legacy and action-column sort state', () => {
  const rows = [{ value: 2 }, { value: 1 }];
  assert.deepEqual(sortTableRows(rows, columns, null), rows);
  assert.deepEqual(sortTableRows(rows, columns, { columnId: 'unknown', direction: 'ascending' }), rows);
  for (const column of [{ id: 'value' }, { id: 'value', kind: 'action' }]) {
    assert.deepEqual(sorted(rows, 'ascending', [column]), rows);
  }
});

test('uses an explicit comparator for valid values while keeping empty values last', () => {
  const rows = [{ value: 'long' }, { value: '' }, { value: 'x' }, { value: 'same' }];
  const byLength = [{ ...columns[0], compare: (a, b) => a.length - b.length }];
  assert.deepEqual(sorted(rows, 'ascending', byLength).map(row => row.value), ['x', 'long', 'same', '']);
  assert.deepEqual(sorted(rows, 'descending', byLength).map(row => row.value), ['long', 'same', 'x', '']);
});

test('chains criteria in priority order, continuing through equal and empty values', () => {
  const rows = Object.freeze([
    { id: 'a', value: null, name: 'Борис' }, { id: 'b', value: 10, name: 'Яна' },
    { id: 'c', value: 10, name: 'Анна' }, { id: 'd', value: 2, name: 'Вера' },
    { id: 'e', value: undefined, name: 'Анна' }, { id: 'f', value: 10, name: 'Анна' },
  ]);
  const cols = [...columns, { id: 'name', kind: 'data', value: row => row.name }];
  const number = { columnId: 'value', direction: 'descending' };
  const name = { columnId: 'name', direction: 'ascending' };
  assert.deepEqual(sortTableRowsByCriteria(rows, cols, [number, name]).map(row => row.id), ['c', 'f', 'b', 'd', 'e', 'a']);
  assert.deepEqual(sortTableRowsByCriteria(rows, cols, [name, number]).map(row => row.id), ['c', 'f', 'e', 'a', 'd', 'b']);
  assert.deepEqual(sortTableRowsByCriteria(rows, cols, []), rows);
  assert.deepEqual(sortTableRowsByCriteria(rows, cols, [{ columnId: 'unknown' }, number, name]), sortTableRowsByCriteria(rows, cols, [number, name]));
  assert.deepEqual(rows.map(row => row.id), ['a', 'b', 'c', 'd', 'e', 'f']);
});

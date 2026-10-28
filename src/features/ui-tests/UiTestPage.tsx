import { useState } from 'react';
import { DataTable, type TableFilter, type TableColumn } from '../../components/data/DataTable';

type TestRow = { id: string; name: string; group: string; grade: number | null; available: boolean; date: string };
const testRows: TestRow[] = Array.from({ length: 12 }, (_, index) => ({
  id: `ui-${index + 1}`, name: `Тестовый ученик ${String(index + 1).padStart(2, '0')}`,
  group: index % 2 ? 'UI-102' : 'UI-101', grade: index === 2 ? null : index % 13, available: index !== 3, date: `2026-10-${String(index + 1).padStart(2, '0')}`,
}));
const filters: TableFilter<TestRow>[] = [
  { id: 'search', label: 'Поиск тестовых строк', kind: 'text', value: row => `${row.name} ${row.group}` },
  { id: 'group', label: 'Группа', kind: 'select', value: row => row.group },
  { id: 'grade', label: 'Оценка', kind: 'number', value: row => row.grade },
  { id: 'available', label: 'Доступен для выбора', kind: 'boolean', value: row => row.available },
  { id: 'date', label: 'Дата', kind: 'date', value: row => row.date },
  { id: 'grade-presence', label: 'Заполненность оценки', kind: 'presence', value: row => row.grade },
];

export function UiTestPage({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [locked, setLocked] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const columns: TableColumn<TestRow>[] = [
    { id: 'name', kind: 'data', heading: 'Ученик', value: row => row.name, cell: row => row.name },
    { id: 'group', kind: 'data', heading: 'Группа', value: row => row.group, cell: row => row.group },
    { id: 'grade', kind: 'data', heading: 'Оценка', value: row => row.grade, cell: row => row.grade ?? '—' },
    { id: 'state', kind: 'data', heading: 'Состояние', value: row => row.available, cell: row => row.available ? 'Доступен' : 'Недоступен для выбора' },
    { id: 'date', kind: 'data', heading: 'Дата', value: row => new Date(row.date + 'T00:00:00Z'), cell: row => row.date },
    { id: 'details', kind: 'action', control: 'button', heading: 'Действия', cell: row => <button type="button" className="text-button" disabled={locked}
      aria-label={`Подробнее: ${row.name}`} aria-expanded={expanded === row.id} onClick={() => setExpanded(value => value === row.id ? null : row.id)}>Подробнее</button> },
  ];
  return <section className="panel" aria-label="Тесты UI элементов" style={{ minWidth: 0 }}>
    <div className="panel-heading" style={{ flexWrap: 'wrap' }}><div><h2>Универсальная таблица</h2>
      <p>Вымышленные данные. Действия на этой странице не отправляются в Omni.</p></div>
      <button className="button secondary" type="button" onClick={onBack}>Вернуться в справку</button></div>
    <div className="table-bulk-editor"><div className="table-bulk-controls">
      <label><span><input type="checkbox" checked={empty} onChange={event => { setEmpty(event.target.checked); }}/> Пустая таблица</span></label>
      <label><span><input type="checkbox" checked={locked} onChange={event => setLocked(event.target.checked)}/> Заблокировать действия</span></label>
      <button className="button secondary" type="button" disabled={locked || !selected.size} onClick={() => setSelected(new Set())}>Снять выбор</button>
    </div><p className="table-bulk-help" role="status">Выбрано: {selected.size}</p></div>
      <DataTable rows={empty ? [] : testRows} columns={columns} getRowKey={row => row.id} label="Универсальная таблица: тестовые данные"
        defaultSort={{ columnId: 'name', direction: 'ascending' }} sortingDisabled={locked}
        filters={filters} pagination={{ pageSize: 6, pageSizeOptions: [6, 12] }} emptyMessage="Тестовых строк нет. Измените фильтры или выключите пустое состояние."
        selection={{ selectedKeys: selected, eligibleKeys: new Set(testRows.filter(row => row.available).map(row => row.id)), getKey: row => row.id, locked,
          rowLabel: row => `Выбрать: ${row.name}`, allLabel: 'Выбрать все доступные тестовые строки',
          onToggle: (row, checked) => setSelected(current => { const next = new Set(current); if (checked) next.add(row.id); else next.delete(row.id); return next; }),
          onToggleAll: (checked, filteredRows) => setSelected(current => { const next = new Set(current); for (const row of filteredRows) { if (checked) next.add(row.id); else next.delete(row.id); } return next; }),
        }}
        renderAfterRow={row => expanded === row.id ? <tr><td colSpan={columns.length + 1} style={{ padding: 16 }}>Тестовая карточка {row.id}. Здесь проверяется раскрытие строки таблицы.</td></tr> : null}/>
  </section>;
}

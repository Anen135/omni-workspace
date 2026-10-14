import { useState } from 'react';

export type DossierTable = {
  id: string;
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
};

const PAGE_SIZE = 20;
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function DossierDetails({ tables }: { tables: DossierTable[] }) {
  if (!tables.length) return <p className="dossier-empty">Omni пока не вернул подробные данные.</p>;
  return <div className="dossier-details">{tables.map(table => <TableBlock key={table.id} table={table}/>)}</div>;
}

function TableBlock({ table }: { table: DossierTable }) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;
  return <section className="dossier-block" aria-label={table.title}>
    <div className="dossier-block-heading"><h4>{table.title}</h4><span>{table.rows.length} записей</span></div>
    {!table.rows.length || !table.columns.length ? <p className="dossier-empty">В этом разделе пока нет данных.</p> : <>
      <div className="dossier-table-scroll" tabIndex={0} role="region" aria-label={table.title}>
        <table className="dossier-table"><thead><tr>{table.columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{table.rows.slice(start, start + PAGE_SIZE).map((row, index) => <tr key={start + index}>{table.columns.map(column => {
            const value = row[column.key];
            return <td key={column.key}>{value === null || value === undefined || value === '' ? '—' : typeof value === 'number' ? numberFormat.format(value) : value}</td>;
          })}</tr>)}</tbody>
        </table>
      </div>
      {pages > 1 && <div className="dossier-pagination" aria-label={`Записи: ${table.title}`}>
        <span>{start + 1}–{Math.min(start + PAGE_SIZE, table.rows.length)} из {table.rows.length}</span>
        <button className="button secondary small" type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Предыдущие записи: ${table.title}`}>Назад</button>
        <button className="button secondary small" type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label={`Следующие записи: ${table.title}`}>Далее</button>
      </div>}
    </>}
  </section>;
}

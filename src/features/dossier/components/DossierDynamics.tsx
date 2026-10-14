import { useState } from 'react';

export type DossierSeries = {
  id: string;
  title: string;
  unit?: string;
  points: { label: string; value: number }[];
};

const PAGE_SIZE = 12;
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export function DossierDynamics({ series }: { series: DossierSeries[] }) {
  const [selected, setSelected] = useState('');
  if (!series.length) return <p className="dossier-empty">Omni пока не вернул данные о динамике.</p>;
  const current = series.find(item => item.id === selected) || series[0];
  return <><label className="dossier-series-filter">Показатель <select aria-label="Показатель динамики" value={current.id} onChange={event => setSelected(event.target.value)}>{series.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><div className="dossier-dynamics-grid"><SeriesBlock key={current.id} series={current}/></div></>;
}

function SeriesBlock({ series }: { series: DossierSeries }) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(series.points.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * PAGE_SIZE;
  const maximum = series.points.reduce((max, point) => Math.max(max, Math.abs(point.value)), 0);
  return <section className="dossier-block" aria-label={series.title}>
    <div className="dossier-block-heading"><h4>{series.title}</h4>{series.unit && <span>{series.unit}</span>}</div>
    {!series.points.length ? <p className="dossier-empty">Нет данных за этот период.</p> : <>
      <dl className="dossier-series-list">{series.points.slice(start, start + PAGE_SIZE).map((point, index) => <div className="dossier-series-row" key={start + index}>
        <dt className="dossier-series-label">{point.label}</dt>
        <dd className="dossier-series-value">{numberFormat.format(point.value)}{series.unit ? ` ${series.unit}` : ''}</dd>
        <div className="dossier-series-track" aria-hidden="true"><span className={`dossier-series-bar-fill${point.value < 0 ? ' is-negative' : ''}`} style={{ width: `${maximum ? Math.abs(point.value) / maximum * 100 : 0}%` }}/></div>
      </div>)}</dl>
      {pages > 1 && <div className="dossier-pagination" aria-label={`Периоды: ${series.title}`}>
        <span>{start + 1}–{Math.min(start + PAGE_SIZE, series.points.length)} из {series.points.length}</span>
        <button className="button secondary small" type="button" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={`Предыдущие периоды: ${series.title}`}>Назад</button>
        <button className="button secondary small" type="button" disabled={page === pages - 1} onClick={() => setPage(page + 1)} aria-label={`Следующие периоды: ${series.title}`}>Далее</button>
      </div>}
    </>}
  </section>;
}

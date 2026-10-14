export type DossierMetric = {
  id: string;
  label: string;
  value: string | number | null;
  unit?: string;
  note?: string;
};

export function DossierOverview({ metrics }: { metrics: DossierMetric[] }) {
  const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  return <dl className="dossier-overview">
    {metrics.map(metric => <div className="dossier-summary-card" key={metric.id}>
      <dt>{metric.label}</dt>
      <dd>{metric.value === null || metric.value === '' ? '—' : typeof metric.value === 'number' ? format.format(metric.value) : metric.value}
        {metric.value !== null && metric.value !== '' && metric.unit && <span>{metric.unit}</span>}
      </dd>
      {metric.note && <dd className="dossier-metric-note">{metric.note}</dd>}
    </div>)}
  </dl>;
}

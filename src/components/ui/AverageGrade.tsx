import './average-grade.css';
export function AverageGrade({ value, loading = false, error = '' }: { value?: string; loading?: boolean; error?: string }) {
  if (value !== undefined && value.trim() !== '') return <span>{value}</span>;
  return loading ? <span className="average-loading" role="status" aria-label="Загрузка среднего балла"><span className="average-skeleton" aria-hidden="true"/></span>
    : <span className="average-missing" title={error || 'Omni не вернул средний балл.'}>—</span>;
}

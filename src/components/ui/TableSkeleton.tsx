export function TableSkeleton() {
  return <div role="status" aria-label="Загрузка учеников" className="workspace-skeleton">{Array.from({ length: 5 }, (_, index) => <div key={index}/>)}</div>;
}

import { BookOpen } from 'lucide-react';

export function EmptyState({ title, text }: { title: string; text?: string }) {
  return <div className="empty"><BookOpen size={30}/><h3>{title}</h3>{text && <p>{text}</p>}</div>;
}

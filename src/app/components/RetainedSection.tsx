import { useEffect, useState, type ReactNode } from 'react';

/** Retain visited read-only pages for this workspace/session, without loading unseen pages. */
export function RetainedSection({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  if (!active && !visited) return null;
  return <div hidden={!active} style={{ display: active ? 'contents' : 'none' }}>{children}</div>;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, X, Zap } from 'lucide-react';

export function DismissiblePopover({ label, children, drawer = false }: { label: string; children: ReactNode | ((close: () => void) => ReactNode); drawer?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (root.current && !event.composedPath().includes(root.current)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div ref={root} className={drawer ? 'workspace-quick' : 'workspace-popover'} onMouseEnter={() => { if (drawer) setOpen(true); }} onMouseLeave={() => {
    const tree = root.current?.getRootNode() as Document | ShadowRoot | undefined;
    if (drawer && !root.current?.contains(tree?.activeElement || null)) setOpen(false);
  }}>
    <button ref={trigger} className={drawer ? 'workspace-handle' : 'button secondary'} aria-label={label} aria-expanded={open} onClick={() => setOpen(drawer || !open)}>{drawer ? <Zap size={17}/> : <CalendarDays size={17}/>}</button>
    {open && <div className={drawer ? 'workspace-drawer' : 'workspace-popover-body'} role="region" aria-label={label}><div className="workspace-popover-heading"><strong>{label}</strong><button className="icon" aria-label={`Закрыть: ${label}`} onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={16}/></button></div>{typeof children === 'function' ? children(() => { setOpen(false); trigger.current?.focus(); }) : children}</div>}
  </div>;
}

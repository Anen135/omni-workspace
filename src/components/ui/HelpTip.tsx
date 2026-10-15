import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';

export function HelpTip({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => clearTimeout(timer.current);
  const close = () => { cancelClose(); pinned.current = false; setOpen(false); };
  const show = () => { cancelClose(); setOpen(true); };
  const leave = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      const tree = trigger.current?.getRootNode() as Document | ShadowRoot | undefined;
      if (!pinned.current && tree?.activeElement !== trigger.current) setOpen(false);
    }, 150);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const width = bubble.current?.offsetWidth || 288;
      const height = bubble.current?.offsetHeight || 100;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
        top: rect.bottom + height + 16 <= window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - height - 8),
      });
    };
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(trigger.current!) && !path.includes(bubble.current!)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    update();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', close);
    document.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', close);
      document.removeEventListener('scroll', close, true);
    };
  }, [open]);
  const tree = trigger.current?.getRootNode();
  const portal = trigger.current?.closest('dialog[open]') || (tree instanceof ShadowRoot ? tree : document.body);
  return <>
    <button ref={trigger} type="button" className="help-tip-trigger" aria-label={label}
      aria-expanded={open} aria-describedby={open ? id : undefined}
      onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={() => { pinned.current = false; leave(); }}
      onClick={() => { pinned.current = !pinned.current; if (pinned.current) show(); else close(); }}>{icon ?? <CircleHelp size={16}/>}</button>
    {open && createPortal(<div ref={bubble} id={id} role="tooltip" className="help-tip-bubble" style={position}
      onMouseEnter={cancelClose} onMouseLeave={leave}>{children}</div>, portal)}
  </>;
}

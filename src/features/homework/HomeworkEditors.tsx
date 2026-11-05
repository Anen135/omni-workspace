import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { HOMEWORK_RESPONSE_LIMIT, type HomeworkResponseDraft, type HomeworkReviewItem } from './homework';
type ResponseEdit = { comment: string; mark: string };
export function HomeworkPreview({ name, open, onOpen, onClose, children }: {
  name: string; open: boolean; onOpen: () => void; onClose: () => void; children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const keyboardFocus = useRef(false);
  const pointerType = useRef('');
  const skipFocus = useRef(false);
  const dismissedHover = useRef(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => clearTimeout(timer.current);
  const show = () => { cancelClose(); onOpen(); };
  const leave = () => {
    cancelClose();
    timer.current = setTimeout(() => {
      if (!keyboardFocus.current && !trigger.current?.matches(':hover') && !panel.current?.matches(':hover')) onClose();
    }, 180);
  };
  const blur = (target: EventTarget | null) => {
    if (target instanceof Node && (trigger.current?.contains(target) || panel.current?.contains(target))) return;
    keyboardFocus.current = false;
    leave();
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const box = panel.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      setPosition({
        left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
        top: anchor.bottom + box.height + 16 <= window.innerHeight ? anchor.bottom + 8 : Math.max(8, anchor.top - box.height - 8),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const path = event.composedPath();
      if (!path.includes(trigger.current!) && !path.includes(panel.current!)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Removing a card over its trigger can generate pointerenter without any mouse movement.
      dismissedHover.current = true;
      const tree = trigger.current?.getRootNode() as Document | ShadowRoot | undefined;
      if (panel.current?.contains(tree?.activeElement || null)) {
        skipFocus.current = true;
        trigger.current?.focus();
        skipFocus.current = false;
      }
      cancelClose(); onClose();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open, onClose]);
  const tree = trigger.current?.getRootNode();
  return <>
    <button ref={trigger} type="button" className="homework-preview-button" aria-label={'Превью работы: ' + name}
      aria-expanded={open} aria-controls={open ? id : undefined}
      onPointerDown={event => { pointerType.current = event.pointerType; }}
      onPointerEnter={event => { if (event.pointerType !== 'touch' && !dismissedHover.current) show(); }}
      onPointerLeave={() => { dismissedHover.current = false; leave(); }}
      onFocus={event => {
        if (!skipFocus.current && event.currentTarget.matches(':focus-visible')) { keyboardFocus.current = true; show(); }
      }} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => {
        if (open && event.key === 'Tab' && !event.shiftKey) {
          const first = panel.current?.querySelector<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
          if (first) { event.preventDefault(); first.focus(); }
        }
      }}
      onClick={event => {
        if (pointerType.current === 'touch' || event.detail === 0) { cancelClose(); if (open) onClose(); else show(); }
        else show();
      }}><Eye size={17} aria-hidden="true"/></button>
    {open && createPortal(<div ref={panel} id={id} className="homework-details homework-quick-preview" role="region"
      aria-label={'Превью работы: ' + name} style={position}
      onPointerEnter={cancelClose} onPointerLeave={leave}
      onFocus={() => { keyboardFocus.current = true; cancelClose(); }} onBlur={event => blur(event.relatedTarget)}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const controls = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), [tabindex="0"]');
        if (event.shiftKey && event.target === controls?.[0]) { event.preventDefault(); trigger.current?.focus(); }
        else if (!event.shiftKey && event.target === controls?.[controls.length - 1]) { trigger.current?.focus(); onClose(); }
      }}>{children}</div>, tree instanceof ShadowRoot ? tree : document.body)}
  </>;
}

export function ResponseEditor({ item, name, disabled, readOnly, draft, onChange, onSave }: {
  item: HomeworkReviewItem; name: string; disabled: boolean; readOnly: boolean; draft: ResponseEdit;
  onChange: (draft: ResponseEdit) => void; onSave: (mark: number, response: HomeworkResponseDraft) => Promise<void>;
}) {
  const previousComment = item.source.comment ?? null;
  const baselineValid = previousComment === null || typeof previousComment === 'string' && previousComment.length <= HOMEWORK_RESPONSE_LIMIT;
  const mark = Number(draft.mark);
  const valid = draft.mark.trim() !== '' && Number.isInteger(mark) && mark >= 1 && mark <= 12 && draft.comment.length <= HOMEWORK_RESPONSE_LIMIT;
  const changed = draft.comment !== (previousComment ?? '') || mark !== item.mark;
  const locked = disabled || readOnly || !baselineValid;
  const helpId = useId();
  return <form className="homework-response-editor" onSubmit={event => {
    event.preventDefault();
    if (!locked && valid && changed) void onSave(mark, { comment: draft.comment, previousComment: previousComment as string | null });
  }}>
    <label>Ответ преподавателя<textarea aria-label={'Ответ преподавателя: ' + name} aria-describedby={helpId} rows={4} maxLength={HOMEWORK_RESPONSE_LIMIT} value={draft.comment} disabled={disabled} readOnly={readOnly || !baselineValid} onChange={event => onChange({ ...draft, comment: event.target.value })}/></label>
    <p id={helpId} className="homework-muted">{baselineValid ? 'Ответ сохраняется вместе с оценкой от 1 до 12. До 4000 символов.' : 'Редактирование этого ответа недоступно. Проверьте работу в Omni.'}</p>
    <div className="homework-response-actions"><label>Оценка<input type="number" aria-label={'Оценка к ответу преподавателя: ' + name} min={1} max={12} step={1} value={draft.mark} disabled={locked} onChange={event => onChange({ ...draft, mark: event.target.value })}/></label>
      <button type="submit" className="button primary" disabled={locked || !valid || !changed}>Сохранить ответ и оценку</button></div>
  </form>;
}

export function GradeEditor({ item, name, disabled, onSave }: {
  item: HomeworkReviewItem; name: string; disabled: boolean; onSave: (mark: number) => Promise<void>;
}) {
  const [value, setValue] = useState(item.mark === null ? '' : String(item.mark));
  useEffect(() => { setValue(item.mark === null ? '' : String(item.mark)); }, [item.key, item.mark]);
  const mark = Number(value);
  const valid = value.trim() !== '' && Number.isInteger(mark) && mark >= 1 && mark <= 12;
  const changed = valid && mark !== item.mark;
  return <form className="homework-grade-editor" onSubmit={event => { event.preventDefault(); if (!disabled && changed) void onSave(mark); }}>
    <input type="number" aria-label={'Оценка: ' + name} title="Введите оценку от 1 до 12 и нажмите Enter" placeholder="—" min={1} max={12} step={1} value={value} disabled={disabled} onChange={event => setValue(event.target.value)}/>
    {value !== '' && mark !== item.mark && <button type="submit" aria-label={'Сохранить оценку: ' + name} disabled={disabled || !changed}>Сохранить</button>}
  </form>;
}


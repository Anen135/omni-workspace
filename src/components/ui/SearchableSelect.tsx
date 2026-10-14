import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, X } from 'lucide-react';
import './searchable-select.css';

type Option = { value: string; label: string };

export function SearchableSelect({ label, value, options, onChange, placeholder, disabled = false, className = '' }: {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find(option => option.value === value)?.label ?? '';
  const search = query.trim().toLocaleLowerCase('ru-RU');
  const filtered = options.filter(option => option.label.toLocaleLowerCase('ru-RU').includes(search));
  const choices = search ? filtered : [{ value: '', label: placeholder }, ...filtered];

  function close() { setOpen(false); setQuery(''); }
  function choose(next: string) {
    close();
    if (next !== value) onChange(next);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (root.current && !event.composedPath().includes(root.current)) close();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => { if (disabled) close(); }, [disabled]);
  useEffect(() => { setActive(0); }, [query, options]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); setQuery(''); setActive(0); }
      else setActive(previous => Math.max(0, Math.min(choices.length - 1, previous + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (choices[active]) choose(choices[active].value);
    }
  }

  return <div className={`searchable-select ${className}`} ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <label htmlFor={id}>{label}</label>
    <div className="searchable-select-control">
      <input id={id} ref={input} role="combobox" aria-autocomplete="list" aria-expanded={open}
        aria-controls={`${id}-options`} aria-activedescendant={open && choices[active] ? `${id}-option-${active}` : undefined}
        autoComplete="off" value={open ? query : selected} placeholder={open ? 'Введите текст для поиска' : placeholder} disabled={disabled}
        onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
        onClick={() => { if (!open) { setOpen(true); setQuery(''); setActive(0); } }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); }} onKeyDown={keyDown}/>
      {value && <button type="button" className="searchable-select-clear" aria-label={`Очистить: ${label}`} disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => choose('')}><X size={14}/></button>}
      <button type="button" className="searchable-select-toggle" aria-label={`${open ? 'Закрыть' : 'Открыть'} список: ${label}`} aria-expanded={open} aria-controls={`${id}-options`} disabled={disabled}
        onMouseDown={event => event.preventDefault()} onClick={() => { if (open) close(); else { input.current?.focus(); setOpen(true); setQuery(''); setActive(0); } }}><ChevronDown size={15}/></button>
    </div>
    {open && !disabled && <div className="searchable-select-options" id={`${id}-options`} role="listbox" aria-label={label}>
      {choices.map((option, index) => <button type="button" role="option" tabIndex={-1} key={option.value} id={`${id}-option-${index}`}
        aria-selected={option.value === value} data-option-index={index} className={index === active ? 'is-active' : ''}
        onMouseDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(option.value)}>{option.label}</button>)}
      {!filtered.length && <p className="searchable-select-empty">Ничего не найдено</p>}
    </div>}
  </div>;
}

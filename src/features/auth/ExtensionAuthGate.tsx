import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, LogIn } from 'lucide-react';

export interface ExtensionAuthGateProps {
  onLogin: (username: string, password: string) => Promise<void>;
}

export function ExtensionAuthGate({ onLogin }: ExtensionAuthGateProps) {
  const [username, setUsername] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const password = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);
  const attempt = useRef(0);
  const errorId = useId();

  useEffect(() => {
    mounted.current = true;
    const clear = () => {
      if (password.current) password.current.value = '';
      attempt.current += 1;
      submitting.current = false;
      if (mounted.current) setPending(false);
    };
    window.addEventListener('pagehide', clear);
    return () => {
      mounted.current = false;
      clear();
      window.removeEventListener('pagehide', clear);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !password.current) return;
    const login = username.trim();
    if (!login) return;
    submitting.current = true;
    const currentAttempt = ++attempt.current;
    let secret = password.current.value;
    password.current.value = '';
    setError(null);
    setPending(true);
    try {
      await onLogin(login, secret);
    } catch (cause) {
      if (mounted.current && attempt.current === currentAttempt) {
        setError(cause instanceof Error && cause.message ? cause.message : 'Не удалось войти. Повторите попытку.');
      }
    } finally {
      secret = '';
      if (attempt.current === currentAttempt) {
        submitting.current = false;
        if (mounted.current) setPending(false);
      }
    }
  }

  return <form className="omni-login-form extension-auth-form" onSubmit={event => void submit(event)} aria-busy={pending}>
    <label className="extension-auth-label">Логин Omni<input className="extension-auth-input" name="username" autoComplete="username" required maxLength={256} value={username} onChange={event => setUsername(event.target.value)} disabled={pending}/></label>
    <label className="extension-auth-label">Пароль<input className="extension-auth-input" ref={password} name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={pending} aria-describedby={error ? errorId : undefined}/></label>
    {error && <p className="extension-auth-error" id={errorId} role="alert">{error}</p>}
    <button className="extension-auth-submit" type="submit" disabled={pending}>{pending ? <LoaderCircle className="extension-auth-spinner" size={18} aria-hidden="true"/> : <LogIn size={18} aria-hidden="true"/>}{pending ? 'Входим…' : 'Войти в Omni'}</button>
  </form>;
}

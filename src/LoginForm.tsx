import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, LogIn } from 'lucide-react';
import './login.css';
import { isDesktop } from './desktop-client';
import { isExtension } from './extension-client';

export function LoginForm({ busy, onLogin }: { busy: boolean; onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const password = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitting.current || !password.current) return;
    submitting.current = true;
    let secret = password.current.value;
    password.current.value = '';
    try { await onLogin(username.trim(), secret); }
    finally { secret = ''; submitting.current = false; }
  }
  if (isDesktop()) return <p>В desktop-прототипе используйте «Открыть официальный вход»: пароль вводится только на сайте академии внутри приложения.</p>;
  if (isExtension()) return <p>Нажмите «Открыть официальный вход» и войдите во вкладке Omni. Оставьте её открытой: расширение использует эту вкладку для загрузки данных.</p>;
  return <form className="omni-login-form" onSubmit={event => void submit(event)}>
    <label>Логин Omni<input name="username" autoComplete="username" required maxLength={256} value={username} onChange={event => setUsername(event.target.value)} disabled={busy}/></label>
    <label>Пароль<input ref={password} name="password" type="password" autoComplete="current-password" required maxLength={1024} disabled={busy}/></label>
    <button className="button primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <LogIn size={17}/>}Войти в Omni</button>
    <small>Пароль передаётся через локальный сервер только официальному Omni и не сохраняется приложением.</small>
  </form>;
}

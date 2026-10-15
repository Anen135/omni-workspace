import { ArrowRight, ExternalLink, LogIn } from 'lucide-react';
import { LoginForm } from '../../features/auth/LoginForm';
import { HelpTip } from '../../components/ui/HelpTip';

export function ConnectionCard({ busy, waiting, extension, changingAccount, connectionState, onLogin, onConnect, onDemo }: {
  busy: boolean; waiting: boolean; extension: boolean; changingAccount: boolean; connectionState: string;
  onLogin: (username: string, password: string) => Promise<void>; onConnect: () => void; onDemo: () => void;
}) {
  const title = waiting ? extension ? 'Завершите вход в этой вкладке' : 'Завершите вход в окне Omni' : 'Вход в Omni';
  const explanation = extension
    ? 'Официальная форма входа откроется в этой вкладке. После входа интерфейс загрузит ваши данные автоматически.'
    : changingAccount
      ? 'Войдите в другой аккаунт в официальной вкладке Omni. Логин и пароль вводятся только там. После входа данные загрузятся автоматически.'
      : waiting
        ? connectionState === 'challenge'
          ? 'Пройдите проверку браузера в официальном окне. Затем можно войти здесь или в официальном окне.'
          : 'Можно завершить вход в официальном окне или использовать форму ниже.'
        : 'Введите данные аккаунта академии. Для подключения используйте форму ниже или официальное окно входа.';
  return <section className="panel connection-card">
    <span className="lesson-icon"><LogIn size={26}/></span><div className="help-heading"><h2>{title}</h2><HelpTip label="О подключении к Omni">Сессия остаётся на этом компьютере. Демонстрация использует отдельные вымышленные данные.</HelpTip></div><p>{explanation}</p>
    {!changingAccount && <LoginForm busy={busy} onLogin={onLogin}/>}
    <button className="button secondary" disabled={busy} onClick={onConnect}><ExternalLink size={17}/>Открыть официальный вход</button>
    <button className="text-button" onClick={onDemo}>Пока посмотреть демонстрацию<ArrowRight size={15}/></button>
  </section>;
}

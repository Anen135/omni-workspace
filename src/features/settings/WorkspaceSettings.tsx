import { useState } from 'react';

export const connectionIntervalKey = 'omni.connection-check-seconds';
export const connectionIntervals = [15, 30, 60, 120, 300] as const;

export function readConnectionInterval(): number {
  try {
    const value = Number(localStorage.getItem(connectionIntervalKey));
    return connectionIntervals.some(interval => interval === value) ? value : 60;
  } catch { return 60; }
}

export function WorkspaceSettings({ interval, onSave }: { interval: number; onSave: (value: number) => void }) {
  const [value, setValue] = useState(interval);
  const [message, setMessage] = useState('');
  return <section className="panel" style={{ padding: 24, maxWidth: 640 }}>
    <h2>Подключение к Omni</h2>
    <p className="muted" style={{ marginTop: 12 }}>Когда ожидается вход в Omni, проверяем восстановление подключения с выбранным интервалом. По умолчанию — раз в минуту.</p>
    <form onSubmit={event => {
      event.preventDefault();
      try {
        localStorage.setItem(connectionIntervalKey, String(value));
        onSave(value);
        setMessage('Настройки сохранены.');
      } catch { setMessage('Не удалось сохранить настройки в браузере.'); }
    }}>
      <label className="field">Интервал проверки подключения
        <select aria-label="Интервал проверки подключения" value={value} onChange={event => { setValue(Number(event.target.value)); setMessage(''); }}>
          {connectionIntervals.map(seconds => <option key={seconds} value={seconds}>{seconds < 60 ? `Раз в ${seconds} секунд` : seconds === 60 ? 'Раз в минуту' : `Раз в ${seconds / 60} мин.`}</option>)}
        </select>
      </label>
      <button className="button primary" type="submit" style={{ marginTop: 20 }}>Сохранить настройки</button>
      {message && <p role="status" style={{ marginTop: 12 }}>{message}</p>}
    </form>
  </section>;
}

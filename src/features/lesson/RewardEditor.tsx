import { Gem } from 'lucide-react';
import { rewardLevel, type LessonReward } from './lesson-reward';

export function RewardEditor({ value, label, disabled, reason, onChange }: {
  value: unknown; label: string; disabled: boolean; reason: string; onChange: (reward: LessonReward) => void;
}) {
  const level = rewardLevel(value);
  const unavailable = reason || (level === null ? 'Omni вернул неизвестную награду. Загрузите урок заново.' : 'Топкойны накапливаются в черновике до нажатия «Сохранить».');
  return <span className="reward-editor" title={unavailable}><Gem size={15} aria-hidden="true"/>
    <select aria-label={label} value={level || ''} disabled={disabled || level === null} onChange={event => onChange(Number(event.target.value) as LessonReward)}>
      <option value="" disabled>{level === null ? 'Не получено' : '—'}</option>
      <option value="1">1</option><option value="2">2</option><option value="3">3</option>
      <option value="4" disabled={!level}>Снять</option>
    </select>
  </span>;
}

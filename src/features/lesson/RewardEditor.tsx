import { Gem } from 'lucide-react';
import { rewardLevel, type LessonReward } from './lesson-reward';

export function RewardEditor({ value, label, disabled, reason, maximum = 3, onChange }: {
  value: unknown; label: string; disabled: boolean; reason: string; maximum?: number; onChange: (reward: LessonReward) => void;
}) {
  const level = rewardLevel(value);
  const unavailable = reason || (level === null ? 'Omni вернул неизвестную награду. Загрузите урок заново.' : maximum < 3 ? `Можно выдать до ${maximum} топкойнов этому ученику: лимит урока — 5. Изменения в черновике.` : 'Топкойны накапливаются в черновике до нажатия «Сохранить».');
  const sliderLevel = level ?? 0;
  const valueText = level === null ? 'Не получено' : level === 0 ? 'Без топкойнов' : `${level} топкойнов`;
  return <span className={`reward-editor reward-level-${sliderLevel}`} title={unavailable}>
    <Gem size={15} aria-hidden="true"/>
    <span className="reward-slider-wrap">
      <input
        type="range"
        min="0"
        max="3"
        step="1"
        value={sliderLevel}
        aria-label={label}
        aria-valuetext={valueText}
        disabled={disabled || level === null}
        onKeyDown={event => {
          if (['ArrowRight', 'ArrowUp', 'PageUp', 'End'].includes(event.key) && sliderLevel >= maximum) event.preventDefault();
        }}
        onChange={event => {
          const requested = Number(event.currentTarget.value);
          if (!Number.isInteger(requested) || requested < 0 || requested > 3) return;
          const next = Math.min(requested, maximum);
          event.currentTarget.value = String(next);
          if (next === sliderLevel) return;
          if (next === 0) {
            if (level !== 0) onChange(4);
          } else {
            onChange(next as LessonReward);
          }
        }}
      />
      <span className="reward-slider-ticks" aria-hidden="true">{[0, 1, 2, 3].map(tick => <span key={tick} className={tick > maximum ? 'reward-tick-unavailable' : ''}>{tick}</span>)}</span>
    </span>
    <output className="reward-current-value" aria-hidden="true">{level === null ? '—' : level}</output>
  </span>;
}

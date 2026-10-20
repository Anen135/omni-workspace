import { useState } from 'react';
import { createRewardAllocation, rewardAllocationFingerprint, type RewardAllocationMode, type RewardAllocationProposal, type RewardAllocationTarget } from './reward-allocation';

export type RewardAllocationProps = {
  items: Record<string, unknown>[];
  studentAverages?: ReadonlyMap<string, string>;
  draftRewardIds?: ReadonlySet<string>;
  disabled: boolean;
  reason?: string;
  contextToken: string;
  onApply: (targets: readonly RewardAllocationTarget[], replace: boolean) => void;
};

export function RewardAllocation({ items, studentAverages, draftRewardIds, disabled, reason = '', contextToken, onApply }: RewardAllocationProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RewardAllocationMode>('mark4');
  const [minimumText, setMinimumText] = useState('7');
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<{ fingerprint: string; proposal: RewardAllocationProposal } | null>(null);
  const [failure, setFailure] = useState('');
  const minimum = minimumText.trim() ? Number(minimumText) : NaN;
  const input = { items, studentAverages, draftRewardIds, mode, minimum, replace };
  const fingerprint = rewardAllocationFingerprint(input, contextToken);
  const stale = preview !== null && preview.fingerprint !== fingerprint;
  const proposal = preview?.proposal;
  const unavailable = disabled || !!reason;
  const clear = () => { setPreview(null); setFailure(''); };

  return <section className="panel reward-allocation" aria-label="Распределение топкойнов">
    <div className="panel-heading"><h2>Топкойны по результатам</h2><button className="button secondary" disabled={unavailable} title={reason} aria-expanded={open} onClick={() => setOpen(value => !value)}>Распределить топкойны</button></div>
    {reason && <p className="attendance-help">{reason}</p>}
    {open && <>
      <p>Шкала баллов: 1–12. Общий лимит урока — 5 топкойнов. Равные баллы получают одинаковые награды; остаток может не распределиться.</p>
      <div className="reward-allocation-options">
        <label>Источник балла<select aria-label="Источник балла для топкойнов" disabled={unavailable} value={mode} onChange={event => { setMode(event.target.value as RewardAllocationMode); clear(); }}>
          <option value="mark4">Работа на уроке</option><option value="mark2">Контрольная</option><option value="average">Средний балл</option><option value="both">Работа на уроке + средний балл</option>
        </select></label>
        <label>Минимальный балл<input aria-label="Минимальный балл для топкойнов" type="number" min="1" max="12" step="0.1" value={minimumText} disabled={unavailable} onChange={event => { setMinimumText(event.target.value); clear(); }}/></label>
        <label className="reward-allocation-replace"><input type="checkbox" checked={replace} disabled={unavailable} onChange={event => { setReplace(event.target.checked); clear(); }}/>Заменить существующие награды и ручной черновик</label>
      </div>
      {mode === 'both' && <p>Среднее арифметическое работы на уроке и среднего балла. Нужны оба корректных значения.</p>}
      <p className="attendance-help">{replace ? 'Замена затронет только присутствующих и опоздавших с корректным баллом. Ниже минимума награда будет снята. Остальные награды сохранятся.' : 'Существующие награды и все ручные изменения, включая снятие награды, сохраняются и учитываются в лимите.'}</p>
      <p>При достигнутом минимуме: балл ниже 9 — до 1, от 9 — до 2, от 11 — до 3 топкойнов.</p>
      <button className="button secondary" disabled={unavailable} onClick={() => { setFailure(''); setPreview({ fingerprint, proposal: createRewardAllocation(input) }); }}>Рассчитать предложение</button>
      {proposal && <div className="reward-allocation-preview" aria-live="polite">
        {stale && <p role="status">Данные урока изменились. Рассчитайте предложение заново.</p>}
        {proposal.blockedReason ? <p role="alert">{proposal.blockedReason}</p> : <>
          <p>Сохранено: {proposal.reserved}. Доступно для распределения: {proposal.available}. Предложено: {proposal.allocated}. Остаток: {proposal.unallocated}.</p>
          <div className="table-scroll"><table><thead><tr><th>Ученик</th><th>Балл</th><th>Сейчас</th><th>Предложено</th><th>Причина</th></tr></thead><tbody>{proposal.rows.map((row, index) => <tr key={`${row.id}:${index}`}><td>{row.name}</td><td>{row.score === null ? '—' : Number(row.score.toFixed(3))}</td><td>{row.current ?? 'Неизвестно'}</td><td>{row.proposed ?? 'Неизвестно'}</td><td>{row.reason}</td></tr>)}</tbody></table></div>
          <div className="reward-allocation-actions"><button className="button primary" disabled={unavailable || stale || !proposal.targets.length} onClick={() => {
            if (unavailable || preview?.fingerprint !== rewardAllocationFingerprint(input, contextToken) || proposal.blockedReason || !proposal.targets.length) return;
            try { onApply(proposal.targets, replace); clear(); }
            catch (reason) { setFailure(reason instanceof Error ? reason.message : 'Не удалось добавить распределение в черновик. Проверьте данные урока.'); }
          }}>В черновик</button><span>{proposal.targets.length ? 'Проверьте результат и нажмите «Сохранить» для отправки в Omni.' : 'Изменений нет.'}</span></div>
          {failure && <p role="alert">{failure}</p>}
        </>}
      </div>}
    </>}
  </section>;
}

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { HelpTip } from '../../components/ui/HelpTip';
import { Settings } from 'lucide-react';
import { createRewardAllocation, rewardAllocationFingerprint, type RewardAllocationMode, type RewardAllocationTarget } from './reward-allocation';

export type RewardAllocationProps = {
  items: Record<string, unknown>[];
  studentAverages?: ReadonlyMap<string, string>;
  studentAveragesLoading?: boolean;
  studentAveragesError?: string;
  draftRewardIds?: ReadonlySet<string>;
  disabled: boolean;
  reason?: string;
  contextToken: string;
  onApply: (targets: readonly RewardAllocationTarget[], replace: boolean) => void;
};

export function RewardAllocation(props: RewardAllocationProps) {
  return <RewardAllocationControls key={props.contextToken} {...props}/>;
}

function RewardAllocationControls({ items, studentAverages, studentAveragesLoading = false, studentAveragesError = '', draftRewardIds, disabled, reason = '', contextToken, onApply }: RewardAllocationProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<RewardAllocationMode>('mark4');
  const [minimumText, setMinimumText] = useState('7');
  const [replace, setReplace] = useState(false);
  const [failure, setFailure] = useState<{ fingerprint: string; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const minimum = minimumText.trim() ? Number(minimumText) : NaN;
  const input = { items, studentAverages, draftRewardIds, mode, minimum, replace };
  const fingerprint = rewardAllocationFingerprint(input, contextToken);
  const proposal = createRewardAllocation(input);
  const sourceReason = (mode === 'average' || mode === 'both')
    ? studentAveragesLoading ? 'Дождитесь загрузки средних оценок.' : studentAveragesError : '';
  const blocked = reason || (disabled ? 'Дождитесь завершения текущей операции.' : '') || sourceReason || proposal.blockedReason;
  const noChanges = !blocked && !proposal.targets.length;
  const clearFeedback = () => { setFailure(null); setNotice(''); };

  function apply() {
    if (blocked) return;
    // Never apply a retained dialog proposal: calculate from the current full roster.
    const current = createRewardAllocation(input);
    if (current.blockedReason || !current.targets.length) return;
    setFailure(null); setNotice('');
    try {
      onApply(current.targets, replace);
      setNotice(`В черновике: ${current.targets.length} учеников.`);
    } catch (error) {
      setFailure({ fingerprint, message: error instanceof Error ? error.message : 'Не удалось добавить распределение в черновик. Проверьте данные урока.' });
    }
  }

  return <div className="reward-allocation" role="group" aria-label="Распределение топкойнов">
    <div className="reward-allocation-controls">
      <button type="button" className="button secondary" disabled={!!blocked || noChanges} title={blocked || (noChanges ? 'Подходящих изменений нет. Проверьте настройки распределения.' : 'Рассчитать по всей группе и добавить в черновик')} onClick={apply}>Распределить топкойны</button>
      <button type="button" className="button secondary reward-allocation-settings" aria-label="Настройки распределения топкойнов" aria-haspopup="dialog" onClick={() => setOpen(true)}><Settings size={17} aria-hidden="true"/></button>
      <HelpTip label="Об области распределения">Вся группа, включая скрытых поиском и фильтрами учеников. Изменится: {blocked ? 0 : proposal.targets.length}.</HelpTip>
    </div>
    {blocked && <p className="reward-allocation-feedback" role="status">{blocked}</p>}
    {failure?.fingerprint === fingerprint && <p className="reward-allocation-feedback" role="alert">{failure.message}</p>}
    {notice && <p className="reward-allocation-feedback" role="status">{notice}</p>}
    {open && <RewardSettingsDialog onClose={() => setOpen(false)}>
      <div className="help-heading"><span>Вся группа</span><HelpTip label="О расчёте топкойнов">Фильтры не ограничивают распределение. Настройки действуют в текущем уроке. Правила алгоритма — в разделе «Справочник».</HelpTip></div>
      <div className="reward-allocation-options">
        <label>Источник балла<select aria-label="Источник балла для топкойнов" value={mode} onChange={event => { setMode(event.target.value as RewardAllocationMode); clearFeedback(); }}>
          <option value="mark4">Работа на уроке</option><option value="mark2">Контрольная</option><option value="average">Средний балл</option><option value="both">Работа на уроке + средний балл</option>
        </select></label>
        <label>Минимальный балл<input aria-label="Минимальный балл для топкойнов" type="number" min="1" max="12" step="0.1" value={minimumText} onChange={event => { setMinimumText(event.target.value); clearFeedback(); }}/></label>
        <label className="reward-allocation-replace"><input type="checkbox" checked={replace} onChange={event => { setReplace(event.target.checked); clearFeedback(); }}/>Заменить существующие награды и ручной черновик</label>
      </div>
      {mode === 'both' && <HelpTip label="О совместном источнике">Среднее арифметическое работы на уроке и среднего балла. Нужны оба значения.</HelpTip>}
      {replace && <p role="status">Существующие награды и ручной черновик будут перезаписаны для подходящих учеников, включая снятие наград ниже минимума.</p>}
      {blocked ? <p role="status">{blocked}</p> : <p role="status">Сохранено: {proposal.reserved}. Доступно: {proposal.available}. Распределено: {proposal.allocated}. Остаток: {proposal.unallocated}. Изменится учеников: {proposal.targets.length}.</p>}
      <details className="reward-calculation-details"><summary>Подробности расчёта</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>Ученик</th><th>Балл</th><th>Сейчас</th><th>Расчёт</th><th>Причина</th></tr></thead><tbody>
        {proposal.rows.map((row, index) => <tr key={`${row.id}:${index}`}><td>{row.name}</td><td>{row.score === null ? '—' : Number(row.score.toFixed(3))}</td><td>{row.current ?? 'Неизвестно'}</td><td>{blocked ? '—' : row.proposed ?? 'Неизвестно'}</td><td>{blocked || row.reason}</td></tr>)}
      </tbody></table></div></details>
    </RewardSettingsDialog>}
  </div>;
}

function RewardSettingsDialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null), title = useId();
  useEffect(() => {
    const root = dialog.current?.getRootNode();
    const opener = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    dialog.current?.showModal();
    return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={dialog} className="lesson-table-settings reward-allocation-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), summary')];
    const root = event.currentTarget.getRootNode();
    const active = root instanceof ShadowRoot ? root.activeElement : document.activeElement;
    const index = controls.findIndex(control => control === active);
    event.preventDefault(); controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
  }}>
    <div className="lesson-table-settings-heading"><h2 id={title}>Настройки распределения топкойнов</h2><button type="button" className="button secondary" autoFocus onClick={onClose}>Закрыть</button></div>
    {children}
  </dialog>;
}

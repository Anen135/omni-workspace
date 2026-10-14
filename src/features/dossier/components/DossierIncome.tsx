import { useEffect, useRef, useState } from 'react';
import { ConnectionError, omniRequest, type Section } from '../../../services/omni-client';
import { defaultIncomeConfig, incomeHistoryModel, incomePeriods, parseRate, readIncomeConfig, saveIncomeConfig } from '../income';
import type { IncomeConfig, IncomeHistoryWeek, IncomePeriodSummary } from '../income';
import { DossierSection } from './DossierSection';
import { DossierOverview } from './DossierOverview';
import { DossierDetails } from './DossierDetails';
import '../income.css';

type Props = { accountId: string; branch?: string; schedule: Section; today: string; disabled?: boolean; onConnectionError?: (reason: unknown) => void; onLoadingChange?: (loading: boolean) => void };
type Draft = { defaultRate: string; masterclassRate: string; payday: string; groupRates: Record<string, string>; masterclassLessons: string[] };
const moneyText = (value: number | null) => value === null ? '' : String(value);
const draftFrom = (config: IncomeConfig): Draft => ({ defaultRate: moneyText(config.defaultRate), masterclassRate: moneyText(config.masterclassRate), payday: String(config.payday),
  groupRates: Object.fromEntries(Object.entries(config.groupRates).map(([group, rate]) => [group, moneyText(rate)])), masterclassLessons: [...config.masterclassLessons] });
const dateText = (date: string | null) => date ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)) : '—';
function storage(): Storage | null { try { return window.localStorage; } catch { return null; } }
const formatMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
function incomeMetric(id: string, label: string, metric: IncomePeriodSummary) {
  const hasKnownAmount = metric.knownTotal > 0 || metric.count > metric.unpriced;
  const value = metric.complete ? metric.total : hasKnownAmount ? `≥ ${formatMoney.format(metric.knownTotal)}` : null;
  const gaps = [metric.missingDays ? `Дней без данных: ${metric.missingDays}` : '', metric.unpriced ? `Занятий без ставки: ${metric.unpriced}` : ''].filter(Boolean);
  return { id, label, value, unit: '₽', note: metric.complete ? undefined : `${hasKnownAmount ? 'Учтена известная часть. ' : ''}${gaps.join(' · ')}` };
}

export function DossierIncome(props: Props) {
  return <IncomePanel key={JSON.stringify([props.accountId, props.branch || ''])} {...props}/>;
}

function IncomePanel({ accountId, branch = '', today, disabled = false, onConnectionError, onLoadingChange }: Props) {
  const [initial] = useState(() => readIncomeConfig(storage(), accountId, branch));
  const [config, setConfig] = useState(initial.config);
  const [draft, setDraft] = useState(() => draftFrom(initial.config));
  const [error, setError] = useState(initial.error);
  const [message, setMessage] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [history, setHistory] = useState<IncomeHistoryWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);
  const initialRequested = useRef(false);
  const onConnectionErrorRef = useRef(onConnectionError);
  onConnectionErrorRef.current = onConnectionError;
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;
  const summary = incomeHistoryModel(history, config, today);
  const { metrics, periods } = summary;
  const payday = periods.payday;
  const availableGroups = summary.groups.filter(group => !Object.hasOwn(draft.groupRates, group));
  const selectedNewGroup = availableGroups.includes(newGroup) ? newGroup : availableGroups[0] || '';
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFrom(config));
  const change = (update: Partial<Draft>) => { setDraft(current => ({ ...current, ...update })); setMessage(''); };

  async function load() {
    if (disabled) return;
    const id = ++requestId.current;
    const weeks = incomePeriods(today, config.payday).weeks;
    let received: IncomeHistoryWeek[] = [];
    setLoading(true); setLoadError(''); setHistory([]);
    onLoadingChangeRef.current?.(true);
    try {
      for (let offset = 0; offset < weeks.length; offset += 16) {
        const batch = weeks.slice(offset, offset + 16);
        let items: IncomeHistoryWeek[];
        try {
          const result = await omniRequest<{ account: { id: string }; weeks: IncomeHistoryWeek[] }>('schedule-range', { accountId, weeks: batch });
          if (id !== requestId.current) return;
          if (result.account?.id !== accountId) throw new ConnectionError('ACCOUNT_CHANGED', 'Аккаунт изменился. Обновите подключение.');
          items = batch.map(week => {
            const matches = Array.isArray(result.weeks) ? result.weeks.filter(item => item?.week === week) : [];
            const item = matches[0];
            return matches.length === 1 && item?.schedule && Object.hasOwn(item.schedule, 'data') && typeof item.schedule.error !== 'undefined'
              ? item : { week, schedule: { data: null, error: 'Omni не вернул расписание недели.' } };
          });
        } catch (reason) {
          if (id !== requestId.current) return;
          if (reason instanceof ConnectionError && ['AUTH_REQUIRED', 'ACCOUNT_CHANGED', 'CHALLENGE'].includes(reason.code)) throw reason;
          const message = reason instanceof Error ? reason.message : 'Не удалось загрузить расписание.';
          items = batch.map(week => ({ week, schedule: { data: null, error: message } }));
        }
        received = [...received, ...items];
        setHistory(received);
      }
      if (received.some(item => item.schedule.error)) setLoadError('Часть недель не загружена. Показаны известные суммы с отметкой «≥»; повторите загрузку для полного расчёта.');
    } catch (reason) {
      if (id !== requestId.current) return;
      setLoadError(reason instanceof Error ? reason.message : 'Не удалось загрузить расписание.');
      setHistory([]);
      onConnectionErrorRef.current?.(reason);
    } finally {
      if (id === requestId.current) setLoading(false);
      // Invalidation stops subsequent batches, but the worker still owns the
      // current request. Keep other pages locked until that request settles.
      onLoadingChangeRef.current?.(false);
    }
  }

  useEffect(() => {
    initialRequested.current = false;
    setHistory([]); setLoading(false);
    return () => { requestId.current++; };
  }, [today]);
  useEffect(() => {
    // StrictMode probes mount effects synchronously; do not start a worker
    // request during the disposable probe mount.
    const timer = setTimeout(() => {
      if (!disabled && !initialRequested.current) { initialRequested.current = true; void load(); }
    }, 0);
    return () => clearTimeout(timer);
  }, [today, disabled]);

  function save() {
    const defaultRate = parseRate(draft.defaultRate);
    const masterclassRate = parseRate(draft.masterclassRate);
    const groupRates: IncomeConfig['groupRates'] = {};
    const paydayValue = Number(draft.payday);
    if (defaultRate === undefined || masterclassRate === undefined || !/^\d+$/.test(draft.payday) || !Number.isInteger(paydayValue) || paydayValue < 1 || paydayValue > 28) {
      setError('Укажите ставки от 0 до 1 000 000 ₽ (не более двух знаков после запятой) и день выплаты от 1 до 28.'); return;
    }
    for (const [group, value] of Object.entries(draft.groupRates)) {
      const rate = parseRate(value);
      if (rate === undefined) { setError(`Проверьте ставку для группы ${group}: от 0 до 1 000 000 ₽.`); return; }
      Object.defineProperty(groupRates, group, { value: rate, enumerable: true, writable: true, configurable: true });
    }
    const next = { defaultRate, masterclassRate, groupRates, payday: paydayValue, masterclassLessons: draft.masterclassLessons };
    const saveError = saveIncomeConfig(storage(), accountId, branch, next);
    setError(saveError);
    if (saveError) return;
    setConfig(next); setDraft(draftFrom(next)); setMessage('Настройки дохода сохранены на этом устройстве.');
  }

  const year = today.slice(0, 4);
  const incomplete = Object.values(metrics).some(metric => !metric.complete);
  const previousPayCycle = incomeMetric('pay-previous', 'Предыдущий расчётный цикл', metrics.previousPayCycle);
  function groupAmount(row: typeof summary.byGroup[number], field: 'earned' | 'remaining' | 'total') {
    if (!metrics.monthPlan.missingDays && !row.unpriced) return row[field];
    const hasPricedLesson = summary.lessons.some(lesson => {
      const group = lesson.masterclass ? `Мастер-классы${lesson.group ? ` · ${lesson.group}` : ''}` : lesson.group || 'Без группы';
      return group === row.group && lesson.amount !== null && lesson.date >= periods.ranges.monthPlan.start && lesson.date < periods.ranges.monthPlan.end
        && (field === 'total' || (field === 'earned' ? lesson.date < today : lesson.date >= today));
    });
    return hasPricedLesson ? `≥ ${formatMoney.format(row[field])}` : null;
  }
  return <DossierSection title="Доходы" description="Расчёт по реальному расписанию и вашим ставкам — не подтверждённая зарплата Omni.">
    <div className="dossier-income-summary">
      <div className="dossier-income-heading"><p className="dossier-income-period">Месячный прогноз и заработок</p><button type="button" className="button secondary small" disabled={loading || disabled} onClick={() => void load()}>Обновить расчёт</button></div>
      <p className="dossier-income-note">Заработано — расчёт по занятиям до сегодняшнего дня, без проверки проведения и оплаты. Сегодняшние пары ещё относятся к оставшимся. Одна запись расписания — одна пара.</p>
      {loading && <p className="dossier-income-note" role="status">Загружаем расписание: {history.length} из {periods.weeks.length} недель…</p>}
      {loadError && <p className="dossier-section-error" role="alert">{loadError}</p>}
      {!loading && incomplete && <p className="dossier-income-note">«≥» — известная часть суммы: итог может быть больше. «—» — нет ни одного занятия с известной ставкой. Причины неполного расчёта указаны под суммами. Уточните ставки или обновите расчёт.</p>}
      {loading && !history.length ? <div className="dossier-income-skeleton" aria-label="Загрузка доходов"><span/><span/><span/><span/></div> : <DossierOverview metrics={[
        incomeMetric('income-year', `Всего заработано с 1 января ${year}`, metrics.yearEarned),
        incomeMetric('income-previous', 'Заработано в прошлом месяце', metrics.previousMonth),
        incomeMetric('income-earned', 'Заработано в этом месяце', metrics.monthEarned),
        incomeMetric('income-remaining', 'Осталось заработать в этом месяце', metrics.monthRemaining),
        incomeMetric('income-month', 'План на текущий месяц', metrics.monthPlan),
        incomeMetric('income-next-month', 'Прогноз на следующий месяц', metrics.nextMonth),
        incomeMetric('income-rolling', 'Прогноз на месяц вперёд', metrics.rollingMonth),
        { id: 'income-month-count', label: 'Пар в этом месяце', value: metrics.monthPlan.missingDays ? null : metrics.monthPlan.count },
        { id: 'income-unpriced', label: 'Без ставки в этом месяце', value: metrics.monthPlan.missingDays ? null : metrics.monthPlan.unpriced },
      ]}/>}
      <p className="dossier-income-note">Прогноз на месяц вперёд: {dateText(today)} — {dateText(periods.ranges.rollingMonth.end)} (конечная дата не включена). Следующий месяц — отдельный календарный период. Нет расписания в будущих неделях — нет предположенных пар.</p>
      <div className="dossier-income-paycycle">
        <div className="dossier-income-heading"><h4>До зарплаты</h4><strong>{dateText(payday)}</strong></div>
        <p className="dossier-income-note">Расчётный цикл: {dateText(periods.payStart)} — {dateText(payday)} (день выплаты не включён). Это локальная модель от выплаты до выплаты, а не данные бухгалтерии.</p>
        <DossierOverview metrics={[
          { ...previousPayCycle, note: `${dateText(periods.ranges.previousPayCycle.start)} — ${dateText(periods.ranges.previousPayCycle.end)} (день выплаты не включён). ${previousPayCycle.note || 'Расчёт по расписанию, не подтверждение выплаты.'}` },
          incomeMetric('pay-earned', 'Заработано за расчётный цикл', metrics.payEarned),
          incomeMetric('pay-remaining', 'Осталось заработать до выплаты', metrics.payRemaining),
          incomeMetric('pay-plan', 'План за расчётный цикл', metrics.payPlan),
          { id: 'pay-progress', label: 'Выполнено по сумме', value: summary.payProgress, unit: '%' },
          { id: 'pay-days', label: 'Дней до выплаты', value: periods.daysUntilPayday },
          { id: 'pay-lessons', label: 'Осталось пар до выплаты', value: metrics.payRemaining.missingDays ? null : metrics.payRemaining.count },
        ]}/>
        {summary.payProgress !== null && <progress className="dossier-income-progress" aria-label="Выполнено до зарплаты по сумме" max={100} value={summary.payProgress}/>}
        {metrics.payPlan.complete && metrics.payPlan.total === 0 && <p className="dossier-income-note">План цикла равен нулю; процент выполнения не рассчитывается.</p>}
      </div>
      {summary.byGroup.length > 0 && <DossierDetails tables={[{ id: 'income-groups', title: 'Текущий месяц · по группам', columns: [
        { key: 'group', label: 'Группа / занятие' }, { key: 'count', label: 'Пар' }, { key: 'earned', label: 'Заработано, ₽' }, { key: 'remaining', label: 'Осталось, ₽' }, { key: 'amount', label: 'План, ₽' }, { key: 'unpriced', label: 'Без ставки' },
      ], rows: summary.byGroup.map(row => ({ group: row.group, count: row.count,
        earned: groupAmount(row, 'earned'), remaining: groupAmount(row, 'remaining'),
        amount: groupAmount(row, 'total'), unpriced: row.unpriced })) }]}/>}
    </div>
    <details className="dossier-income-settings">
      <summary>Настройки дохода{dirty ? ' · есть несохранённые изменения' : ''}</summary>
      <p className="dossier-income-note">Ставки за одну пару для группы. Пустая ставка — не оценивать, 0 — бесплатная пара. Настройки привязаны к преподавателю и филиалу, сохраняются только в этом браузере.</p>
      <div className="dossier-income-fields">
        <label>Обычная пара, ₽<input type="text" inputMode="decimal" value={draft.defaultRate} onChange={event => change({ defaultRate: event.target.value })}/></label>
        <label>Мастер-класс, ₽<input type="text" inputMode="decimal" value={draft.masterclassRate} onChange={event => change({ masterclassRate: event.target.value })}/></label>
        <label>День выплаты<input type="number" min={1} max={28} step={1} value={draft.payday} onChange={event => change({ payday: event.target.value })}/></label>
      </div>
      <h4>Индивидуальные ставки групп</h4>
      <div className="dossier-income-rates">{Object.entries(draft.groupRates).map(([group, rate]) => <div className="dossier-income-rate" key={group}>
        <label>{group}<input aria-label={`Стоимость пары ${group}, ₽`} type="text" inputMode="decimal" value={rate} onChange={event => change({ groupRates: { ...draft.groupRates, [group]: event.target.value } })}/></label>
        <button type="button" className="button secondary small" aria-label={`Удалить ставку ${group}`} onClick={() => { const rates = { ...draft.groupRates }; delete rates[group]; change({ groupRates: rates }); }}>Удалить</button>
      </div>)}</div>
      {availableGroups.length > 0 && <div className="dossier-income-add"><label>Группа из расписания<select value={selectedNewGroup} onChange={event => setNewGroup(event.target.value)}>{availableGroups.map(group => <option key={group}>{group}</option>)}</select></label>
        <button type="button" className="button secondary small" onClick={() => change({ groupRates: { ...draft.groupRates, [selectedNewGroup]: draft.defaultRate } })}>Добавить ставку</button>
      </div>}
      {summary.lessons.some(lesson => lesson.ambiguous) && <div className="dossier-income-events"><h4>Уточнить события</h4>
        <p className="dossier-income-note">Неплановые занятия или записи без группы не оценены автоматически. Отметьте только реальные мастер-классы.</p>
        {summary.lessons.filter(lesson => lesson.ambiguous).map(lesson => <label key={lesson.key} className="dossier-income-event">
          <input type="checkbox" checked={draft.masterclassLessons.includes(lesson.key)} onChange={event => change({ masterclassLessons: event.target.checked ? [...draft.masterclassLessons, lesson.key] : draft.masterclassLessons.filter(key => key !== lesson.key) })}/>
          <span>Мастер-класс: {dateText(lesson.date)}, пара {lesson.slot} · {lesson.group || 'Без группы'} · {lesson.event || lesson.subject}</span>
        </label>)}
      </div>}
      <div className="dossier-income-actions"><button type="button" className="button primary" disabled={!dirty} onClick={save}>Сохранить настройки дохода</button>
        <button type="button" className="button secondary" disabled={!dirty} onClick={() => { setDraft(draftFrom(config)); setError(null); setMessage(''); }}>Отменить изменения</button>
        <button type="button" className="button secondary" onClick={() => { setDraft(draftFrom(defaultIncomeConfig())); setMessage(''); }}>Начальные ставки</button>
      </div>
    </details>
    {error && <p className="dossier-section-error" role="alert">{error}</p>}
    {message && <p className="dossier-income-note" role="status">{message}</p>}
  </DossierSection>;
}

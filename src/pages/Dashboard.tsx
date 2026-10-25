import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisTick, Legend, MoneyTooltip, useChartColors } from '../components/charts';
import { Card, Delta, Meter, MonthSwitcher, Segmented, StatusDot } from '../components/ui';
import {
  budgetLines,
  byMember,
  categoryBreakdown,
  cumulativeDaily,
  goalPlan,
  insights,
  monthlySeries,
  pendingRecurring,
  project,
  totals,
  txInMonth,
} from '../lib/finance';
import { addMonths, dayLabel, monthLabel, monthOf, monthShort, money, moneyCompact, pct } from '../lib/format';
import type { Kind } from '../lib/types';
import { useStore } from '../store';

export function Dashboard() {
  const { data, month, setMonth, today, go, run } = useStore();
  const colors = useChartColors();
  const [breakdownKind, setBreakdownKind] = useState<Kind>('expense');
  const [showAllCats, setShowAllCats] = useState(false);

  const nowMonth = monthOf(today);
  const isCurrent = month === nowMonth;
  const isFuture = month > nowMonth;
  const txs = useMemo(() => txInMonth(data.transactions, month), [data.transactions, month]);
  const t = totals(txs);
  const prev = totals(txInMonth(data.transactions, addMonths(month, -1)));
  const savingsRate = t.income > 0 ? t.net / t.income : 0;
  const goalsThisMonth = data.contributions.filter((c) => monthOf(c.occurred_on) === month).reduce((s, c) => s + c.amount, 0);

  const pending = useMemo(() => (month >= nowMonth ? pendingRecurring(data, month) : []), [data, month, nowMonth]);
  const forecast = useMemo(
    () => (isCurrent ? project(data, today, { months: 1, variableAdjust: 0, extraIncome: 0, includeGoals: false, startBalance: 0 }).rows[0] : null),
    [data, today, isCurrent],
  );
  const notes = useMemo(() => insights(data, month, today), [data, month, today]);
  const slices = useMemo(() => categoryBreakdown(txs, data.categories, breakdownKind), [txs, data.categories, breakdownKind]);
  const budgets = useMemo(() => budgetLines(data, month, today), [data, month, today]);
  const series = useMemo(
    () => monthlySeries(data.transactions, isFuture ? nowMonth : month, 6).map((p) => ({ ...p, label: monthShort(p.month) })),
    [data.transactions, month, isFuture, nowMonth],
  );
  const pace = useMemo(() => {
    const day = isCurrent ? Number(today.slice(8, 10)) : undefined;
    const cur = cumulativeDaily(data.transactions, month, day);
    const before = cumulativeDaily(data.transactions, addMonths(month, -1));
    const len = Math.max(before.length, cur.length);
    return Array.from({ length: len }, (_, i) => ({ day: i + 1, atual: cur[i], anterior: before[i] }));
  }, [data.transactions, month, isCurrent, today]);
  const people = useMemo(() => byMember(txs, data.members), [txs, data.members]);
  const plans = useMemo(() => data.goals.filter((g) => !g.archived).map((g) => goalPlan(g, data.contributions, today)), [data.goals, data.contributions, today]);

  const confirmPending = (id: string) => {
    const p = pending.find((x) => x.recurring.id === id);
    if (!p) return;
    const r = p.recurring;
    const date = isCurrent && p.dueDate > today ? today : p.dueDate;
    run(
      (b) =>
        b.insert('transactions', [
          {
            kind: r.kind,
            amount: r.amount,
            occurred_on: date,
            description: r.description,
            category_id: r.category_id,
            payment_method: null,
            recurring_id: r.id,
            installment_group: null,
            installment_no: null,
            installment_total: null,
          },
        ]),
      `${r.description} lançado`,
    );
  };

  const maxSlice = slices[0]?.total ?? 0;
  const visibleSlices = showAllCats ? slices : slices.slice(0, 6);
  const otherTotal = slices.slice(6).reduce((s, x) => s + x.total, 0);
  const summary = buildSummary();

  function buildSummary() {
    if (!txs.length) return isFuture ? 'Mês futuro: veja a aba Projeção para a previsão.' : 'Nenhum lançamento neste mês ainda.';
    const parts = [`Entrou ${money(t.income)} e saiu ${money(t.expense)}.`];
    if (forecast) {
      parts.push(
        `Contando o que ainda está previsto (contas fixas e o gasto médio do dia a dia), o mês deve fechar com ${forecast.net >= 0 ? 'sobra de' : 'falta de'} ${money(Math.abs(forecast.net))}.`,
      );
    }
    return parts.join(' ');
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{data.household.name}</p>
          <h1>Visão geral</h1>
        </div>
      </header>
      <MonthSwitcher month={month} onChange={setMonth} />

      <section className="hero">
        <p className="hero-label">{isCurrent ? 'Saldo do mês até agora' : 'Saldo do mês'}</p>
        <p className={`hero-value ${t.net < 0 ? 'negative' : ''}`}>{money(t.net)}</p>
        <p className="hero-summary">{summary}</p>
        {forecast && txs.length > 0 && (
          <div className="hero-forecast">
            <span>Previsão de fechamento</span>
            <strong className={forecast.net < 0 ? 'negative' : 'positive'}>{money(forecast.net)}</strong>
          </div>
        )}
      </section>

      <div className="tiles">
        <button type="button" className="tile" onClick={() => go('transactions', { kind: 'income' })}>
          <span className="tile-label">Entradas</span>
          <span className="tile-value">{money(t.income)}</span>
          <Delta value={prev.income ? t.income / prev.income - 1 : NaN} goodWhenUp suffix="vs mês anterior" />
        </button>
        <button type="button" className="tile" onClick={() => go('transactions', { kind: 'expense' })}>
          <span className="tile-label">Saídas</span>
          <span className="tile-value">{money(t.expense)}</span>
          <Delta value={prev.expense ? t.expense / prev.expense - 1 : NaN} goodWhenUp={false} suffix="vs mês anterior" />
        </button>
        <div className="tile">
          <span className="tile-label">Taxa de poupança</span>
          <span className="tile-value">{t.income ? pct(savingsRate) : '—'}</span>
          <span className="tile-foot">do que entrou, sobrou</span>
        </div>
        <button type="button" className="tile" onClick={() => go('goals')}>
          <span className="tile-label">Guardado em metas</span>
          <span className="tile-value">{money(goalsThisMonth)}</span>
          <span className="tile-foot">neste mês</span>
        </button>
      </div>

      {notes.length > 0 && (
        <Card title="O que chama atenção">
          <ul className="insights">
            {notes.map((n, i) => (
              <li key={i}>
                <StatusDot tone={n.tone} />
                <span>{n.text}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card title={isFuture ? 'Contas fixas previstas' : 'Contas fixas a lançar'} action={<span className="muted small">{money(pending.reduce((s, p) => s + (p.recurring.kind === 'expense' ? -p.recurring.amount : p.recurring.amount), 0))}</span>}>
          <ul className="list">
            {pending.map((p) => (
              <li key={p.recurring.id} className="list-row">
                <span className="list-icon">{data.categories.find((c) => c.id === p.recurring.category_id)?.icon ?? '🔁'}</span>
                <span className="list-main">
                  <strong>{p.recurring.description}</strong>
                  <small className={p.dueDate < today ? 'text-critical' : ''}>
                    {p.dueDate < today ? 'Venceu ' : 'Vence '}
                    {dayLabel(p.dueDate).toLowerCase()}
                  </small>
                </span>
                <span className={`amount ${p.recurring.kind}`}>{money(p.recurring.amount)}</span>
                {!isFuture && (
                  <button type="button" className="btn btn-sm" onClick={() => confirmPending(p.recurring.id)}>
                    {p.recurring.kind === 'income' ? 'Recebi' : 'Paguei'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title={breakdownKind === 'expense' ? 'Para onde foi o dinheiro' : 'De onde veio o dinheiro'}
        action={
          <Segmented
            small
            value={breakdownKind}
            onChange={setBreakdownKind}
            options={[
              { value: 'expense', label: 'Saídas' },
              { value: 'income', label: 'Entradas' },
            ]}
          />
        }
      >
        {slices.length === 0 ? (
          <p className="muted">Sem {breakdownKind === 'expense' ? 'saídas' : 'entradas'} neste mês.</p>
        ) : (
          <>
            <ul className="cat-bars">
              {visibleSlices.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => go('transactions', { categoryId: s.id, kind: breakdownKind })}>
                    <span className="cat-bars-top">
                      <span className="cat-name">
                        <span aria-hidden="true">{s.icon}</span> {s.name}
                      </span>
                      <span className="cat-value">
                        {money(s.total)} <small>{pct(s.share)}</small>
                      </span>
                    </span>
                    <span className="bar-track">
                      <span className="bar-fill" style={{ width: `${(s.total / maxSlice) * 100}%` }} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {slices.length > 6 && (
              <button type="button" className="link-btn" onClick={() => setShowAllCats(!showAllCats)}>
                {showAllCats ? 'Mostrar menos' : `+ ${slices.length - 6} categorias (${money(otherTotal)})`}
              </button>
            )}
          </>
        )}
      </Card>

      {budgets.length > 0 && (
        <Card title="Orçamentos do mês" action={<button type="button" className="link-btn" onClick={() => go('settings')}>Ajustar</button>}>
          <ul className="budgets">
            {budgets.map((b) => (
              <li key={b.category.id}>
                <div className="budget-top">
                  <span>
                    {b.category.icon} {b.category.name}
                  </span>
                  <span className="budget-nums">
                    <StatusDot tone={b.level} /> {money(b.spent)} <small>de {money(b.budget)}</small>
                  </span>
                </div>
                <Meter value={b.used} level={b.level} marker={b.monthElapsed} />
                <small className="muted">
                  {b.spent <= b.budget ? `Restam ${money(b.budget - b.spent)}` : `Passou ${money(b.spent - b.budget)}`}
                  {b.level === 'warning' && ' · ritmo acima do esperado'}
                </small>
              </li>
            ))}
          </ul>
          <p className="muted small">A marca vertical mostra quanto do mês já passou.</p>
        </Card>
      )}

      <Card title="Últimos 6 meses">
        <Legend
          items={[
            { label: 'Entradas', color: colors.series1 },
            { label: 'Saídas', color: colors.series2 },
          ]}
        />
        <div className="chart" style={{ height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={series} barGap={2} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} onClick={(e) => e?.activePayload && setMonth(e.activePayload[0].payload.month)}>
              <CartesianGrid vertical={false} stroke={colors.grid} />
              <XAxis dataKey="label" tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} />
              <YAxis tick={axisTick(colors.muted)} axisLine={false} tickLine={false} width={56} tickFormatter={moneyCompact} />
              <Tooltip content={<MoneyTooltip labelFormat={(l) => l} />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
              <Bar isAnimationActive={false} dataKey="income" name="Entradas" fill={colors.series1} radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar isAnimationActive={false} dataKey="expense" name="Saídas" fill={colors.series2} radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <table className="mini-table">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Entradas</th>
              <th>Saídas</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {series.slice(-3).reverse().map((p) => (
              <tr key={p.month} className={p.month === month ? 'current' : ''} onClick={() => setMonth(p.month)}>
                <td>{p.label}</td>
                <td>{moneyCompact(p.income)}</td>
                <td>{moneyCompact(p.expense)}</td>
                <td className={p.net < 0 ? 'text-critical' : ''}>{moneyCompact(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Toque numa barra para ver aquele mês.</p>
      </Card>

      {!isFuture && pace.some((p) => p.anterior || p.atual) && (
        <Card title="Ritmo de gastos no mês">
          <Legend
            items={[
              { label: monthLabel(month, false), color: colors.series1, line: true },
              { label: monthLabel(addMonths(month, -1), false), color: colors.muted, line: true },
            ]}
          />
          <div className="chart" style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={pace} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={colors.grid} />
                <XAxis dataKey="day" tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} interval={4} />
                <YAxis tick={axisTick(colors.muted)} axisLine={false} tickLine={false} width={56} tickFormatter={moneyCompact} />
                <Tooltip content={<MoneyTooltip labelFormat={(d) => `Dia ${d}`} />} />
                <Line isAnimationActive={false} type="monotone" dataKey="anterior" name={monthLabel(addMonths(month, -1), false)} stroke={colors.muted} strokeWidth={2} dot={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="atual" name={monthLabel(month, false)} stroke={colors.series1} strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="muted small">Gasto acumulado dia a dia. Se a linha azul está acima da cinza, vocês estão gastando mais rápido que no mês passado.</p>
        </Card>
      )}

      {people.length > 0 && data.members.length > 1 && (
        <Card title="Gastos lançados por pessoa">
          <ul className="cat-bars">
            {people.map((p) => (
              <li key={p.id}>
                <div className="cat-bars-static">
                  <span className="cat-bars-top">
                    <span className="cat-name">{p.name}</span>
                    <span className="cat-value">
                      {money(p.total)} <small>{pct(t.expense ? p.total / t.expense : 0)}</small>
                    </span>
                  </span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ width: `${(p.total / people[0].total) * 100}%` }} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {plans.length > 0 && (
        <Card title="Metas" action={<button type="button" className="link-btn" onClick={() => go('goals')}>Ver todas</button>}>
          <ul className="budgets">
            {plans.map((p) => (
              <li key={p.goal.id}>
                <div className="budget-top">
                  <span>
                    {p.goal.icon} {p.goal.name}
                  </span>
                  <span className="budget-nums">
                    {pct(p.progress)} <small>de {moneyCompact(p.goal.target_amount)}</small>
                  </span>
                </div>
                <Meter value={p.progress} level="accent" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

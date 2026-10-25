import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisTick, MoneyTooltip, useChartColors } from '../components/charts';
import { Card, Field, Segmented, StatusDot } from '../components/ui';
import { project } from '../lib/finance';
import { capitalize, monthLabel, monthShort, money, moneyCompact, parseMoney } from '../lib/format';
import { useStore } from '../store';

/** Eixo sempre inclui o zero, para sobra e falta partirem da mesma linha. */
const withZero: [(min: number) => number, (max: number) => number] = [(min) => Math.min(0, min), (max) => Math.max(0, max)];

const BALANCE_KEY = 'financas-familia:start-balance';

function readBalance(): string {
  try {
    return localStorage.getItem(BALANCE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function Projection() {
  const { data, today } = useStore();
  const colors = useChartColors();
  const [horizon, setHorizon] = useState<'6' | '12' | '24'>('12');
  const [adjust, setAdjust] = useState(0);
  const [extra, setExtra] = useState('');
  const [includeGoals, setIncludeGoals] = useState(true);
  const [balanceText, setBalanceText] = useState(readBalance);
  const [open, setOpen] = useState<string | null>(null);

  const startBalance = parseMoney(balanceText) || 0;
  const extraIncome = parseMoney(extra) || 0;
  const { rows, baseline } = useMemo(
    () => project(data, today, { months: Number(horizon), variableAdjust: adjust / 100, extraIncome, includeGoals, startBalance }),
    [data, today, horizon, adjust, extraIncome, includeGoals, startBalance],
  );

  const last = rows[rows.length - 1];
  const tight = rows.reduce((min, r) => (r.free < min.free ? r : min), rows[0]);
  const negatives = rows.filter((r) => r.free < 0);
  const goalsTotal = rows.reduce((s, r) => s + r.goals, 0);
  const avgFree = rows.reduce((s, r) => s + r.free, 0) / rows.length;
  const chartRows = rows.map((r) => ({ ...r, label: monthShort(r.month) }));
  const hasFixed = data.recurring.some((r) => r.active);

  const saveBalance = (v: string) => {
    setBalanceText(v);
    try {
      localStorage.setItem(BALANCE_KEY, v);
    } catch {
      /* ignora */
    }
  };

  const baselineText =
    baseline.basis === 'history'
      ? `média de ${baseline.months.length === 1 ? '1 mês' : `${baseline.months.length} meses`} (${baseline.months.map(monthShort).reverse().join(', ')})`
      : baseline.basis === 'current-pace'
        ? 'ritmo do mês atual (ainda sem histórico)'
        : 'sem dados ainda';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Próximos meses</p>
          <h1>Projeção</h1>
        </div>
      </header>

      {!hasFixed && (
        <Card className="callout">
          <p>
            <StatusDot tone="info" /> Cadastre salários e contas fixas em <strong>Ajustes → Contas fixas</strong> para a projeção ficar precisa.
          </p>
        </Card>
      )}

      <section className="hero">
        <p className="hero-label">Em {Number(horizon)} meses vocês devem ter acumulado</p>
        <p className={`hero-value ${last.balance < 0 ? 'negative' : ''}`}>{money(last.balance)}</p>
        <p className="hero-summary">
          {startBalance ? `Partindo de ${money(startBalance)} hoje. ` : ''}
          Sobra média de {money(avgFree)} por mês
          {includeGoals && goalsTotal > 0 ? `, depois de separar ${money(goalsTotal)} para as metas` : ''}.
        </p>
      </section>

      <ul className="insights card">
        {negatives.length > 0 ? (
          <li>
            <StatusDot tone="critical" />
            <span>
              {negatives.length === 1 ? '1 mês fecha' : `${negatives.length} meses fecham`} no vermelho. O mais apertado é {monthLabel(tight.month)}, com {money(tight.free)}.
            </span>
          </li>
        ) : (
          <li>
            <StatusDot tone="good" />
            <span>Nenhum mês fecha no vermelho. O mais apertado é {monthLabel(tight.month)}, com sobra de {money(tight.free)}.</span>
          </li>
        )}
        {rows.some((r) => r.installments > 0) && (
          <li>
            <StatusDot tone="info" />
            <span>
              Parcelas já assumidas somam {money(rows.reduce((s, r) => s + r.installments, 0))} no período. Elas acabam em{' '}
              {monthLabel([...rows].reverse().find((r) => r.installments > 0)!.month)}.
            </span>
          </li>
        )}
        <li>
          <StatusDot tone="info" />
          <span>
            Gasto do dia a dia estimado em {money(baseline.variableExpense * (1 + adjust / 100))}/mês, pela {baselineText}
            {adjust ? `, com ajuste de ${adjust > 0 ? '+' : ''}${adjust}%` : ''}.
          </span>
        </li>
      </ul>

      <Card title="E se…?">
        <div className="field">
          <span className="field-label">
            Gastos do dia a dia: <strong>{adjust > 0 ? `+${adjust}` : adjust}%</strong>
          </span>
          <input type="range" min={-40} max={40} step={5} value={adjust} onChange={(e) => setAdjust(Number(e.target.value))} aria-label="Ajuste de gastos variáveis" />
          <span className="range-labels">
            <span>gastar 40% menos</span>
            <span>40% mais</span>
          </span>
        </div>
        <div className="row-2">
          <Field label="Renda extra por mês">
            <input inputMode="decimal" placeholder="R$ 0,00" value={extra} onChange={(e) => setExtra(e.target.value)} />
          </Field>
          <Field label="Saldo em conta hoje" hint="Fica salvo só neste aparelho">
            <input inputMode="decimal" placeholder="R$ 0,00" value={balanceText} onChange={(e) => saveBalance(e.target.value)} />
          </Field>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={includeGoals} onChange={(e) => setIncludeGoals(e.target.checked)} />
          <span>
            <strong>Separar o dinheiro das metas</strong>
            <small>Desconta todo mês o aporte necessário para cumprir cada meta no prazo.</small>
          </span>
        </label>
        <Segmented
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: '6', label: '6 meses' },
            { value: '12', label: '12 meses' },
            { value: '24', label: '24 meses' },
          ]}
        />
      </Card>

      <Card title="Dinheiro acumulado">
        <div className="chart" style={{ height: 210 }}>
          <ResponsiveContainer>
            <AreaChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} />
              <XAxis dataKey="label" tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={axisTick(colors.muted)} axisLine={false} tickLine={false} width={60} tickFormatter={moneyCompact} domain={withZero} />
              <Tooltip content={<MoneyTooltip />} />
              <ReferenceLine y={0} stroke={colors.axis} />
              <Area isAnimationActive={false} type="monotone" dataKey="balance" name="Acumulado" stroke={colors.series1} strokeWidth={2} fill={colors.series1} fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Sobra de cada mês">
        <div className="chart" style={{ height: 190 }}>
          <ResponsiveContainer>
            <BarChart data={chartRows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={colors.grid} />
              <XAxis dataKey="label" tick={axisTick(colors.muted)} axisLine={{ stroke: colors.axis }} tickLine={false} interval="preserveStartEnd" minTickGap={16} />
              <YAxis tick={axisTick(colors.muted)} axisLine={false} tickLine={false} width={60} tickFormatter={moneyCompact} domain={withZero} />
              <Tooltip content={<MoneyTooltip />} cursor={{ fill: colors.grid, opacity: 0.5 }} />
              <ReferenceLine y={0} stroke={colors.axis} />
              <Bar isAnimationActive={false} dataKey="free" name="Sobra" radius={[4, 4, 0, 0]} maxBarSize={20}>
                {chartRows.map((r) => (
                  <Cell key={r.month} fill={r.free < 0 ? colors.negative : colors.positive} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="muted small">Azul: sobra. Vermelho: falta. Toque num mês abaixo para ver a conta completa.</p>
      </Card>

      <section className="card">
        <ul className="proj-list">
          {rows.map((r) => (
            <li key={r.month}>
              <button type="button" className="proj-row" onClick={() => setOpen(open === r.month ? null : r.month)} aria-expanded={open === r.month}>
                <span className="proj-month">
                  {capitalize(monthLabel(r.month))}
                  {r.isCurrent && <small> · atual</small>}
                </span>
                <span className={`proj-free ${r.free < 0 ? 'negative' : ''}`}>{money(r.free)}</span>
                <span className="proj-acc">{moneyCompact(r.balance)}</span>
              </button>
              {open === r.month && (
                <dl className="proj-detail">
                  <dt>Entradas previstas</dt>
                  <dd className="positive">{money(r.income)}</dd>
                  <dt>Contas fixas</dt>
                  <dd>−{money(r.fixedExpense)}</dd>
                  <dt>Parcelas</dt>
                  <dd>−{money(r.installments)}</dd>
                  <dt>Dia a dia (estimado)</dt>
                  <dd>−{money(r.variableExpense)}</dd>
                  {includeGoals && (
                    <>
                      <dt>Para as metas</dt>
                      <dd>−{money(r.goals)}</dd>
                    </>
                  )}
                  <dt>
                    <strong>Sobra do mês</strong>
                  </dt>
                  <dd>
                    <strong>{money(r.free)}</strong>
                  </dd>
                </dl>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className="muted small page-note">
        Como calculamos: entradas = salários e rendas fixas cadastrados (+ renda extra informada). Saídas = contas fixas + parcelas já lançadas + média dos gastos do dia a dia. Rendas avulsas (freelas, reembolsos) não entram, para a previsão ser conservadora.
      </p>
    </div>
  );
}

import {
  addMonths,
  dateInMonth,
  daysInMonth,
  money,
  monthDiff,
  monthOf,
  pct,
  type MonthKey,
} from './format';
import type { Category, Goal, GoalContribution, HouseholdData, Kind, Recurring, Transaction } from './types';

export interface Totals {
  income: number;
  expense: number;
  net: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function txInMonth(txs: Transaction[], m: MonthKey): Transaction[] {
  return txs.filter((t) => monthOf(t.occurred_on) === m);
}

export function totals(txs: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.kind === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income: round2(income), expense: round2(expense), net: round2(income - expense) };
}

/** Gasto do dia a dia: sem conta fixa e sem parcela. É o que oscila e o que dá pra cortar. */
export const isVariable = (t: Transaction) => !t.recurring_id && !t.installment_group;

export function recurringActiveIn(r: Recurring, m: MonthKey): boolean {
  if (!r.active) return false;
  if (monthOf(r.start_month) > m) return false;
  if (r.end_month && monthOf(r.end_month) < m) return false;
  return true;
}

export interface PendingRecurring {
  recurring: Recurring;
  dueDate: string;
}

/** Contas fixas/rendas previstas para o mês que ainda não foram lançadas. */
export function pendingRecurring(data: Pick<HouseholdData, 'recurring' | 'transactions'>, m: MonthKey): PendingRecurring[] {
  const done = new Set(
    data.transactions.filter((t) => t.recurring_id && monthOf(t.occurred_on) === m).map((t) => t.recurring_id),
  );
  return data.recurring
    .filter((r) => recurringActiveIn(r, m) && !done.has(r.id))
    .map((r) => ({ recurring: r, dueDate: dateInMonth(m, r.day_of_month) }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export interface CategorySlice {
  category: Category | null;
  id: string;
  name: string;
  icon: string;
  total: number;
  share: number;
  count: number;
}

export function categoryBreakdown(txs: Transaction[], categories: Category[], kind: Kind): CategorySlice[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const acc = new Map<string, { total: number; count: number }>();
  let sum = 0;
  for (const t of txs) {
    if (t.kind !== kind) continue;
    const key = t.category_id && byId.has(t.category_id) ? t.category_id : 'none';
    const cur = acc.get(key) ?? { total: 0, count: 0 };
    cur.total += t.amount;
    cur.count += 1;
    acc.set(key, cur);
    sum += t.amount;
  }
  return [...acc.entries()]
    .map(([id, v]) => {
      const category = byId.get(id) ?? null;
      return {
        category,
        id,
        name: category?.name ?? 'Sem categoria',
        icon: category?.icon ?? '❔',
        total: round2(v.total),
        share: sum ? v.total / sum : 0,
        count: v.count,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export interface MonthPoint extends Totals {
  month: MonthKey;
}

export function monthlySeries(txs: Transaction[], endMonth: MonthKey, count: number): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    out.push({ month: m, ...totals(txInMonth(txs, m)) });
  }
  return out;
}

/** Gasto acumulado dia a dia no mês (para comparar o ritmo com o mês anterior). */
export function cumulativeDaily(txs: Transaction[], m: MonthKey, upToDay?: number): number[] {
  const days = daysInMonth(m);
  const perDay = new Array(days).fill(0);
  for (const t of txInMonth(txs, m)) {
    if (t.kind === 'expense') perDay[Number(t.occurred_on.slice(8, 10)) - 1] += t.amount;
  }
  const out: number[] = [];
  let run = 0;
  const limit = upToDay ?? days;
  for (let d = 0; d < limit; d++) {
    run += perDay[d];
    out.push(round2(run));
  }
  return out;
}

export interface Baseline {
  /** Média mensal de gastos variáveis. */
  variableExpense: number;
  /** Média mensal de entradas avulsas (sem renda fixa cadastrada). */
  variableIncome: number;
  /** Meses usados na média. */
  months: MonthKey[];
  basis: 'history' | 'current-pace' | 'none';
}

/**
 * Quanto a família costuma gastar no dia a dia por mês.
 * Usa a média dos últimos meses completos com lançamentos; sem histórico,
 * extrapola o ritmo do mês atual.
 */
export function variableBaseline(txs: Transaction[], refMonth: MonthKey, today: string, lookback = 3): Baseline {
  const months: MonthKey[] = [];
  const firstMonth = txs.reduce<MonthKey | null>((min, t) => {
    const m = monthOf(t.occurred_on);
    return !min || m < min ? m : min;
  }, null);
  if (firstMonth) {
    for (let i = 1; i <= 12 && months.length < lookback; i++) {
      const m = addMonths(refMonth, -i);
      if (m < firstMonth) break;
      months.push(m);
    }
  }
  if (months.length) {
    let exp = 0;
    let inc = 0;
    for (const t of txs) {
      if (!isVariable(t) || !months.includes(monthOf(t.occurred_on))) continue;
      if (t.kind === 'expense') exp += t.amount;
      else inc += t.amount;
    }
    return {
      variableExpense: round2(exp / months.length),
      variableIncome: round2(inc / months.length),
      months,
      basis: 'history',
    };
  }
  const current = txInMonth(txs, refMonth).filter(isVariable);
  if (!current.length) return { variableExpense: 0, variableIncome: 0, months: [], basis: 'none' };
  const day = monthOf(today) === refMonth ? Number(today.slice(8, 10)) : daysInMonth(refMonth);
  // Nos primeiros dias o ritmo engana; espera uma semana antes de extrapolar.
  const factor = day >= 7 ? daysInMonth(refMonth) / day : 1;
  const t = totals(current);
  return {
    variableExpense: round2(t.expense * factor),
    variableIncome: 0,
    months: [],
    basis: 'current-pace',
  };
}

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------

export const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;

/** Aporte mensal para sair de `pv` e chegar em `fv` em `n` meses com juros `r` ao mês. */
export function requiredMonthly(fv: number, pv: number, n: number, r: number): number {
  if (n <= 0) return Math.max(0, fv - pv);
  if (r <= 0) return Math.max(0, (fv - pv) / n);
  const g = Math.pow(1 + r, n);
  return Math.max(0, ((fv - pv * g) * r) / (g - 1));
}

/** Meses até chegar em `fv` aportando `pmt` por mês. Infinity se nunca chega. */
export function monthsToReach(fv: number, pv: number, pmt: number, r: number): number {
  if (pv >= fv) return 0;
  if (r <= 0) return pmt > 0 ? Math.ceil((fv - pv) / pmt) : Infinity;
  if (pmt <= 0 && pv <= 0) return Infinity;
  const n = Math.log((fv * r + pmt) / (pv * r + pmt)) / Math.log(1 + r);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : Infinity;
}

export type GoalStatus = 'done' | 'on-track' | 'behind' | 'overdue' | 'new';

export interface GoalPlan {
  goal: Goal;
  saved: number;
  remaining: number;
  progress: number;
  /** Meses restantes contando o mês atual. */
  monthsLeft: number;
  monthlyNeeded: number;
  contributedThisMonth: number;
  /** Média de aportes dos últimos 3 meses. */
  recentPace: number;
  status: GoalStatus;
}

export function goalPlan(goal: Goal, contributions: GoalContribution[], today: string): GoalPlan {
  const mine = contributions.filter((c) => c.goal_id === goal.id);
  const saved = round2(goal.initial_saved + mine.reduce((s, c) => s + c.amount, 0));
  const remaining = round2(Math.max(0, goal.target_amount - saved));
  const now = monthOf(today);
  const monthsLeft = Math.max(0, monthDiff(now, monthOf(goal.target_date)) + 1);
  const r = monthlyRate(goal.annual_yield);
  const monthlyNeeded = remaining === 0 ? 0 : round2(requiredMonthly(goal.target_amount, saved, Math.max(1, monthsLeft), r));
  const contributedThisMonth = round2(mine.filter((c) => monthOf(c.occurred_on) === now).reduce((s, c) => s + c.amount, 0));
  const last3 = [1, 2, 3].map((i) => addMonths(now, -i));
  const recentPace = round2(mine.filter((c) => last3.includes(monthOf(c.occurred_on))).reduce((s, c) => s + c.amount, 0) / 3);

  let status: GoalStatus;
  if (remaining === 0) status = 'done';
  else if (monthsLeft === 0) status = 'overdue';
  else if (!mine.length) status = 'new';
  else status = Math.max(recentPace, contributedThisMonth) >= monthlyNeeded * 0.95 ? 'on-track' : 'behind';

  return {
    goal,
    saved,
    remaining,
    progress: goal.target_amount ? Math.min(1, saved / goal.target_amount) : 0,
    monthsLeft,
    monthlyNeeded,
    contributedThisMonth,
    recentPace,
    status,
  };
}

// ---------------------------------------------------------------------------
// Projeção dos próximos meses
// ---------------------------------------------------------------------------

export interface ProjectionOptions {
  months: number;
  /** Ajuste no gasto variável: -0.2 = gastar 20% menos. */
  variableAdjust: number;
  /** Renda extra mensal a partir do próximo mês. */
  extraIncome: number;
  /** Reservar o aporte necessário das metas. */
  includeGoals: boolean;
  /** Quanto vocês têm hoje (opcional). */
  startBalance: number;
}

export interface ProjectionRow {
  month: MonthKey;
  isCurrent: boolean;
  income: number;
  fixedExpense: number;
  installments: number;
  variableExpense: number;
  expense: number;
  net: number;
  goals: number;
  free: number;
  balance: number;
}

export function project(data: HouseholdData, today: string, opts: ProjectionOptions): { rows: ProjectionRow[]; baseline: Baseline } {
  const now = monthOf(today);
  const baseline = variableBaseline(data.transactions, now, today);
  const varTarget = baseline.variableExpense * (1 + opts.variableAdjust);
  const plans = data.goals.filter((g) => !g.archived).map((g) => goalPlan(g, data.contributions, today));

  const rows: ProjectionRow[] = [];
  let balance = opts.startBalance;
  for (let i = 0; i < opts.months; i++) {
    const m = addMonths(now, i);
    const txs = txInMonth(data.transactions, m);
    const pending = pendingRecurring(data, m);

    let income = 0;
    let fixedExpense = 0;
    let installments = 0;
    let variableSpent = 0;
    for (const t of txs) {
      if (t.kind === 'income') income += t.amount;
      else if (t.recurring_id) fixedExpense += t.amount;
      else if (t.installment_group) installments += t.amount;
      else variableSpent += t.amount;
    }
    for (const p of pending) {
      if (p.recurring.kind === 'income') income += p.recurring.amount;
      else fixedExpense += p.recurring.amount;
    }
    if (i > 0) income += opts.extraIncome;
    // No mês atual, os dias que faltam ainda vão ter gasto do dia a dia, mesmo que a média já tenha sido atingida.
    const daysLeft = i === 0 ? (daysInMonth(m) - Number(today.slice(8, 10))) / daysInMonth(m) : 0;
    const variableExpense = Math.max(varTarget, variableSpent + varTarget * daysLeft);
    const expense = fixedExpense + installments + variableExpense;
    const net = income - expense;

    let goals = 0;
    if (opts.includeGoals) {
      for (const p of plans) {
        if (p.status === 'done' || p.monthsLeft === 0 || i >= p.monthsLeft) continue;
        goals += i === 0 ? Math.max(0, p.monthlyNeeded - p.contributedThisMonth) : p.monthlyNeeded;
      }
    }
    const free = net - goals;
    balance += free;
    rows.push({
      month: m,
      isCurrent: i === 0,
      income: round2(income),
      fixedExpense: round2(fixedExpense),
      installments: round2(installments),
      variableExpense: round2(variableExpense),
      expense: round2(expense),
      net: round2(net),
      goals: round2(goals),
      free: round2(free),
      balance: round2(balance),
    });
  }
  return { rows, baseline };
}

// ---------------------------------------------------------------------------
// Orçamentos e insights
// ---------------------------------------------------------------------------

export interface BudgetLine {
  category: Category;
  spent: number;
  budget: number;
  used: number;
  /** Quanto do mês já passou (0..1). */
  monthElapsed: number;
  level: 'good' | 'warning' | 'critical';
}

export function budgetLines(data: HouseholdData, m: MonthKey, today: string): BudgetLine[] {
  const txs = txInMonth(data.transactions, m);
  const elapsed =
    monthOf(today) === m ? Number(today.slice(8, 10)) / daysInMonth(m) : monthOf(today) > m ? 1 : 0;
  return data.categories
    .filter((c) => c.kind === 'expense' && c.monthly_budget && !c.archived)
    .map((c) => {
      const spent = round2(txs.filter((t) => t.category_id === c.id && t.kind === 'expense').reduce((s, t) => s + t.amount, 0));
      const budget = c.monthly_budget as number;
      const used = spent / budget;
      const level: BudgetLine['level'] = used > 1 ? 'critical' : used > Math.max(0.8, elapsed + 0.1) ? 'warning' : 'good';
      return { category: c, spent, budget, used, monthElapsed: elapsed, level };
    })
    .sort((a, b) => b.used - a.used);
}

export interface Insight {
  tone: 'good' | 'warning' | 'critical' | 'info';
  text: string;
}

export function insights(data: HouseholdData, m: MonthKey, today: string): Insight[] {
  const out: Insight[] = [];
  const txs = txInMonth(data.transactions, m);
  const t = totals(txs);
  const isCurrent = monthOf(today) === m;
  const prevMonths = [1, 2, 3].map((i) => addMonths(m, -i)).filter((pm) => txInMonth(data.transactions, pm).length);

  if (!txs.length) {
    out.push({ tone: 'info', text: 'Ainda não há lançamentos neste mês. Toque em + para registrar o primeiro.' });
    return out;
  }

  if (t.income > 0) {
    const rate = t.net / t.income;
    if (!isCurrent || Number(today.slice(8, 10)) > 20) {
      if (rate >= 0.2) out.push({ tone: 'good', text: `Vocês guardaram ${pct(rate)} do que entrou. Acima dos 20% recomendados.` });
      else if (rate >= 0) out.push({ tone: 'warning', text: `Sobrou ${pct(rate)} do que entrou. A referência saudável é guardar pelo menos 20%.` });
      else out.push({ tone: 'critical', text: `Saiu ${money(-t.net)} a mais do que entrou neste mês.` });
    }
  }

  if (prevMonths.length) {
    const avgPrevVar =
      prevMonths.reduce((s, pm) => s + totals(txInMonth(data.transactions, pm).filter(isVariable)).expense, 0) / prevMonths.length;
    const curVar = totals(txs.filter(isVariable)).expense;
    if (avgPrevVar > 0) {
      const day = isCurrent ? Number(today.slice(8, 10)) : daysInMonth(m);
      const projected = isCurrent && day >= 7 ? (curVar / day) * daysInMonth(m) : curVar;
      const diff = projected / avgPrevVar - 1;
      if (!isCurrent || day >= 7) {
        const when = isCurrent ? 'Neste ritmo, os gastos do dia a dia vão fechar' : 'Os gastos do dia a dia fecharam';
        if (diff > 0.1) out.push({ tone: 'warning', text: `${when} ${pct(diff)} acima da média dos últimos meses (${money(avgPrevVar)}).` });
        else if (diff < -0.1) out.push({ tone: 'good', text: `${when} ${pct(-diff)} abaixo da média dos últimos meses (${money(avgPrevVar)}).` });
      }
    }

    // Categoria que mais subiu em relação à média.
    const cur = categoryBreakdown(txs, data.categories, 'expense');
    let worst: { name: string; icon: string; diff: number } | null = null;
    for (const slice of cur) {
      const avg =
        prevMonths.reduce(
          (s, pm) => s + txInMonth(data.transactions, pm).filter((x) => x.kind === 'expense' && (x.category_id ?? 'none') === slice.id).reduce((a, x) => a + x.amount, 0),
          0,
        ) / prevMonths.length;
      const d = slice.total - avg;
      if (avg > 0 && d > Math.max(100, avg * 0.25) && (!worst || d > worst.diff)) worst = { name: slice.name, icon: slice.icon, diff: d };
    }
    if (worst) out.push({ tone: 'warning', text: `${worst.icon} ${worst.name} está ${money(worst.diff)} acima do normal para um mês.` });
  }

  const top = categoryBreakdown(txs, data.categories, 'expense')[0];
  if (top) out.push({ tone: 'info', text: `${top.icon} Maior gasto: ${top.name}, com ${money(top.total)} (${pct(top.share)} das saídas).` });

  const over = budgetLines(data, m, today).filter((b) => b.level === 'critical');
  for (const b of over.slice(0, 2)) {
    out.push({ tone: 'critical', text: `${b.category.icon} ${b.category.name} passou do orçamento em ${money(b.spent - b.budget)}.` });
  }

  if (isCurrent) {
    const pending = pendingRecurring(data, m).filter((p) => p.recurring.kind === 'expense');
    const late = pending.filter((p) => p.dueDate < today);
    if (late.length) {
      out.push({
        tone: 'warning',
        text: `${late.length === 1 ? '1 conta fixa venceu' : `${late.length} contas fixas venceram`} e ainda não foi lançada: ${late.map((p) => p.recurring.description).slice(0, 3).join(', ')}.`,
      });
    }
  }
  return out;
}

/** Quanto cada membro lançou de gastos no mês. */
export function byMember(txs: Transaction[], members: { user_id: string; display_name: string }[]) {
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const acc = new Map<string, number>();
  for (const t of txs) {
    if (t.kind !== 'expense') continue;
    const k = t.created_by ?? 'unknown';
    acc.set(k, (acc.get(k) ?? 0) + t.amount);
  }
  return [...acc.entries()]
    .map(([id, total]) => ({ id, name: names.get(id) ?? 'Alguém', total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

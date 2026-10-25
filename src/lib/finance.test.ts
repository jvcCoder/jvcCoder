import { describe, expect, it } from 'vitest';
import { goalPlan, monthsToReach, pendingRecurring, project, requiredMonthly, variableBaseline } from './finance';
import { addMonths, dateInMonth, monthDiff, parseMoney } from './format';
import type { Goal, HouseholdData, Recurring, Transaction } from './types';

const tx = (p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'occurred_on'>): Transaction => ({
  id: Math.random().toString(36),
  household_id: 'h',
  description: '',
  category_id: null,
  payment_method: null,
  recurring_id: null,
  installment_group: null,
  installment_no: null,
  installment_total: null,
  created_by: 'u',
  created_at: `${p.occurred_on}T00:00:00Z`,
  ...p,
});

const rec = (p: Partial<Recurring> & Pick<Recurring, 'kind' | 'amount'>): Recurring => ({
  id: Math.random().toString(36),
  household_id: 'h',
  description: 'Fixa',
  category_id: null,
  day_of_month: 5,
  start_month: '2026-01-01',
  end_month: null,
  active: true,
  created_by: 'u',
  ...p,
});

const data = (p: Partial<HouseholdData>): HouseholdData => ({
  household: { id: 'h', name: 'Casa', invite_code: 'X' },
  members: [],
  categories: [],
  recurring: [],
  transactions: [],
  goals: [],
  contributions: [],
  ...p,
});

describe('datas', () => {
  it('soma meses atravessando o ano', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthDiff('2026-10', '2027-06')).toBe(8);
  });
  it('ajusta o dia em meses curtos', () => {
    expect(dateInMonth('2027-02', 31)).toBe('2027-02-28');
  });
  it('entende valores no formato brasileiro', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('R$ 89,9')).toBe(89.9);
    expect(parseMoney('1500')).toBe(1500);
  });
});

describe('contas fixas pendentes', () => {
  it('some quando já foi lançada no mês', () => {
    const r = rec({ kind: 'expense', amount: 100 });
    const d = data({ recurring: [r], transactions: [tx({ kind: 'expense', amount: 100, occurred_on: '2026-10-05', recurring_id: r.id })] });
    expect(pendingRecurring(d, '2026-10')).toHaveLength(0);
    expect(pendingRecurring(d, '2026-11')).toHaveLength(1);
  });
  it('respeita início, fim e pausa', () => {
    const r = rec({ kind: 'expense', amount: 100, start_month: '2026-11-01', end_month: '2027-01-01' });
    const d = data({ recurring: [r, rec({ kind: 'expense', amount: 1, active: false })] });
    expect(pendingRecurring(d, '2026-10')).toHaveLength(0);
    expect(pendingRecurring(d, '2027-01')).toHaveLength(1);
    expect(pendingRecurring(d, '2027-02')).toHaveLength(0);
  });
});

describe('média do dia a dia', () => {
  it('usa só gastos variáveis dos meses completos anteriores', () => {
    const txs = [
      tx({ kind: 'expense', amount: 1000, occurred_on: '2026-08-10' }),
      tx({ kind: 'expense', amount: 2000, occurred_on: '2026-09-10' }),
      tx({ kind: 'expense', amount: 999, occurred_on: '2026-09-10', recurring_id: 'r' }),
      tx({ kind: 'expense', amount: 999, occurred_on: '2026-09-10', installment_group: 'g' }),
      tx({ kind: 'expense', amount: 5000, occurred_on: '2026-10-02' }),
    ];
    const b = variableBaseline(txs, '2026-10', '2026-10-15');
    expect(b.basis).toBe('history');
    expect(b.months).toEqual(['2026-09', '2026-08']);
    expect(b.variableExpense).toBe(1500);
  });
});

describe('metas', () => {
  it('sem rendimento divide o que falta pelos meses', () => {
    expect(requiredMonthly(12000, 0, 12, 0)).toBe(1000);
  });
  it('com rendimento precisa guardar menos', () => {
    const r = Math.pow(1.1, 1 / 12) - 1;
    const pmt = requiredMonthly(12000, 0, 12, r);
    expect(pmt).toBeLessThan(1000);
    expect(monthsToReach(12000, 0, pmt + 0.01, r)).toBe(12);
  });
  it('calcula meses restantes contando o mês atual', () => {
    const g: Goal = { id: 'g', household_id: 'h', name: 'Viagem', icon: '✈️', target_amount: 12000, target_date: '2027-09-28', initial_saved: 0, annual_yield: 0, archived: false };
    const p = goalPlan(g, [], '2026-10-25');
    expect(p.monthsLeft).toBe(12);
    expect(p.monthlyNeeded).toBe(1000);
    expect(p.status).toBe('new');
  });
});

describe('projeção', () => {
  it('soma fixos, parcelas futuras e média do dia a dia', () => {
    const salary = rec({ kind: 'income', amount: 10000 });
    const rent = rec({ kind: 'expense', amount: 3000, day_of_month: 10 });
    const d = data({
      recurring: [salary, rent],
      transactions: [
        tx({ kind: 'expense', amount: 2000, occurred_on: '2026-09-15' }),
        tx({ kind: 'income', amount: 10000, occurred_on: '2026-10-05', recurring_id: salary.id }),
        tx({ kind: 'expense', amount: 500, occurred_on: '2026-10-08' }),
        tx({ kind: 'expense', amount: 300, occurred_on: '2026-11-14', installment_group: 'g' }),
      ],
    });
    const { rows } = project(d, '2026-10-09', { months: 3, variableAdjust: 0, extraIncome: 0, includeGoals: false, startBalance: 1000 });
    // Outubro: salário já recebido, aluguel pendente, dia a dia estimado em 2000 (já gastou 500).
    expect(rows[0]).toMatchObject({ income: 10000, fixedExpense: 3000, variableExpense: 2000, net: 5000, balance: 6000 });
    // Novembro: tudo previsto + parcela.
    expect(rows[1]).toMatchObject({ income: 10000, fixedExpense: 3000, installments: 300, variableExpense: 2000, net: 4700, balance: 10700 });
    expect(rows[2].net).toBe(5000);
    // Já passou da média no dia 25: ainda conta o gasto médio dos dias que faltam.
    const late = project(d, '2026-10-25', { months: 1, variableAdjust: 0, extraIncome: 0, includeGoals: false, startBalance: 0 });
    expect(late.rows[0].variableExpense).toBe(2000);
    d.transactions.push(tx({ kind: 'expense', amount: 2500, occurred_on: '2026-10-20' }));
    const over = project(d, '2026-10-25', { months: 1, variableAdjust: 0, extraIncome: 0, includeGoals: false, startBalance: 0 });
    expect(over.rows[0].variableExpense).toBeCloseTo(3000 + (2000 * 6) / 31, 1);
  });
});

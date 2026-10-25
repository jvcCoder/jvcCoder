import { addMonths, dateInMonth, monthOf, todayISO, uid } from './format';
import type { Category, Goal, GoalContribution, HouseholdData, Kind, Recurring, Transaction } from './types';
import { LOCAL_USER, type Seed } from './backend';

/** As mesmas categorias que o banco cria em create_household(). */
const DEFAULTS: [string, Kind, string][] = [
  ['Moradia', 'expense', '🏠'],
  ['Mercado', 'expense', '🛒'],
  ['Restaurantes e delivery', 'expense', '🍽️'],
  ['Transporte', 'expense', '🚗'],
  ['Contas da casa', 'expense', '💡'],
  ['Saúde', 'expense', '💊'],
  ['Educação', 'expense', '📚'],
  ['Lazer', 'expense', '🎉'],
  ['Compras', 'expense', '🛍️'],
  ['Assinaturas', 'expense', '📺'],
  ['Cuidados pessoais', 'expense', '💇'],
  ['Pets', 'expense', '🐾'],
  ['Viagens', 'expense', '✈️'],
  ['Presentes', 'expense', '🎁'],
  ['Impostos e taxas', 'expense', '🧾'],
  ['Outros gastos', 'expense', '📦'],
  ['Salário', 'income', '💼'],
  ['Renda extra', 'income', '💰'],
  ['Rendimentos', 'income', '📈'],
  ['Reembolsos', 'income', '↩️'],
  ['Outras entradas', 'income', '💵'],
];

function categories(hid: string): Category[] {
  return DEFAULTS.map(([name, kind, icon]) => ({
    id: uid(),
    household_id: hid,
    name,
    kind,
    icon,
    monthly_budget: null,
    archived: false,
  }));
}

export const emptySeed: Seed = (hid) => ({
  categories: categories(hid),
  recurring: [],
  transactions: [],
  goals: [],
  contributions: [],
});

// Gerador pseudoaleatório determinístico, para a demonstração ser sempre igual.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTNER = 'demo-partner';

export const demoSeed: Seed = (hid) => {
  const rand = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, b: number) => Math.round((a + rand() * (b - a)) * 100) / 100;
  const cats = categories(hid);
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;
  for (const [name, budget] of [['Mercado', 1800], ['Restaurantes e delivery', 600], ['Lazer', 400], ['Compras', 500], ['Transporte', 700]] as const) {
    cats.find((c) => c.name === name)!.monthly_budget = budget;
  }

  const today = todayISO();
  const now = monthOf(today);
  const first = addMonths(now, -4);
  const who = () => (rand() < 0.5 ? LOCAL_USER : PARTNER);

  const rec = (kind: Kind, description: string, amount: number, category: string, day: number): Recurring => ({
    id: uid(),
    household_id: hid,
    kind,
    description,
    amount,
    category_id: cat(category),
    day_of_month: day,
    start_month: `${first}-01`,
    end_month: null,
    active: true,
    created_by: LOCAL_USER,
  });
  const recurring: Recurring[] = [
    rec('income', 'Salário — Você', 7500, 'Salário', 5),
    rec('income', 'Salário — Ana', 5800, 'Salário', 5),
    rec('expense', 'Aluguel', 2800, 'Moradia', 10),
    rec('expense', 'Condomínio', 650, 'Moradia', 10),
    rec('expense', 'Plano de saúde', 920, 'Saúde', 12),
    rec('expense', 'Internet + celulares', 210, 'Contas da casa', 15),
    rec('expense', 'Luz e gás', 260, 'Contas da casa', 18),
    rec('expense', 'Academia', 180, 'Saúde', 8),
    rec('expense', 'Streaming e música', 85, 'Assinaturas', 20),
    rec('expense', 'Inglês', 450, 'Educação', 7),
  ];

  const transactions: Transaction[] = [];
  const tx = (t: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'occurred_on' | 'description'>) =>
    transactions.push({
      id: uid(),
      household_id: hid,
      category_id: null,
      payment_method: null,
      recurring_id: null,
      installment_group: null,
      installment_no: null,
      installment_total: null,
      created_by: who(),
      created_at: `${t.occurred_on}T12:00:00Z`,
      ...t,
    });

  const variable: [string, string[], number, number, number, string][] = [
    ['Mercado', ['Supermercado', 'Feira', 'Hortifruti', 'Padaria', 'Atacadão'], 8, 60, 340, 'Débito'],
    ['Restaurantes e delivery', ['iFood', 'Jantar fora', 'Almoço', 'Pizza', 'Café'], 6, 35, 150, 'Crédito'],
    ['Transporte', ['Combustível', 'Uber', 'Estacionamento', 'Pedágio'], 5, 25, 220, 'Crédito'],
    ['Lazer', ['Cinema', 'Show', 'Passeio', 'Bar com amigos'], 2, 60, 260, 'Pix'],
    ['Compras', ['Roupas', 'Casa e decoração', 'Eletrônicos', 'Farmácia'], 2, 50, 300, 'Crédito'],
    ['Cuidados pessoais', ['Cabeleireiro', 'Manicure', 'Cosméticos'], 2, 40, 120, 'Pix'],
    ['Pets', ['Ração', 'Pet shop', 'Veterinário'], 1, 80, 250, 'Pix'],
  ];

  const todayDay = Number(today.slice(8, 10));
  for (let i = 4; i >= 0; i--) {
    const m = addMonths(now, -i);
    const lastDay = i === 0 ? todayDay : 31;
    for (const r of recurring) {
      if (r.day_of_month > lastDay) continue;
      const amount = r.description.startsWith('Luz') ? between(210, 310) : r.amount;
      tx({ kind: r.kind, amount, occurred_on: dateInMonth(m, r.day_of_month), description: r.description, category_id: r.category_id, recurring_id: r.id, payment_method: r.kind === 'income' ? 'Transferência' : 'Boleto' });
    }
    for (const [category, names, count, min, max, method] of variable) {
      const n = i === 0 ? Math.round((count * todayDay) / 30) : count + Math.round(rand() * 2 - 1);
      for (let k = 0; k < n; k++) {
        const day = 1 + Math.floor(rand() * Math.min(lastDay, 28));
        tx({ kind: 'expense', amount: between(min, max), occurred_on: dateInMonth(m, day), description: pick(names), category_id: cat(category), payment_method: method });
      }
    }
    if (rand() < 0.6 && 20 <= lastDay) {
      tx({ kind: 'income', amount: between(400, 1500), occurred_on: dateInMonth(m, 20), description: 'Freelance', category_id: cat('Renda extra'), payment_method: 'Pix' });
    }
  }

  // Uma compra parcelada em andamento: aparece nos meses futuros da projeção.
  const group = uid();
  const start = addMonths(now, -2);
  for (let k = 0; k < 10; k++) {
    tx({
      kind: 'expense',
      amount: 389.9,
      occurred_on: dateInMonth(addMonths(start, k), 14),
      description: `Geladeira nova (${k + 1}/10)`,
      category_id: cat('Compras'),
      payment_method: 'Crédito',
      installment_group: group,
      installment_no: k + 1,
      installment_total: 10,
      created_by: PARTNER,
    });
  }

  const goal = (name: string, icon: string, target: number, monthsAhead: number, initial: number, yieldPct: number): Goal => ({
    id: uid(),
    household_id: hid,
    name,
    icon,
    target_amount: target,
    target_date: dateInMonth(addMonths(now, monthsAhead), 28),
    initial_saved: initial,
    annual_yield: yieldPct,
    archived: false,
  });
  const goals = [
    goal('Reserva de emergência', '🛟', 45000, 20, 14000, 10.5),
    goal('Viagem para a Europa', '✈️', 28000, 14, 3500, 10),
    goal('Troca do carro', '🚙', 35000, 30, 0, 10),
  ];
  const contributions: GoalContribution[] = [];
  const pace = [1300, 1600, 0];
  for (let i = 3; i >= 1; i--) {
    goals.forEach((g, gi) => {
      if (!pace[gi]) return;
      contributions.push({
        id: uid(),
        household_id: hid,
        goal_id: g.id,
        amount: pace[gi],
        occurred_on: dateInMonth(addMonths(now, -i), 6),
        note: '',
        created_by: LOCAL_USER,
      });
    });
  }

  return {
    categories: cats,
    recurring,
    transactions,
    goals,
    contributions,
    members: [{ household_id: hid, user_id: PARTNER, display_name: 'Ana' }],
  } satisfies Omit<HouseholdData, 'household'>;
};

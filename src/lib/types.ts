export type Kind = 'income' | 'expense';

export interface Household {
  id: string;
  name: string;
  invite_code: string;
}

export interface Member {
  household_id: string;
  user_id: string;
  display_name: string;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  kind: Kind;
  icon: string;
  monthly_budget: number | null;
  archived: boolean;
}

export interface Recurring {
  id: string;
  household_id: string;
  kind: Kind;
  description: string;
  amount: number;
  category_id: string | null;
  day_of_month: number;
  /** Primeiro dia do mês inicial (YYYY-MM-01). */
  start_month: string;
  /** Primeiro dia do último mês, ou null se não tem fim. */
  end_month: string | null;
  active: boolean;
  created_by: string | null;
}

export interface Transaction {
  id: string;
  household_id: string;
  kind: Kind;
  amount: number;
  /** YYYY-MM-DD */
  occurred_on: string;
  description: string;
  category_id: string | null;
  payment_method: string | null;
  recurring_id: string | null;
  installment_group: string | null;
  installment_no: number | null;
  installment_total: number | null;
  created_by: string | null;
  created_at: string;
}

export interface Goal {
  id: string;
  household_id: string;
  name: string;
  icon: string;
  target_amount: number;
  /** YYYY-MM-DD */
  target_date: string;
  initial_saved: number;
  /** Rendimento anual estimado em %, ex.: 10 para 10% a.a. */
  annual_yield: number;
  archived: boolean;
}

export interface GoalContribution {
  id: string;
  household_id: string;
  goal_id: string;
  amount: number;
  occurred_on: string;
  note: string;
  created_by: string | null;
}

export interface HouseholdData {
  household: Household;
  members: Member[];
  categories: Category[];
  recurring: Recurring[];
  transactions: Transaction[];
  goals: Goal[];
  contributions: GoalContribution[];
}

export type NewTransaction = Omit<Transaction, 'id' | 'household_id' | 'created_by' | 'created_at'>;
export type NewRecurring = Omit<Recurring, 'id' | 'household_id' | 'created_by'>;
export type NewCategory = Omit<Category, 'id' | 'household_id'>;
export type NewGoal = Omit<Goal, 'id' | 'household_id'>;
export type NewContribution = Omit<GoalContribution, 'id' | 'household_id' | 'created_by'>;

export const PAYMENT_METHODS = ['Pix', 'Débito', 'Crédito', 'Dinheiro', 'Boleto', 'Transferência'] as const;

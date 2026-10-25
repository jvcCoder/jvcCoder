import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { uid } from './format';
import type { HouseholdData } from './types';

export type Table = 'transactions' | 'categories' | 'recurring' | 'goals' | 'goal_contributions';

/** Nome da tabela no banco → chave em HouseholdData. */
const KEY: Record<Table, keyof Omit<HouseholdData, 'household' | 'members'>> = {
  transactions: 'transactions',
  categories: 'categories',
  recurring: 'recurring',
  goals: 'goals',
  goal_contributions: 'contributions',
};

const NUMERIC = ['amount', 'monthly_budget', 'target_amount', 'initial_saved', 'annual_yield'];

// Postgres "numeric" pode chegar como string; normaliza para número.
function normalize<T>(row: T): T {
  const r = row as Record<string, unknown>;
  for (const k of NUMERIC) if (r[k] != null) r[k] = Number(r[k]);
  return row;
}

export interface Backend {
  mode: 'cloud' | 'local';
  currentUserId(): string | null;
  load(): Promise<HouseholdData | null>;
  createHousehold(name: string, displayName: string): Promise<void>;
  joinHousehold(code: string, displayName: string): Promise<void>;
  insert<T extends object>(table: Table, rows: T[]): Promise<void>;
  update<T extends object>(table: Table, id: string, patch: Partial<T>): Promise<void>;
  remove(table: Table, ids: string[]): Promise<void>;
  renameMember(displayName: string): Promise<void>;
  renameHousehold(name: string): Promise<void>;
  subscribe(householdId: string, onChange: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Nuvem (Supabase): dados compartilhados entre os aparelhos da família
// ---------------------------------------------------------------------------

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

async function fetchAll<T>(client: SupabaseClient, table: string, householdId: string, order: string): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('household_id', householdId)
      .order(order, { ascending: false })
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data as T[]).map(normalize));
    if (!data || data.length < pageSize) return out;
  }
}

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

export function cloudBackend(client: SupabaseClient, user: User): Backend {
  return {
    mode: 'cloud',
    currentUserId: () => user.id,
    async load() {
      const { data: me, error } = await client
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle();
      check(error);
      if (!me) return null;
      const hid = me.household_id as string;
      const [household, members, categories, recurring, transactions, goals, contributions] = await Promise.all([
        client.from('households').select('id,name,invite_code').eq('id', hid).single(),
        client.from('household_members').select('*').eq('household_id', hid).order('created_at'),
        fetchAll<HouseholdData['categories'][number]>(client, 'categories', hid, 'created_at'),
        fetchAll<HouseholdData['recurring'][number]>(client, 'recurring', hid, 'created_at'),
        fetchAll<HouseholdData['transactions'][number]>(client, 'transactions', hid, 'occurred_on'),
        fetchAll<HouseholdData['goals'][number]>(client, 'goals', hid, 'created_at'),
        fetchAll<HouseholdData['contributions'][number]>(client, 'goal_contributions', hid, 'occurred_on'),
      ]);
      check(household.error);
      check(members.error);
      return {
        household: household.data as HouseholdData['household'],
        members: members.data ?? [],
        categories: categories.reverse(),
        recurring,
        transactions,
        goals: goals.reverse(),
        contributions,
      };
    },
    async createHousehold(name, displayName) {
      const { error } = await client.rpc('create_household', { p_name: name, p_display_name: displayName });
      check(error);
    },
    async joinHousehold(code, displayName) {
      const { error } = await client.rpc('join_household', { p_code: code, p_display_name: displayName });
      check(error);
    },
    async insert(table, rows) {
      const { error } = await client.from(table).insert(rows);
      check(error);
    },
    async update(table, id, patch) {
      const { error } = await client.from(table).update(patch as Record<string, unknown>).eq('id', id);
      check(error);
    },
    async remove(table, ids) {
      const { error } = await client.from(table).delete().in('id', ids);
      check(error);
    },
    async renameMember(displayName) {
      const { error } = await client.from('household_members').update({ display_name: displayName }).eq('user_id', user.id);
      check(error);
    },
    async renameHousehold(name) {
      const { data: me } = await client.from('household_members').select('household_id').eq('user_id', user.id).single();
      const { error } = await client.from('households').update({ name }).eq('id', me?.household_id);
      check(error);
    },
    subscribe(householdId, onChange) {
      const channel = client.channel(`household-${householdId}`);
      for (const table of Object.keys(KEY)) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
          onChange,
        );
      }
      channel.subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Local (modo demonstração): tudo fica salvo só neste aparelho
// ---------------------------------------------------------------------------

const LOCAL_KEY = 'financas-familia:local-data';
export const LOCAL_USER = 'local-user';

function readLocal(): HouseholdData | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? (JSON.parse(raw) as HouseholdData) : null;
  } catch {
    return null;
  }
}

function writeLocal(data: HouseholdData) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // Sem armazenamento disponível (ex.: navegação privada): segue só em memória.
  }
  memory = data;
}

let memory: HouseholdData | null = null;

export function clearLocal() {
  memory = null;
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    /* ignora */
  }
}

export type Seed = (householdId: string) => Omit<HouseholdData, 'household' | 'members'> & { members?: HouseholdData['members'] };

export function localBackend(seed: Seed): Backend {
  const get = () => memory ?? readLocal();
  const mutate = (fn: (d: HouseholdData) => void) => {
    const d = get();
    if (!d) throw new Error('Nenhuma casa criada');
    fn(d);
    writeLocal(d);
  };
  const create = (name: string, displayName: string) => {
    const id = uid();
    const { members = [], ...rest } = seed(id);
    writeLocal({
      household: { id, name, invite_code: 'DEMO' },
      members: [{ household_id: id, user_id: LOCAL_USER, display_name: displayName }, ...members],
      ...rest,
    });
  };
  return {
    mode: 'local',
    currentUserId: () => LOCAL_USER,
    async load() {
      return get();
    },
    async createHousehold(name, displayName) {
      create(name, displayName);
    },
    async joinHousehold() {
      throw new Error('No modo demonstração não dá para entrar em outra casa. Configure a nuvem para compartilhar.');
    },
    async insert(table, rows) {
      mutate((d) => {
        const list = d[KEY[table]] as unknown as object[];
        for (const r of rows) {
          list.push({
            id: uid(),
            household_id: d.household.id,
            created_by: LOCAL_USER,
            created_at: new Date().toISOString(),
            ...r,
          });
        }
      });
    },
    async update(table, id, patch) {
      mutate((d) => {
        const list = d[KEY[table]] as unknown as { id: string }[];
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list[i] = { ...list[i], ...patch };
      });
    },
    async remove(table, ids) {
      mutate((d) => {
        const set = new Set(ids);
        const lists = d as unknown as Record<string, { id: string }[]>;
        lists[KEY[table]] = lists[KEY[table]].filter((x) => !set.has(x.id));
        // Imita os "on delete" do banco.
        if (table === 'goals') d.contributions = d.contributions.filter((c) => !set.has(c.goal_id));
        if (table === 'recurring') d.transactions.forEach((t) => set.has(t.recurring_id ?? '') && (t.recurring_id = null));
        if (table === 'categories') {
          d.transactions.forEach((t) => set.has(t.category_id ?? '') && (t.category_id = null));
          d.recurring.forEach((r) => set.has(r.category_id ?? '') && (r.category_id = null));
        }
      });
    },
    async renameMember(displayName) {
      mutate((d) => {
        d.members = d.members.map((m) => (m.user_id === LOCAL_USER ? { ...m, display_name: displayName } : m));
      });
    },
    async renameHousehold(name) {
      mutate((d) => {
        d.household = { ...d.household, name };
      });
    },
    subscribe() {
      return () => {};
    },
  };
}

-- Finanças da Família — esquema inicial
-- Cada "casa" (household) reúne os membros que compartilham as mesmas finanças.
-- Todas as tabelas de dados têm household_id e são protegidas por RLS:
-- só quem é membro da casa enxerga ou altera os dados dela.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  icon text not null default '📦',
  monthly_budget numeric(12, 2) check (monthly_budget is null or monthly_budget >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Contas fixas e rendas que se repetem todo mês (aluguel, salário, internet...).
create table public.recurring (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  description text not null check (char_length(description) between 1 and 80),
  amount numeric(12, 2) not null check (amount > 0),
  category_id uuid references public.categories (id) on delete set null,
  day_of_month int not null default 1 check (day_of_month between 1 and 31),
  start_month date not null default date_trunc('month', now())::date,
  end_month date,
  active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  occurred_on date not null,
  description text not null default '' check (char_length(description) <= 120),
  category_id uuid references public.categories (id) on delete set null,
  payment_method text,
  recurring_id uuid references public.recurring (id) on delete set null,
  installment_group uuid,
  installment_no int,
  installment_total int,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index transactions_household_date_idx on public.transactions (household_id, occurred_on desc);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_recurring_idx on public.transactions (recurring_id);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  icon text not null default '🎯',
  target_amount numeric(12, 2) not null check (target_amount > 0),
  target_date date not null,
  initial_saved numeric(12, 2) not null default 0 check (initial_saved >= 0),
  annual_yield numeric(5, 2) not null default 0 check (annual_yield between 0 and 100),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Aportes (positivos) e resgates (negativos) em cada meta.
create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  goal_id uuid not null references public.goals (id) on delete cascade,
  amount numeric(12, 2) not null check (amount <> 0),
  occurred_on date not null default current_date,
  note text not null default '',
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index goal_contributions_goal_idx on public.goal_contributions (goal_id);

create index categories_household_idx on public.categories (household_id);
create index recurring_household_idx on public.recurring (household_id);
create index recurring_category_idx on public.recurring (category_id);
create index goals_household_idx on public.goals (household_id);
create index goal_contributions_household_idx on public.goal_contributions (household_id);

-- ---------------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.recurring enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.goal_contributions enable row level security;

create policy "membros veem a casa" on public.households
  for select to authenticated using (public.is_household_member(id));
create policy "membros renomeiam a casa" on public.households
  for update to authenticated using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "membros veem os membros" on public.household_members
  for select to authenticated using (public.is_household_member(household_id));
create policy "cada um edita o próprio nome" on public.household_members
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['categories', 'recurring', 'transactions', 'goals', 'goal_contributions'] loop
    execute format(
      'create policy "membros gerenciam" on public.%I for all to authenticated
         using (public.is_household_member(household_id))
         with check (public.is_household_member(household_id))', t);
  end loop;
end $$;

-- Cria a casa, adiciona quem criou como membro e semeia categorias padrão.
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'Você já participa de uma casa';
  end if;

  insert into public.households (name) values (p_name) returning id into hid;
  insert into public.household_members (household_id, user_id, display_name)
    values (hid, uid, p_display_name);

  insert into public.categories (household_id, name, kind, icon) values
    (hid, 'Moradia', 'expense', '🏠'),
    (hid, 'Mercado', 'expense', '🛒'),
    (hid, 'Restaurantes e delivery', 'expense', '🍽️'),
    (hid, 'Transporte', 'expense', '🚗'),
    (hid, 'Contas da casa', 'expense', '💡'),
    (hid, 'Saúde', 'expense', '💊'),
    (hid, 'Educação', 'expense', '📚'),
    (hid, 'Lazer', 'expense', '🎉'),
    (hid, 'Compras', 'expense', '🛍️'),
    (hid, 'Assinaturas', 'expense', '📺'),
    (hid, 'Cuidados pessoais', 'expense', '💇'),
    (hid, 'Pets', 'expense', '🐾'),
    (hid, 'Viagens', 'expense', '✈️'),
    (hid, 'Presentes', 'expense', '🎁'),
    (hid, 'Impostos e taxas', 'expense', '🧾'),
    (hid, 'Outros gastos', 'expense', '📦'),
    (hid, 'Salário', 'income', '💼'),
    (hid, 'Renda extra', 'income', '💰'),
    (hid, 'Rendimentos', 'income', '📈'),
    (hid, 'Reembolsos', 'income', '↩️'),
    (hid, 'Outras entradas', 'income', '💵');

  return hid;
end;
$$;

-- Entra numa casa existente usando o código de convite.
create or replace function public.join_household(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  hid uuid;
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from public.household_members where user_id = uid) then
    raise exception 'Você já participa de uma casa';
  end if;

  select id into hid from public.households where invite_code = upper(trim(p_code));
  if hid is null then raise exception 'Código de convite inválido'; end if;
  if (select count(*) from public.household_members where household_id = hid) >= 6 then
    raise exception 'Esta casa já atingiu o limite de membros';
  end if;

  insert into public.household_members (household_id, user_id, display_name)
    values (hid, uid, p_display_name);
  return hid;
end;
$$;

revoke execute on function public.create_household(text, text) from public, anon;
revoke execute on function public.join_household(text, text) from public, anon;
revoke execute on function public.is_household_member(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.join_household(text, text) to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;

-- Tempo real: quando um membro lança algo, o app do outro atualiza sozinho.
alter publication supabase_realtime add table
  public.transactions, public.categories, public.recurring, public.goals, public.goal_contributions;

import { useState } from 'react';
import { Card, Field, Segmented, Sheet } from '../components/ui';
import { recurringActiveIn } from '../lib/finance';
import { monthOf, money, parseMoney } from '../lib/format';
import type { Category, Kind, NewCategory, NewRecurring, Recurring } from '../lib/types';
import { useStore } from '../store';

export function Settings({ onSignOut }: { onSignOut: () => void }) {
  const { data, backend, me, run, toast, today } = useStore();
  const [cat, setCat] = useState<Partial<Category> | null>(null);
  const [rec, setRec] = useState<Partial<Recurring> | null>(null);
  const [catKind, setCatKind] = useState<Kind>('expense');
  const myName = data.members.find((m) => m.user_id === me)?.display_name ?? '';
  const [name, setName] = useState(myName);
  const [houseName, setHouseName] = useState(data.household.name);

  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const now = monthOf(today);
  const fixedIncome = data.recurring.filter((r) => r.kind === 'income' && recurringActiveIn(r, now)).reduce((s, r) => s + r.amount, 0);
  const fixedExpense = data.recurring.filter((r) => r.kind === 'expense' && recurringActiveIn(r, now)).reduce((s, r) => s + r.amount, 0);

  const share = async () => {
    const text = `Entre na nossa casa no app Finanças da Família com o código ${data.household.invite_code}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Convite', text, url: window.location.origin });
      else {
        await navigator.clipboard.writeText(data.household.invite_code);
        toast('Código copiado');
      }
    } catch {
      /* compartilhamento cancelado */
    }
  };

  const exportCsv = () => {
    const names = new Map(data.members.map((m) => [m.user_id, m.display_name]));
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor', 'Pagamento', 'Quem lançou'].join(';'),
      ...[...data.transactions]
        .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
        .map((t) =>
          [
            t.occurred_on,
            t.kind === 'income' ? 'Entrada' : 'Saída',
            esc(t.description),
            esc(cats.get(t.category_id ?? '')?.name ?? ''),
            t.amount.toFixed(2).replace('.', ','),
            t.payment_method ?? '',
            esc(names.get(t.created_by ?? '') ?? ''),
          ].join(';'),
        ),
    ];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `financas-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Ajustes</h1>
      </header>

      <Card title="Nossa casa">
        <Field label="Nome da casa">
          <input
            value={houseName}
            maxLength={80}
            onChange={(e) => setHouseName(e.target.value)}
            onBlur={() => houseName.trim() && houseName !== data.household.name && run((b) => b.renameHousehold(houseName.trim()), 'Nome atualizado')}
          />
        </Field>
        <Field label="Seu nome">
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== myName && run((b) => b.renameMember(name.trim()), 'Nome atualizado')} />
        </Field>
        <p className="field-label">Membros</p>
        <p>{data.members.map((m) => m.display_name).join(', ')}</p>
        {backend.mode === 'cloud' ? (
          <div className="invite">
            <span>
              Código de convite
              <strong>{data.household.invite_code}</strong>
            </span>
            <button type="button" className="btn btn-sm" onClick={share}>
              Compartilhar
            </button>
          </div>
        ) : (
          <p className="muted small">Modo demonstração: os dados ficam só neste aparelho. Para usar a dois, configure a nuvem (veja o README).</p>
        )}
      </Card>

      <Card
        title="Contas fixas e salários"
        action={
          <button type="button" className="link-btn" onClick={() => setRec({ kind: 'expense' })}>
            + Adicionar
          </button>
        }
      >
        <p className="muted small">
          Por mês: entram {money(fixedIncome)} fixos e saem {money(fixedExpense)} fixos. Usado para avisar o que falta pagar e para projetar os próximos meses.
        </p>
        <ul className="list">
          {[...data.recurring]
            .sort((a, b) => Number(b.active) - Number(a.active) || a.kind.localeCompare(b.kind) || b.amount - a.amount)
            .map((r) => (
              <li key={r.id}>
                <button type="button" className={`list-row${r.active ? '' : ' inactive'}`} onClick={() => setRec(r)}>
                  <span className="list-icon">{cats.get(r.category_id ?? '')?.icon ?? '🔁'}</span>
                  <span className="list-main">
                    <strong>{r.description}</strong>
                    <small>
                      Todo dia {r.day_of_month}
                      {r.end_month ? ` · até ${r.end_month.slice(5, 7)}/${r.end_month.slice(0, 4)}` : ''}
                      {r.active ? '' : ' · pausada'}
                    </small>
                  </span>
                  <span className={`amount ${r.kind}`}>{money(r.amount)}</span>
                </button>
              </li>
            ))}
        </ul>
      </Card>

      <Card
        title="Categorias e orçamentos"
        action={
          <button type="button" className="link-btn" onClick={() => setCat({ kind: catKind })}>
            + Nova
          </button>
        }
      >
        <Segmented
          small
          value={catKind}
          onChange={setCatKind}
          options={[
            { value: 'expense', label: 'Saídas' },
            { value: 'income', label: 'Entradas' },
          ]}
        />
        {catKind === 'expense' && <p className="muted small">Defina um limite mensal nas categorias que vocês querem controlar. Ele aparece no painel.</p>}
        <ul className="list">
          {data.categories
            .filter((c) => c.kind === catKind)
            .sort((a, b) => Number(a.archived) - Number(b.archived))
            .map((c) => (
              <li key={c.id}>
                <button type="button" className={`list-row${c.archived ? ' inactive' : ''}`} onClick={() => setCat(c)}>
                  <span className="list-icon">{c.icon}</span>
                  <span className="list-main">
                    <strong>{c.name}</strong>
                    {c.archived && <small>arquivada</small>}
                  </span>
                  {c.monthly_budget ? <span className="muted small">limite {money(c.monthly_budget)}</span> : null}
                </button>
              </li>
            ))}
        </ul>
      </Card>

      <Card title="Instalar no iPhone">
        <ol className="steps">
          <li>Abra o app no <strong>Safari</strong>.</li>
          <li>
            Toque em <strong>Compartilhar</strong> (quadrado com seta para cima).
          </li>
          <li>
            Escolha <strong>Adicionar à Tela de Início</strong>.
          </li>
        </ol>
        <p className="muted small">Ele abre em tela cheia, como um app comum.</p>
      </Card>

      <Card title="Dados">
        <div className="stack-sm">
          <button type="button" className="btn btn-block" onClick={exportCsv}>
            Exportar lançamentos (CSV para Excel)
          </button>
          <button type="button" className="btn btn-ghost-danger btn-block" onClick={onSignOut}>
            {backend.mode === 'cloud' ? 'Sair da conta' : 'Apagar dados da demonstração'}
          </button>
        </div>
      </Card>

      {cat && <CategorySheet initial={cat} onClose={() => setCat(null)} />}
      {rec && <RecurringSheet initial={rec} onClose={() => setRec(null)} />}
    </div>
  );

}

const CATEGORY_ICONS = ['🏠', '🛒', '🍽️', '🚗', '💡', '💊', '📚', '🎉', '🛍️', '📺', '💇', '🐾', '✈️', '🎁', '🧾', '📦', '👶', '🏋️', '☕', '🍺', '⛽', '🚌', '📱', '🧹', '💼', '💰', '📈', '↩️', '💵', '🏦'];

function CategorySheet({ initial, onClose }: { initial: Partial<Category>; onClose: () => void }) {
  const { run } = useStore();
  const editing = Boolean(initial.id);
  const [name, setName] = useState(initial.name ?? '');
  const [icon, setIcon] = useState(initial.icon ?? '📦');
  const [budget, setBudget] = useState(initial.monthly_budget ? String(initial.monthly_budget).replace('.', ',') : '');
  const kind = initial.kind ?? 'expense';

  const save = async () => {
    const b = parseMoney(budget);
    const c: NewCategory = { name: name.trim(), icon, kind, monthly_budget: kind === 'expense' && b > 0 ? b : null, archived: initial.archived ?? false };
    const ok = await run((be) => (editing ? be.update('categories', initial.id!, c) : be.insert('categories', [c])), 'Categoria salva');
    if (ok) onClose();
  };

  return (
    <Sheet
      title={editing ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>
          Salvar
        </button>
      }
    >
      <Field label="Nome">
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="field">
        <span className="field-label">Ícone</span>
        <div className="chip-row">
          {CATEGORY_ICONS.map((i) => (
            <button type="button" key={i} className={`chip chip-icon${icon === i ? ' active' : ''}`} onClick={() => setIcon(i)}>
              {i}
            </button>
          ))}
        </div>
      </div>
      {kind === 'expense' && (
        <Field label="Limite mensal (opcional)" hint="Deixe vazio para não acompanhar orçamento.">
          <input inputMode="decimal" placeholder="R$ 0,00" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </Field>
      )}
      {editing && (
        <button
          type="button"
          className="btn btn-block"
          onClick={() => run((b) => b.update('categories', initial.id!, { archived: !initial.archived }), initial.archived ? 'Categoria reativada' : 'Categoria arquivada').then((ok) => ok && onClose())}
        >
          {initial.archived ? 'Reativar' : 'Arquivar (some das opções, mantém o histórico)'}
        </button>
      )}
    </Sheet>
  );
}

function RecurringSheet({ initial, onClose }: { initial: Partial<Recurring>; onClose: () => void }) {
  const { data, run, today } = useStore();
  const editing = Boolean(initial.id);
  const [kind, setKind] = useState<Kind>(initial.kind ?? 'expense');
  const [description, setDescription] = useState(initial.description ?? '');
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount).replace('.', ',') : '');
  const [categoryId, setCategoryId] = useState<string | null>(initial.category_id ?? null);
  const [day, setDay] = useState(initial.day_of_month ?? 5);
  const [start, setStart] = useState((initial.start_month ?? `${monthOf(today)}-01`).slice(0, 7));
  const [end, setEnd] = useState(initial.end_month?.slice(0, 7) ?? '');
  const [active, setActive] = useState(initial.active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const value = parseMoney(amount);
  const valid = description.trim() && value > 0;

  const save = async () => {
    const r: NewRecurring = {
      kind,
      description: description.trim(),
      amount: value,
      category_id: categoryId,
      day_of_month: day,
      start_month: `${start}-01`,
      end_month: end ? `${end}-01` : null,
      active,
    };
    const ok = await run((b) => (editing ? b.update('recurring', initial.id!, r) : b.insert('recurring', [r])), 'Conta fixa salva');
    if (ok) onClose();
  };

  return (
    <Sheet
      title={editing ? 'Editar conta fixa' : 'Nova conta fixa'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!valid} onClick={save}>
          Salvar
        </button>
      }
    >
      <Segmented
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategoryId(null);
        }}
        options={[
          { value: 'expense', label: 'Conta a pagar' },
          { value: 'income', label: 'Renda fixa' },
        ]}
      />
      <Field label="Descrição">
        <input value={description} maxLength={80} placeholder={kind === 'income' ? 'Ex.: Salário' : 'Ex.: Aluguel, internet'} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="row-2">
        <Field label="Valor mensal">
          <input inputMode="decimal" placeholder="R$ 0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Dia do mês">
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row-2">
        <Field label="Começa em">
          <input type="month" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Termina em (opcional)">
          <input type="month" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <div className="field">
        <span className="field-label">Categoria</span>
        <div className="chip-grid">
          {data.categories
            .filter((c) => c.kind === kind && !c.archived)
            .map((c) => (
              <button type="button" key={c.id} className={`chip${categoryId === c.id ? ' active' : ''}`} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
                {c.icon} {c.name}
              </button>
            ))}
        </div>
      </div>
      <label className="toggle-row">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>
          <strong>Ativa</strong>
          <small>Desative para pausar sem perder o histórico.</small>
        </span>
      </label>
      {editing && (
        <div className="danger-zone">
          {!confirmDelete ? (
            <button type="button" className="btn btn-ghost-danger btn-block" onClick={() => setConfirmDelete(true)}>
              Excluir conta fixa
            </button>
          ) : (
            <button type="button" className="btn btn-danger btn-block" onClick={() => run((b) => b.remove('recurring', [initial.id!]), 'Conta fixa excluída').then((ok) => ok && onClose())}>
              Confirmar (os lançamentos já feitos continuam)
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

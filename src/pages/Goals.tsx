import { useMemo, useState } from 'react';
import { Card, Empty, Field, Meter, Segmented, Sheet, StatusDot } from '../components/ui';
import { goalPlan, monthlyRate, monthsToReach, project, requiredMonthly, type GoalPlan, type GoalStatus } from '../lib/finance';
import { addMonths, capitalize, dateInMonth, dayLabel, monthLabel, monthOf, money, parseMoney, pct } from '../lib/format';
import type { Goal, NewGoal } from '../lib/types';
import { useStore } from '../store';

const STATUS: Record<GoalStatus, { label: string; tone: 'good' | 'warning' | 'critical' | 'info' }> = {
  done: { label: 'Concluída', tone: 'good' },
  'on-track': { label: 'No ritmo', tone: 'good' },
  behind: { label: 'Abaixo do ritmo', tone: 'warning' },
  overdue: { label: 'Prazo vencido', tone: 'critical' },
  new: { label: 'Comece a guardar', tone: 'info' },
};

const ICONS = ['🎯', '✈️', '🛟', '🏠', '🚙', '💍', '🎓', '👶', '🏖️', '💻', '🛋️', '🎁', '🏥', '📈'];

export function Goals() {
  const { data, today } = useStore();
  const [editing, setEditing] = useState<Partial<Goal> | null>(null);
  const [contributing, setContributing] = useState<GoalPlan | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const plans = useMemo(() => data.goals.map((g) => goalPlan(g, data.contributions, today)), [data.goals, data.contributions, today]);
  const active = plans.filter((p) => !p.goal.archived);
  const archived = plans.filter((p) => p.goal.archived);
  const needed = active.filter((p) => p.status !== 'done' && p.status !== 'overdue').reduce((s, p) => s + p.monthlyNeeded, 0);
  const totalSaved = active.reduce((s, p) => s + p.saved, 0);

  // Sobra média esperada sem contar as metas: é daí que o dinheiro das metas sai.
  const capacity = useMemo(() => {
    const { rows } = project(data, today, { months: 6, variableAdjust: 0, extraIncome: 0, includeGoals: false, startBalance: 0 });
    return rows.slice(1).reduce((s, r) => s + r.net, 0) / Math.max(1, rows.length - 1);
  }, [data, today]);
  const load = capacity > 0 ? needed / capacity : Infinity;
  const fit: 'good' | 'warning' | 'critical' = load <= 0.8 ? 'good' : load <= 1 ? 'warning' : 'critical';

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Planejamento</p>
          <h1>Metas</h1>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing({})}>
          + Nova meta
        </button>
      </header>

      {active.length > 0 && (
        <section className="hero">
          <p className="hero-label">Para cumprir todas as metas no prazo</p>
          <p className="hero-value">
            {money(needed)}
            <small>/mês</small>
          </p>
          <p className="hero-summary">
            Já guardado: {money(totalSaved)}. Pela projeção, sobram em média {money(capacity)} por mês antes das metas.
          </p>
          <div className={`fit fit-${fit}`}>
            <StatusDot tone={fit} />
            <span>
              {fit === 'good' && `Cabe no orçamento: as metas usam ${pct(load)} da sobra mensal.`}
              {fit === 'warning' && `Cabe, mas apertado: as metas usam ${pct(load)} da sobra. Pouca folga para imprevistos.`}
              {fit === 'critical' &&
                (capacity > 0
                  ? `Não cabe: faltam ${money(needed - capacity)} por mês. Estenda prazos, reduza valores ou corte gastos.`
                  : 'Hoje não sobra dinheiro no mês. Revise gastos antes de assumir metas.')}
            </span>
          </div>
        </section>
      )}

      {active.length === 0 ? (
        <Empty icon="🎯" title="Nenhuma meta ainda">
          Crie metas como reserva de emergência, viagem ou troca de carro e veja quanto guardar por mês.
        </Empty>
      ) : (
        active.map((p) => <GoalCard key={p.goal.id} plan={p} onEdit={() => setEditing(p.goal)} onContribute={() => setContributing(p)} />)
      )}

      <Simulator onCreate={(g) => setEditing(g)} />

      {archived.length > 0 && (
        <>
          <button type="button" className="link-btn" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Ocultar arquivadas' : `Ver ${archived.length} meta(s) arquivada(s)`}
          </button>
          {showArchived && archived.map((p) => <GoalCard key={p.goal.id} plan={p} onEdit={() => setEditing(p.goal)} onContribute={() => setContributing(p)} />)}
        </>
      )}

      {editing && <GoalSheet initial={editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionSheet plan={contributing} onClose={() => setContributing(null)} />}
    </div>
  );
}

function GoalCard({ plan: p, onEdit, onContribute }: { plan: GoalPlan; onEdit: () => void; onContribute: () => void }) {
  const s = STATUS[p.status];
  return (
    <section className="card goal-card">
      <header className="goal-head">
        <span className="goal-icon">{p.goal.icon}</span>
        <div className="goal-title">
          <strong>{p.goal.name}</strong>
          <small>
            até {monthLabel(monthOf(p.goal.target_date))}
            {p.monthsLeft > 0 && p.status !== 'done' ? ` · ${p.monthsLeft} ${p.monthsLeft === 1 ? 'mês' : 'meses'}` : ''}
          </small>
        </div>
        <button type="button" className="link-btn" onClick={onEdit}>
          Editar
        </button>
      </header>
      <div className="goal-progress">
        <span>
          <strong>{money(p.saved)}</strong> de {money(p.goal.target_amount)}
        </span>
        <span>{pct(p.progress)}</span>
      </div>
      <Meter value={p.progress} level={p.status === 'done' ? 'good' : 'accent'} />
      <div className="goal-foot">
        <span className={`chip-status status-text-${s.tone}`}>
          <StatusDot tone={s.tone} /> {s.label}
        </span>
        {p.status !== 'done' && p.status !== 'overdue' && (
          <span className="goal-need">
            Guardar <strong>{money(p.monthlyNeeded)}</strong>/mês
          </span>
        )}
      </div>
      {p.status === 'behind' && (
        <p className="muted small">
          Nos últimos 3 meses vocês guardaram em média {money(p.recentPace)}/mês. Faltam {money(p.monthlyNeeded - p.recentPace)}/mês para chegar no prazo.
        </p>
      )}
      {p.status === 'overdue' && <p className="muted small">O prazo passou e faltam {money(p.remaining)}. Edite a meta para definir uma nova data.</p>}
      {p.goal.annual_yield > 0 && p.status !== 'done' && <p className="muted small">Considerando rendimento de {String(p.goal.annual_yield).replace('.', ',')}% ao ano.</p>}
      <button type="button" className="btn btn-block" onClick={onContribute}>
        Guardar dinheiro / resgatar
      </button>
    </section>
  );
}

function GoalSheet({ initial, onClose }: { initial: Partial<Goal>; onClose: () => void }) {
  const { run, today } = useStore();
  const editing = Boolean(initial.id);
  const [name, setName] = useState(initial.name ?? '');
  const [icon, setIcon] = useState(initial.icon ?? '🎯');
  const [target, setTarget] = useState(initial.target_amount ? String(initial.target_amount).replace('.', ',') : '');
  const [date, setDate] = useState(initial.target_date ?? dateInMonth(addMonths(monthOf(today), 12), 28));
  const [saved, setSaved] = useState(initial.initial_saved ? String(initial.initial_saved).replace('.', ',') : '');
  const [yieldPct, setYieldPct] = useState(initial.annual_yield ? String(initial.annual_yield).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const targetValue = parseMoney(target);
  const valid = name.trim() && targetValue > 0 && date;

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    const g: NewGoal = {
      name: name.trim(),
      icon,
      target_amount: targetValue,
      target_date: date,
      initial_saved: parseMoney(saved) || 0,
      annual_yield: Math.min(100, Math.max(0, parseMoney(yieldPct) || 0)),
      archived: initial.archived ?? false,
    };
    const ok = await run((b) => (editing ? b.update('goals', initial.id!, g) : b.insert('goals', [g])), editing ? 'Meta atualizada' : 'Meta criada');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      title={editing ? 'Editar meta' : 'Nova meta'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!valid || busy} onClick={save}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      }
    >
      <div className="chip-row">
        {ICONS.map((i) => (
          <button type="button" key={i} className={`chip chip-icon${icon === i ? ' active' : ''}`} onClick={() => setIcon(i)} aria-label={`Ícone ${i}`}>
            {i}
          </button>
        ))}
      </div>
      <Field label="Nome da meta">
        <input value={name} maxLength={60} placeholder="Ex.: Viagem de férias" onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="row-2">
        <Field label="Valor total">
          <input inputMode="decimal" placeholder="R$ 0,00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Até quando">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="row-2">
        <Field label="Já tenho guardado">
          <input inputMode="decimal" placeholder="R$ 0,00" value={saved} onChange={(e) => setSaved(e.target.value)} />
        </Field>
        <Field label="Rendimento % ao ano" hint="Ex.: 10 (CDB, Tesouro)">
          <input inputMode="decimal" placeholder="0" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} />
        </Field>
      </div>
      {editing && (
        <div className="danger-zone stack-sm">
          <button type="button" className="btn btn-block" onClick={() => run((b) => b.update('goals', initial.id!, { archived: !initial.archived }), initial.archived ? 'Meta reativada' : 'Meta arquivada').then((ok) => ok && onClose())}>
            {initial.archived ? 'Reativar meta' : 'Arquivar meta'}
          </button>
          {!confirmDelete ? (
            <button type="button" className="btn btn-ghost-danger btn-block" onClick={() => setConfirmDelete(true)}>
              Excluir meta
            </button>
          ) : (
            <button type="button" className="btn btn-danger btn-block" onClick={() => run((b) => b.remove('goals', [initial.id!]), 'Meta excluída').then((ok) => ok && onClose())}>
              Confirmar: excluir meta e todo o histórico
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

function ContributionSheet({ plan, onClose }: { plan: GoalPlan; onClose: () => void }) {
  const { data, run, today } = useStore();
  const [mode, setMode] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState(plan.monthlyNeeded > 0 ? String(plan.monthlyNeeded).replace('.', ',') : '');
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const history = data.contributions.filter((c) => c.goal_id === plan.goal.id).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
  const value = parseMoney(amount);

  const save = async () => {
    if (!(value > 0)) return;
    setBusy(true);
    const ok = await run(
      (b) => b.insert('goal_contributions', [{ goal_id: plan.goal.id, amount: mode === 'in' ? value : -value, occurred_on: date, note: '' }]),
      mode === 'in' ? `${money(value)} guardados em ${plan.goal.name}` : 'Resgate registrado',
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      title={`${plan.goal.icon} ${plan.goal.name}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!(value > 0) || busy} onClick={save}>
          {mode === 'in' ? 'Guardar' : 'Resgatar'}
        </button>
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'in', label: 'Guardar' },
          { value: 'out', label: 'Resgatar' },
        ]}
      />
      <div className={`amount-input amount-${mode === 'in' ? 'income' : 'expense'}`}>
        <span>R$</span>
        <input inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Valor" />
      </div>
      <Field label="Data">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <p className="muted small">Registre aqui quando transferir dinheiro para a poupança/investimento desta meta.</p>
      {history.length > 0 && (
        <>
          <h4 className="section-title">Histórico</h4>
          <ul className="list">
            {history.map((c) => (
              <li key={c.id} className="list-row">
                <span className="list-main">
                  <strong>{c.amount > 0 ? 'Guardado' : 'Resgatado'}</strong>
                  <small>{dayLabel(c.occurred_on)}</small>
                </span>
                <span className={`amount ${c.amount > 0 ? 'income' : 'expense'}`}>{money(Math.abs(c.amount))}</span>
                <button type="button" className="icon-btn" aria-label="Excluir registro" onClick={() => run((b) => b.remove('goal_contributions', [c.id]), 'Registro excluído')}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function Simulator({ onCreate }: { onCreate: (g: Partial<Goal>) => void }) {
  const { today } = useStore();
  const [mode, setMode] = useState<'by-date' | 'by-amount'>('by-date');
  const [target, setTarget] = useState('20000');
  const [saved, setSaved] = useState('');
  const [months, setMonths] = useState(12);
  const [monthly, setMonthly] = useState('1000');
  const [yieldPct, setYieldPct] = useState('10');

  const fv = parseMoney(target) || 0;
  const pv = parseMoney(saved) || 0;
  const r = monthlyRate(parseMoney(yieldPct) || 0);
  const needed = requiredMonthly(fv, pv, months, r);
  const n = monthsToReach(fv, pv, parseMoney(monthly) || 0, r);
  const resultMonths = mode === 'by-date' ? months : n;
  const finalDate = Number.isFinite(resultMonths) ? addMonths(monthOf(today), Math.max(0, resultMonths - 1)) : null;
  const pmt = mode === 'by-date' ? needed : parseMoney(monthly) || 0;
  const deposited = Number.isFinite(resultMonths) ? pv + pmt * resultMonths : 0;
  const interest = Math.max(0, fv - deposited);

  return (
    <Card title="Simulador: quanto preciso guardar?">
      <Segmented
        small
        value={mode}
        onChange={setMode}
        options={[
          { value: 'by-date', label: 'Tenho um prazo' },
          { value: 'by-amount', label: 'Tenho um valor/mês' },
        ]}
      />
      <div className="row-2">
        <Field label="Quanto custa o objetivo">
          <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Já tenho">
          <input inputMode="decimal" placeholder="R$ 0,00" value={saved} onChange={(e) => setSaved(e.target.value)} />
        </Field>
      </div>
      <div className="row-2">
        {mode === 'by-date' ? (
          <Field label={`Prazo: ${months} meses`}>
            <input type="range" min={1} max={60} value={months} onChange={(e) => setMonths(Number(e.target.value))} />
          </Field>
        ) : (
          <Field label="Consigo guardar por mês">
            <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
        )}
        <Field label="Rendimento % ao ano">
          <input inputMode="decimal" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} />
        </Field>
      </div>
      <div className="sim-result">
        {mode === 'by-date' ? (
          <>
            <span>Guardem por mês</span>
            <strong>{money(needed)}</strong>
            <small>durante {months} meses, até {finalDate ? monthLabel(finalDate) : '—'}</small>
          </>
        ) : Number.isFinite(n) ? (
          <>
            <span>Vocês chegam lá em</span>
            <strong>
              {n} {n === 1 ? 'mês' : 'meses'}
            </strong>
            <small>{finalDate ? capitalize(monthLabel(finalDate)) : ''}</small>
          </>
        ) : (
          <>
            <span>Com esse valor</span>
            <strong>não chega</strong>
            <small>Aumente o valor mensal.</small>
          </>
        )}
        {interest > 1 && Number.isFinite(resultMonths) && <small>Os rendimentos cobrem cerca de {money(interest)} do total.</small>}
      </div>
      <button
        type="button"
        className="btn btn-block"
        disabled={!fv || !finalDate}
        onClick={() =>
          finalDate &&
          onCreate({
            target_amount: fv,
            initial_saved: pv,
            annual_yield: parseMoney(yieldPct) || 0,
            target_date: dateInMonth(finalDate, 28),
          })
        }
      >
        Criar meta com esses valores
      </button>
    </Card>
  );
}

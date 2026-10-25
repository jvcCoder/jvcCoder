import { useMemo, useState } from 'react';
import { addMonths, dateInMonth, money, monthOf, parseMoney, uid } from '../lib/format';
import { PAYMENT_METHODS, type Kind, type NewTransaction, type Transaction } from '../lib/types';
import { useStore } from '../store';
import { Field, Segmented, Sheet } from './ui';

export function TransactionSheet({ initial, onClose }: { initial: Partial<Transaction>; onClose: () => void }) {
  const { data, run, today } = useStore();
  const editing = Boolean(initial.id);
  const [kind, setKind] = useState<Kind>(initial.kind ?? 'expense');
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount).replace('.', ',') : '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(initial.category_id ?? null);
  const [date, setDate] = useState(initial.occurred_on ?? today);
  const [method, setMethod] = useState<string | null>(initial.payment_method ?? null);
  const [installments, setInstallments] = useState(1);
  const [makeRecurring, setMakeRecurring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const categories = useMemo(() => data.categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId)), [data.categories, kind, categoryId]);
  const value = parseMoney(amount);
  const valid = Number.isFinite(value) && value > 0 && date;
  const perInstallment = installments > 1 ? Math.floor((value / installments) * 100) / 100 : value;
  const group = initial.installment_group;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const desc = description.trim() || data.categories.find((c) => c.id === categoryId)?.name || (kind === 'income' ? 'Entrada' : 'Gasto');
    const base: NewTransaction = {
      kind,
      amount: Math.round(value * 100) / 100,
      occurred_on: date,
      description: desc,
      category_id: categoryId,
      payment_method: method,
      recurring_id: initial.recurring_id ?? null,
      installment_group: initial.installment_group ?? null,
      installment_no: initial.installment_no ?? null,
      installment_total: initial.installment_total ?? null,
    };
    let ok: boolean;
    if (editing) {
      ok = await run((b) => b.update('transactions', initial.id!, base), 'Lançamento atualizado');
    } else if (kind === 'expense' && installments > 1) {
      // Cada parcela vira um lançamento no seu mês; a última absorve os centavos.
      const g = uid();
      const rows: NewTransaction[] = [];
      for (let i = 0; i < installments; i++) {
        const isLast = i === installments - 1;
        rows.push({
          ...base,
          amount: isLast ? Math.round((value - perInstallment * (installments - 1)) * 100) / 100 : perInstallment,
          occurred_on: dateInMonth(addMonths(monthOf(date), i), Number(date.slice(8, 10))),
          description: `${desc} (${i + 1}/${installments})`,
          installment_group: g,
          installment_no: i + 1,
          installment_total: installments,
        });
      }
      ok = await run((b) => b.insert('transactions', rows), `${installments} parcelas lançadas`);
    } else if (makeRecurring) {
      const recId = uid();
      ok = await run(async (b) => {
        await b.insert('recurring', [
          {
            id: recId,
            kind,
            description: desc,
            amount: base.amount,
            category_id: categoryId,
            day_of_month: Number(date.slice(8, 10)),
            start_month: `${monthOf(date)}-01`,
            end_month: null,
            active: true,
          },
        ]);
        await b.insert('transactions', [{ ...base, recurring_id: recId }]);
      }, 'Lançado e salvo como conta fixa');
    } else {
      ok = await run((b) => b.insert('transactions', [base]), kind === 'income' ? 'Entrada registrada' : 'Gasto registrado');
    }
    setBusy(false);
    if (ok) onClose();
  };

  const remove = async (all: boolean) => {
    setBusy(true);
    const ids = all && group ? data.transactions.filter((t) => t.installment_group === group).map((t) => t.id) : [initial.id!];
    const ok = await run((b) => b.remove('transactions', ids), all ? 'Parcelas excluídas' : 'Lançamento excluído');
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      title={editing ? 'Editar lançamento' : 'Novo lançamento'}
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary btn-block" disabled={!valid || busy} onClick={save}>
          {busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar'}
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
          { value: 'expense', label: 'Saída' },
          { value: 'income', label: 'Entrada' },
        ]}
      />

      <div className={`amount-input amount-${kind}`}>
        <span>R$</span>
        <input
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          autoFocus={!editing}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Valor"
        />
      </div>
      {installments > 1 && valid && (
        <p className="hint-center">
          {installments}x de {money(perInstallment)} — uma parcela por mês a partir de {date.split('-').reverse().slice(0, 2).join('/')}
        </p>
      )}

      <Field label="Descrição">
        <input value={description} maxLength={120} placeholder={kind === 'income' ? 'Ex.: Salário, freela…' : 'Ex.: Supermercado, gasolina…'} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <div className="field">
        <span className="field-label">Categoria</span>
        <div className="chip-grid">
          {categories.map((c) => (
            <button type="button" key={c.id} className={`chip${categoryId === c.id ? ' active' : ''}`} onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}>
              <span aria-hidden="true">{c.icon}</span> {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="row-2">
        <Field label="Data">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {!editing && kind === 'expense' && !makeRecurring && (
          <Field label="Parcelas">
            <select value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
              <option value={1}>À vista</option>
              {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="field">
        <span className="field-label">Forma de pagamento</span>
        <div className="chip-row">
          {PAYMENT_METHODS.map((p) => (
            <button type="button" key={p} className={`chip chip-sm${method === p ? ' active' : ''}`} onClick={() => setMethod(method === p ? null : p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {!editing && installments === 1 && (
        <label className="toggle-row">
          <input type="checkbox" checked={makeRecurring} onChange={(e) => setMakeRecurring(e.target.checked)} />
          <span>
            <strong>Repete todo mês</strong>
            <small>Salva como conta fixa e entra automaticamente nas projeções.</small>
          </span>
        </label>
      )}

      {initial.recurring_id && <p className="muted small">Este lançamento faz parte de uma conta fixa.</p>}
      {group && <p className="muted small">Parcela {initial.installment_no} de {initial.installment_total}.</p>}

      {editing && (
        <div className="danger-zone">
          {!confirmDelete ? (
            <button type="button" className="btn btn-ghost-danger btn-block" onClick={() => setConfirmDelete(true)}>
              Excluir lançamento
            </button>
          ) : (
            <div className="stack-sm">
              <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => remove(false)}>
                {group ? 'Excluir só esta parcela' : 'Confirmar exclusão'}
              </button>
              {group && (
                <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={() => remove(true)}>
                  Excluir todas as {initial.installment_total} parcelas
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

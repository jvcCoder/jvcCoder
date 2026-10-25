import { useMemo, useState } from 'react';
import { Empty, MonthSwitcher, Segmented } from '../components/ui';
import { totals, txInMonth } from '../lib/finance';
import { dayLabel, money } from '../lib/format';
import type { Kind, Transaction } from '../lib/types';
import { useStore } from '../store';

export function Transactions() {
  const { data, month, setMonth, txFilter, setTxFilter, editTx } = useStore();
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState('all');
  const kind: Kind | 'all' = txFilter.kind ?? 'all';

  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const names = useMemo(() => new Map(data.members.map((m) => [m.user_id, m.display_name])), [data.members]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txInMonth(data.transactions, month)
      .filter((t) => kind === 'all' || t.kind === kind)
      .filter((t) => !txFilter.categoryId || (t.category_id ?? 'none') === txFilter.categoryId)
      .filter((t) => person === 'all' || t.created_by === person)
      .filter((t) => !q || t.description.toLowerCase().includes(q) || (cats.get(t.category_id ?? '')?.name.toLowerCase().includes(q) ?? false))
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at));
  }, [data.transactions, month, kind, txFilter.categoryId, person, query, cats]);

  const groups = useMemo(() => {
    const out: { day: string; items: Transaction[]; net: number }[] = [];
    for (const t of list) {
      let g = out[out.length - 1];
      if (!g || g.day !== t.occurred_on) {
        g = { day: t.occurred_on, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(t);
      g.net += t.kind === 'income' ? t.amount : -t.amount;
    }
    return out;
  }, [list]);

  const sum = totals(list);
  const filteredCategory = txFilter.categoryId ? cats.get(txFilter.categoryId) : null;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Lançamentos</h1>
      </header>
      <MonthSwitcher month={month} onChange={setMonth} />

      <div className="filters">
        <input type="search" className="search" placeholder="Buscar por descrição ou categoria" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Segmented
          value={kind}
          onChange={(k) => setTxFilter({ ...txFilter, kind: k === 'all' ? undefined : k })}
          options={[
            { value: 'all', label: 'Tudo' },
            { value: 'expense', label: 'Saídas' },
            { value: 'income', label: 'Entradas' },
          ]}
        />
        <div className="chip-row">
          {txFilter.categoryId && (
            <button type="button" className="chip chip-sm active" onClick={() => setTxFilter({ ...txFilter, categoryId: undefined })}>
              {filteredCategory ? `${filteredCategory.icon} ${filteredCategory.name}` : 'Sem categoria'} ✕
            </button>
          )}
          {data.members.length > 1 &&
            [{ user_id: 'all', display_name: 'Todos' }, ...data.members].map((m) => (
              <button type="button" key={m.user_id} className={`chip chip-sm${person === m.user_id ? ' active' : ''}`} onClick={() => setPerson(m.user_id)}>
                {m.display_name}
              </button>
            ))}
        </div>
      </div>

      <div className="sum-bar">
        <span>
          <small>Entradas</small>
          <strong className="positive">{money(sum.income)}</strong>
        </span>
        <span>
          <small>Saídas</small>
          <strong>{money(sum.expense)}</strong>
        </span>
        <span>
          <small>Saldo</small>
          <strong className={sum.net < 0 ? 'negative' : ''}>{money(sum.net)}</strong>
        </span>
      </div>

      {groups.length === 0 ? (
        <Empty icon="🧾" title="Nada por aqui">
          {query || txFilter.categoryId || kind !== 'all' ? 'Nenhum lançamento com esses filtros.' : 'Toque em + para registrar uma entrada ou saída.'}
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.day} className="day-group">
            <header>
              <span>{dayLabel(g.day)}</span>
              <span className={g.net < 0 ? '' : 'positive'}>{money(g.net)}</span>
            </header>
            <ul className="list card">
              {g.items.map((t) => {
                const c = cats.get(t.category_id ?? '');
                return (
                  <li key={t.id}>
                    <button type="button" className="list-row" onClick={() => editTx(t)}>
                      <span className="list-icon">{c?.icon ?? '❔'}</span>
                      <span className="list-main">
                        <strong>{t.description}</strong>
                        <small>
                          {[c?.name ?? 'Sem categoria', t.payment_method, data.members.length > 1 ? names.get(t.created_by ?? '') : null, t.recurring_id ? 'fixa' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      </span>
                      <span className={`amount ${t.kind}`}>
                        {t.kind === 'income' ? '+' : '−'}
                        {money(t.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

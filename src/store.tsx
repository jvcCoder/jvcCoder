import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Backend } from './lib/backend';
import { todayISO } from './lib/format';
import type { HouseholdData, Kind, Transaction } from './lib/types';

export type Tab = 'home' | 'transactions' | 'projection' | 'goals' | 'settings';

export interface TxFilter {
  categoryId?: string;
  kind?: Kind;
}

interface Store {
  data: HouseholdData;
  backend: Backend;
  me: string;
  today: string;
  month: string;
  setMonth: (m: string) => void;
  tab: Tab;
  go: (tab: Tab, filter?: TxFilter) => void;
  txFilter: TxFilter;
  setTxFilter: (f: TxFilter) => void;
  /** Executa uma alteração, recarrega os dados e mostra o resultado. */
  run: (fn: (b: Backend) => Promise<void>, ok?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  toast: (msg: string, tone?: 'ok' | 'error') => void;
  editTx: (tx: Partial<Transaction> | null) => void;
  editingTx: Partial<Transaction> | null;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fora do provider');
  return s;
}

export function StoreProvider({
  backend,
  initial,
  onLost,
  children,
}: {
  backend: Backend;
  initial: HouseholdData;
  onLost: () => void;
  children: ReactNode;
}) {
  const [data, setData] = useState(initial);
  const [today, setToday] = useState(todayISO());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [tab, setTab] = useState<Tab>('home');
  const [txFilter, setTxFilter] = useState<TxFilter>({});
  const [editingTx, editTx] = useState<Partial<Transaction> | null>(null);
  const [toastState, setToastState] = useState<{ msg: string; tone: 'ok' | 'error'; id: number } | null>(null);
  const timer = useRef<number>();

  const toast = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    setToastState({ msg, tone, id: Date.now() });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastState(null), tone === 'error' ? 5000 : 2600);
  }, []);

  const reload = useCallback(async () => {
    try {
      const next = await backend.load();
      if (!next) onLost();
      else setData(next);
      setToday(todayISO());
    } catch (e) {
      toast(`Não foi possível atualizar: ${(e as Error).message}`, 'error');
    }
  }, [backend, onLost, toast]);

  const run = useCallback(
    async (fn: (b: Backend) => Promise<void>, ok?: string) => {
      try {
        await fn(backend);
        await reload();
        if (ok) toast(ok);
        return true;
      } catch (e) {
        toast((e as Error).message || 'Algo deu errado', 'error');
        return false;
      }
    },
    [backend, reload, toast],
  );

  // Tempo real: quando o outro membro lança algo, atualiza aqui também.
  useEffect(() => {
    let t: number | undefined;
    const unsub = backend.subscribe(data.household.id, () => {
      window.clearTimeout(t);
      t = window.setTimeout(reload, 400);
    });
    // No iPhone o app "dorme" em segundo plano; ao voltar, busca o que mudou.
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub();
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [backend, data.household.id, reload]);

  const go = useCallback((next: Tab, filter?: TxFilter) => {
    if (filter) setTxFilter(filter);
    setTab(next);
    window.scrollTo({ top: 0 });
  }, []);

  const value: Store = {
    data,
    backend,
    me: backend.currentUserId() ?? '',
    today,
    month,
    setMonth,
    tab,
    go,
    txFilter,
    setTxFilter,
    run,
    reload,
    toast,
    editTx,
    editingTx,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastState && (
        <div key={toastState.id} className={`toast toast-${toastState.tone}`} role="status">
          {toastState.msg}
        </div>
      )}
    </Ctx.Provider>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { TransactionSheet } from './components/TransactionSheet';
import { Field, Segmented } from './components/ui';
import { clearLocal, cloudBackend, localBackend, supabase, type Backend } from './lib/backend';
import { demoSeed, emptySeed } from './lib/seed';
import type { HouseholdData } from './lib/types';
import { Dashboard } from './pages/Dashboard';
import { Goals } from './pages/Goals';
import { Projection } from './pages/Projection';
import { Settings } from './pages/Settings';
import { Transactions } from './pages/Transactions';
import { StoreProvider, useStore, type Tab } from './store';

type Phase = { name: 'loading' } | { name: 'auth' } | { name: 'onboarding'; backend: Backend } | { name: 'ready'; backend: Backend; data: HouseholdData } | { name: 'error'; message: string };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(supabase ? undefined : null);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const backend = useMemo<Backend | null>(() => {
    if (!supabase) return localBackend(emptySeed);
    return session ? cloudBackend(supabase, session.user) : null;
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const boot = useCallback(async () => {
    if (session === undefined) return setPhase({ name: 'loading' });
    if (!backend) return setPhase({ name: 'auth' });
    try {
      const data = await backend.load();
      setPhase(data ? { name: 'ready', backend, data } : { name: 'onboarding', backend });
    } catch (e) {
      setPhase({ name: 'error', message: (e as Error).message });
    }
  }, [backend, session]);

  useEffect(() => {
    boot();
  }, [boot]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    else {
      if (!window.confirm('Apagar todos os dados da demonstração deste aparelho?')) return;
      clearLocal();
      boot();
    }
  }, [boot]);

  switch (phase.name) {
    case 'loading':
      return <div className="splash">💰</div>;
    case 'error':
      return (
        <div className="center-screen">
          <h1>Não foi possível carregar</h1>
          <p className="muted">{phase.message}</p>
          <button type="button" className="btn btn-primary" onClick={boot}>
            Tentar de novo
          </button>
        </div>
      );
    case 'auth':
      return <AuthScreen />;
    case 'onboarding':
      return <Onboarding backend={phase.backend} onDone={boot} />;
    case 'ready':
      return (
        <StoreProvider key={phase.data.household.id} backend={phase.backend} initial={phase.data} onLost={boot}>
          <Shell onSignOut={signOut} />
        </StoreProvider>
      );
  }
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: 'Início', icon: '◉' },
  { id: 'transactions', label: 'Lançamentos', icon: '☰' },
  { id: 'projection', label: 'Projeção', icon: '↗' },
  { id: 'goals', label: 'Metas', icon: '◎' },
];

function Shell({ onSignOut }: { onSignOut: () => void }) {
  const { tab, go, editingTx, editTx, txFilter, backend } = useStore();
  return (
    <div className="app">
      {backend.mode === 'local' && <div className="demo-banner">Modo demonstração · dados só neste aparelho</div>}
      <main>
        {tab === 'home' && <Dashboard />}
        {tab === 'transactions' && <Transactions />}
        {tab === 'projection' && <Projection />}
        {tab === 'goals' && <Goals />}
        {tab === 'settings' && <Settings onSignOut={onSignOut} />}
      </main>
      <nav className="tabbar" aria-label="Navegação">
        {TABS.slice(0, 2).map((t) => (
          <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => go(t.id, t.id === 'transactions' ? {} : undefined)} />
        ))}
        <button type="button" className="fab" aria-label="Novo lançamento" onClick={() => editTx({ kind: txFilter.kind ?? 'expense' })}>
          +
        </button>
        {TABS.slice(2).map((t) => (
          <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => go(t.id)} />
        ))}
        <TabButton tab={{ id: 'settings', label: 'Ajustes', icon: '⚙' }} active={tab === 'settings'} onClick={() => go('settings')} />
      </nav>
      {editingTx && <TransactionSheet initial={editingTx} onClose={() => editTx(null)} />}
    </div>
  );
}

function TabButton({ tab, active, onClick }: { tab: { id: Tab; label: string; icon: string }; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`tab${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <span className="tab-icon" aria-hidden="true">
        {tab.icon}
      </span>
      <span>{tab.label}</span>
    </button>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage(null);
    const res =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (res.error) {
      const msg = res.error.message.includes('Invalid login') ? 'E-mail ou senha incorretos.' : res.error.message;
      setMessage({ text: msg, tone: 'error' });
    } else if (mode === 'up' && !res.data.session) {
      setMessage({ text: 'Conta criada! Confirme pelo link enviado ao seu e-mail e depois entre aqui.', tone: 'ok' });
      setMode('in');
    }
  };

  return (
    <div className="center-screen">
      <div className="brand">💰</div>
      <h1>Finanças da Família</h1>
      <p className="muted">Tudo o que entra e sai da casa, num lugar só.</p>
      <form className="auth-form" onSubmit={submit}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'in', label: 'Entrar' },
            { value: 'up', label: 'Criar conta' },
          ]}
        />
        <Field label="E-mail">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha" hint={mode === 'up' ? 'Mínimo de 6 caracteres' : undefined}>
          <input type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {message && <p className={message.tone === 'error' ? 'text-critical' : 'positive'}>{message.text}</p>}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : 'Criar conta'}
        </button>
      </form>
    </div>
  );
}

function Onboarding({ backend, onDone }: { backend: Backend; onDone: () => void }) {
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [house, setHouse] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = backend.mode === 'local';

  const submit = async (e: React.FormEvent, demo = false) => {
    e.preventDefault();
    if (!name.trim()) return setError('Diga como podemos te chamar.');
    setBusy(true);
    setError('');
    try {
      if (local) {
        await localBackend(demo ? demoSeed : emptySeed).createHousehold(house.trim() || 'Nossa casa', name.trim());
      } else if (mode === 'create') await backend.createHousehold(house.trim() || 'Nossa casa', name.trim());
      else await backend.joinHousehold(code.trim(), name.trim());
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="brand">🏡</div>
      <h1>Bem-vindos!</h1>
      <p className="muted">
        {local ? 'Experimente o app. Os dados ficam só neste aparelho até a nuvem ser configurada.' : 'Crie a casa de vocês ou entre com o código que seu par compartilhou.'}
      </p>
      <form className="auth-form" onSubmit={(e) => submit(e)}>
        {!local && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'create', label: 'Criar casa' },
              { value: 'join', label: 'Tenho um código' },
            ]}
          />
        )}
        <Field label="Seu nome">
          <input value={name} maxLength={40} placeholder="Ex.: João" onChange={(e) => setName(e.target.value)} />
        </Field>
        {mode === 'create' || local ? (
          <Field label="Nome da casa">
            <input value={house} maxLength={80} placeholder="Ex.: Casa João e Ana" onChange={(e) => setHouse(e.target.value)} />
          </Field>
        ) : (
          <Field label="Código de convite" hint="Está em Ajustes, no app de quem criou a casa.">
            <input value={code} autoCapitalize="characters" placeholder="Ex.: 7F3A9C21" onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </Field>
        )}
        {error && <p className="text-critical">{error}</p>}
        {local ? (
          <div className="stack-sm">
            <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={(e) => submit(e, true)}>
              Explorar com dados de exemplo
            </button>
            <button type="submit" className="btn btn-block" disabled={busy}>
              Começar do zero
            </button>
          </div>
        ) : (
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'create' ? 'Criar casa' : 'Entrar na casa'}
          </button>
        )}
      </form>
    </div>
  );
}

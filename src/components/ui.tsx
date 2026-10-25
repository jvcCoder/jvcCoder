import { useEffect, type ReactNode } from 'react';
import { addMonths, capitalize, monthLabel, type MonthKey } from '../lib/format';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <button type="button" className="link-btn" onClick={onClose}>
            Cancelar
          </button>
          <h2>{title}</h2>
          <span className="sheet-head-spacer" />
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function MonthSwitcher({ month, onChange, max }: { month: MonthKey; onChange: (m: MonthKey) => void; max?: MonthKey }) {
  const canNext = !max || month < max;
  return (
    <div className="month-switcher">
      <button type="button" aria-label="Mês anterior" onClick={() => onChange(addMonths(month, -1))}>
        ‹
      </button>
      <span>{capitalize(monthLabel(month))}</span>
      <button type="button" aria-label="Próximo mês" disabled={!canNext} onClick={() => onChange(addMonths(month, 1))}>
        ›
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={`segmented${small ? ' segmented-sm' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {(title || action) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Meter({ value, level, marker }: { value: number; level: 'good' | 'warning' | 'critical' | 'accent'; marker?: number }) {
  return (
    <div className={`meter meter-${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <div className="meter-fill" style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }} />
      {marker != null && marker > 0 && marker < 1 && <div className="meter-marker" style={{ left: `${marker * 100}%` }} title="Quanto do mês já passou" />}
    </div>
  );
}

const STATUS_ICON = { good: '✓', warning: '!', critical: '✕', info: 'i' } as const;

export function StatusDot({ tone }: { tone: keyof typeof STATUS_ICON }) {
  return (
    <span className={`status-dot status-${tone}`} aria-hidden="true">
      {STATUS_ICON[tone]}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Delta({ value, goodWhenUp, suffix }: { value: number; goodWhenUp: boolean; suffix?: string }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.005) return <span className="delta delta-flat">= {suffix}</span>;
  const up = value > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`delta ${good ? 'delta-good' : 'delta-bad'}`}>
      {up ? '▲' : '▼'} {Math.abs(value * 100).toFixed(0)}% {suffix}
    </span>
  );
}

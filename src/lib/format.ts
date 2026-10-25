const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

// O \u2060 impede a quebra de linha entre o sinal de menos e o valor.
export const money = (v: number) => brl.format(Number.isFinite(v) ? v : 0).replace('-', '-\u2060');
export const moneyCompact = (v: number) => (Math.abs(v) < 1000 ? money(Math.round(v)) : brlCompact.format(v).replace('-', '-\u2060'));
export const pct = (v: number, digits = 0) =>
  `${(Number.isFinite(v) ? v * 100 : 0).toFixed(digits).replace('.', ',')}%`;

/** Mês no formato "YYYY-MM". */
export type MonthKey = string;

export const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const monthOf = (isoDate: string): MonthKey => isoDate.slice(0, 7);
export const currentMonth = (): MonthKey => monthOf(todayISO());

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number);
  const total = y * 12 + (mo - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Quantos meses de `a` até `b` (b - a). */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return yb * 12 + mb - (ya * 12 + ma);
}

export function daysInMonth(m: MonthKey): number {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}

/** Data ISO para um dia do mês, respeitando meses curtos (dia 31 em fevereiro vira 28/29). */
export function dateInMonth(m: MonthKey, day: number): string {
  return `${m}-${pad(Math.min(day, daysInMonth(m)))}`;
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function monthLabel(m: MonthKey, withYear = true): string {
  const [y, mo] = m.split('-').map(Number);
  const name = MONTHS[mo - 1];
  return withYear ? `${name} ${y}` : name;
}

export function monthShort(m: MonthKey): string {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS_SHORT[mo - 1]}/${String(y).slice(2)}`;
}

export function dayLabel(iso: string): string {
  const today = todayISO();
  const d = new Date(`${iso}T12:00:00`);
  const yesterday = todayISO(new Date(Date.now() - 86400000));
  if (iso === today) return 'Hoje';
  if (iso === yesterday) return 'Ontem';
  const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Converte "1.234,56" ou "1234.56" em número. */
export function parseMoney(input: string): number {
  const s = input.trim().replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return Number(normalized);
}

export function uid(): string {
  return crypto.randomUUID();
}

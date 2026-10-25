import { useEffect, useState } from 'react';
import type { TooltipProps } from 'recharts';
import { money } from '../lib/format';

export interface ChartColors {
  series1: string;
  series2: string;
  positive: string;
  negative: string;
  grid: string;
  axis: string;
  muted: string;
  surface: string;
}

function read(): ChartColors {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    series1: v('--series-1'),
    series2: v('--series-2'),
    positive: v('--series-1'),
    negative: v('--diverging-neg'),
    grid: v('--grid'),
    axis: v('--axis'),
    muted: v('--text-muted'),
    surface: v('--surface'),
  };
}

/** Cores dos gráficos a partir dos tokens CSS, acompanhando o modo claro/escuro. */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColors(read());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return colors;
}

export const axisTick = (color: string) => ({ fill: color, fontSize: 11 });

export function MoneyTooltip({ active, payload, label, labelFormat }: TooltipProps<number, string> & { labelFormat?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{labelFormat ? labelFormat(String(label)) : label}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="chart-tooltip-row">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <strong>{money(Number(p.value))}</strong>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <span className={i.line ? 'legend-line' : 'swatch'} style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

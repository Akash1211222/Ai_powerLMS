'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Holographic data-viz palette (matches the design tokens). */
export const CHART_COLORS = ['#2563eb', '#f97316', '#0ea5e9', '#f59e0b', '#10b981', '#1552c9'];

function GlassTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-panel px-3 py-2 text-xs shadow-card">
      {label != null && <div className="mb-1 font-bold text-ink">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 font-semibold text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
}

export interface SliceDatum {
  name: string;
  value: number;
  color?: string;
}

/** Donut / pie chart with an optional big number in the middle. */
export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerSub,
}: {
  data: SliceDatum[];
  height?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={3}
            cornerRadius={6}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<GlassTooltip />} />
          <Legend
            verticalAlign="bottom"
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span className="text-xs font-semibold text-faint">{v}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-7">
        <span className="font-display text-2xl font-extrabold text-ink">
          {centerLabel ?? total}
        </span>
        {centerSub && <span className="text-[11px] font-semibold text-faint">{centerSub}</span>}
      </div>
    </div>
  );
}

export interface BarSeries {
  key: string;
  name?: string;
  color?: string;
}

/** Rounded, gradient-filled bar chart. */
export function BarsChart({
  data,
  xKey,
  bars,
  height = 240,
  yMax,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  bars: BarSeries[];
  height?: number;
  yMax?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barCategoryGap="28%">
          <defs>
            {bars.map((b, i) => {
              const c = b.color ?? CHART_COLORS[i % CHART_COLORS.length];
              return (
                <linearGradient key={b.key} id={`bar-${b.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={c} stopOpacity={0.55} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(15,30,61,0.10)" strokeDasharray="4 6" />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--fca-faint)' }}
          />
          <YAxis
            width={32}
            tickLine={false}
            axisLine={false}
            domain={yMax ? [0, yMax] : undefined}
            tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--fca-faint)' }}
          />
          <Tooltip content={<GlassTooltip />} cursor={{ fill: 'rgba(37,99,235,0.06)' }} />
          {bars.length > 1 && (
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => <span className="text-xs font-semibold text-faint">{v}</span>}
            />
          )}
          {bars.map((b, i) => (
            <Bar
              key={b.key}
              dataKey={b.key}
              name={b.name ?? b.key}
              fill={`url(#bar-${b.key})`}
              radius={[8, 8, 2, 2]}
              maxBarSize={42}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Smooth gradient area chart for trends over time. */
export function AreaTrend({
  data,
  xKey,
  yKey,
  name,
  color = '#2563eb',
  height = 240,
  yMax,
}: {
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKey: string;
  name?: string;
  color?: string;
  height?: number;
  yMax?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id={`area-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(15,30,61,0.10)" strokeDasharray="4 6" />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--fca-faint)' }}
          />
          <YAxis
            width={32}
            tickLine={false}
            axisLine={false}
            domain={yMax ? [0, yMax] : undefined}
            tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--fca-faint)' }}
          />
          <Tooltip content={<GlassTooltip />} />
          <Area
            type="monotone"
            dataKey={yKey}
            name={name ?? yKey}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#area-${yKey})`}
            dot={{ r: 3, strokeWidth: 2, fill: '#fff' }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Circular percentage gauge (0–100). */
export function RadialGauge({
  percent,
  label,
  color = '#2563eb',
  size = 132,
}: {
  percent: number;
  label?: string;
  color?: string;
  size?: number;
}) {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="72%"
          outerRadius="100%"
          data={[{ value }]}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            cornerRadius={12}
            fill={color}
            background={{ fill: 'var(--fca-track)' }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-extrabold text-ink">{value}%</span>
        {label && <span className="text-[10px] font-semibold text-faint">{label}</span>}
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { cn } from "@/lib/utils";

/** Padrão de módulo: cabeçalho, KPIs semafóricos e gráficos operacionais. */

export type Tone = "neutral" | "ok" | "warn" | "crit" | "info";

const toneVar: Record<Tone, string> = {
  neutral: "var(--muted-foreground)",
  ok: "var(--success)",
  warn: "var(--warning)",
  crit: "var(--destructive)",
  info: "var(--primary)",
};

export function ModuleHeader({
  code,
  group,
  title,
  description,
  actions,
}: {
  code: string;
  group: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sst-mod-header">
      <div className="min-w-0">
        <p className="sst-mod-crumb">
          <span className="sst-mod-code">{code}</span>
          {group}
        </p>
        <h1>{title}</h1>
        {description && <p className="sst-mod-desc">{description}</p>}
      </div>
      {actions && <div className="sst-mod-actions">{actions}</div>}
    </header>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="sst-kpi-grid">{children}</div>;
}

export function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  progress,
  spark,
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  /** 0-100 */
  progress?: number;
  spark?: number[];
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="sst-kpi-top">
        <span className="sst-kpi-label">{label}</span>
        {icon && <span className="sst-kpi-icon">{icon}</span>}
      </div>
      <div className="sst-kpi-value">{value}</div>
      {typeof progress === "number" && (
        <div className="sst-kpi-bar" aria-hidden>
          <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
      {spark && spark.length > 1 && <Sparkline data={spark} />}
      {hint && <p className="sst-kpi-hint">{hint}</p>}
    </>
  );
  const cls = cn("sst-kpi", `is-${tone}`, active && "is-active", onClick && "is-clickable");
  const style = { "--kpi-tone": toneVar[tone] } as React.CSSProperties;
  return onClick ? (
    <button type="button" className={cls} style={style} onClick={onClick} aria-pressed={active}>
      {body}
    </button>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 100;
  const h = 24;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`)
    .join(" ");
  return (
    <svg className="sst-kpi-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--kpi-tone)" strokeWidth="1.5" />
    </svg>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("sst-chart-card", className)}>
      <header>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="sst-chart-body">{children}</div>
    </section>
  );
}

export function ChartRow({ children }: { children: ReactNode }) {
  return <div className="sst-chart-row">{children}</div>;
}

export interface Slice {
  label: string;
  value: number;
  tone: Tone;
}

export function StatusDonut({ data, centerLabel }: { data: Slice[]; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = total
    ? data.filter((d) => d.value > 0)
    : [{ label: "Sem dados", value: 1, tone: "neutral" as Tone }];
  return (
    <div className="sst-donut">
      <div className="sst-donut-chart">
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="label"
              innerRadius={48}
              outerRadius={68}
              strokeWidth={0}
              isAnimationActive={false}
            >
              {shown.map((d) => (
                <Cell key={d.label} fill={toneVar[d.tone]} />
              ))}
            </Pie>
            {total > 0 && <Tooltip />}
          </PieChart>
        </ResponsiveContainer>
        <div className="sst-donut-center">
          <strong>{total}</strong>
          <span>{centerLabel ?? "total"}</span>
        </div>
      </div>
      <ul className="sst-legend">
        {data.map((d) => (
          <li key={d.label}>
            <i style={{ background: toneVar[d.tone] }} />
            <span>{d.label}</span>
            <b>{d.value}</b>
            <em>{total ? Math.round((d.value / total) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendBars({
  data,
  tone = "info",
  height = 170,
}: {
  data: { label: string; value: number }[];
  tone?: Tone;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
        />
        <Tooltip cursor={{ fill: "var(--muted)" }} />
        <Bar
          dataKey="value"
          name="Quantidade"
          fill={toneVar[tone]}
          radius={[3, 3, 0, 0]}
          maxBarSize={34}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RankList({
  items,
  tone = "info",
}: {
  items: { label: string; value: number }[];
  tone?: Tone;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <p className="sst-empty-note">Sem dados no período.</p>;
  return (
    <ol className="sst-rank">
      {items.map((i) => (
        <li key={i.label}>
          <span className="sst-rank-label" title={i.label}>
            {i.label}
          </span>
          <span className="sst-rank-track">
            <span style={{ width: `${(i.value / max) * 100}%`, background: toneVar[tone] }} />
          </span>
          <b>{i.value}</b>
        </li>
      ))}
    </ol>
  );
}

/** Agrupa timestamps nos últimos N meses (rótulo "mmm"). */
export function lastMonths(timestamps: number[], n = 6, weights?: number[]) {
  const now = new Date();
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return {
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      value: 0,
    };
  });
  timestamps.forEach((t, idx) => {
    const d = new Date(t);
    const b = buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.value += weights?.[idx] ?? 1;
  });
  return buckets.map(({ label, value }) => ({ label, value }));
}

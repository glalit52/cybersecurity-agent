import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";

interface TrendPoint {
  date: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const SERIES = [
  { key: "critical", label: "Critical", varName: "--color-severity-critical" },
  { key: "high", label: "High", varName: "--color-severity-high" },
  { key: "medium", label: "Medium", varName: "--color-severity-medium" },
  { key: "low", label: "Low", varName: "--color-severity-low" },
] as const;

function resolveVar(varName: string): string {
  if (typeof window === "undefined") return "#999";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#999";
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border p-2.5 text-xs shadow-[var(--shadow-pop)]"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
    >
      <p className="mb-1.5 font-semibold" style={{ color: "var(--text)" }}>
        {label}
      </p>
      <div className="space-y-1">
        {SERIES.map((s) => {
          const entry = payload.find((p) => p.dataKey === s.key);
          if (!entry) return null;
          return (
            <div key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(${s.varName})` }}
                />
                {s.label}
              </span>
              <span className="font-mono font-medium" style={{ color: "var(--text)" }}>
                {entry.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FindingsTrendChart({ data }: { data: TrendPoint[] }) {
  // Resolve CSS custom properties to concrete hex at render time — SVG
  // fill doesn't accept var() reliably across all recharts render paths.
  const colors = useMemo(
    () => Object.fromEntries(SERIES.map((s) => [s.key, resolveVar(s.varName)])),
    [],
  );
  const muted = useMemo(() => resolveVar("--text-faint"), []);
  const gridColor = useMemo(() => resolveVar("--border"), []);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: colors[s.key] }} />
            {s.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} barGap={2} barCategoryGap="20%" margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={gridColor} strokeDasharray="0" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: muted, fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: muted, fontSize: 11 }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: gridColor, opacity: 0.4 }} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={colors[s.key]}
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

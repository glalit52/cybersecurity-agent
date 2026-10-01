import type { CSSProperties, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "critical" | "high" | "medium" | "low" | "success" | "brand" | "outline";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-[var(--bg-sunken)] text-[var(--text-muted)] border-[var(--border)]",
  success: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400",
  brand: "bg-brand-500/10 text-brand-600 border-brand-500/20 dark:text-brand-300",
  outline: "bg-transparent text-[var(--text-muted)] border-[var(--border-strong)]",
  // critical/high/medium/low are styled via inline vars (severityStyle
  // below), not static classes — they reference the validated
  // --color-severity-* tokens in index.css so light/dark stay in sync
  // with the palette actually run through the dataviz skill's validator.
  critical: "",
  high: "",
  medium: "",
  low: "",
};

const SEVERITY_TONES = new Set<Tone>(["critical", "high", "medium", "low"]);

function severityStyle(tone: Tone): CSSProperties | undefined {
  if (!SEVERITY_TONES.has(tone)) return undefined;
  const varName = `--color-severity-${tone}`;
  return {
    color: `var(${varName})`,
    borderColor: `color-mix(in oklab, var(${varName}) 35%, transparent)`,
    background: `color-mix(in oklab, var(${varName}) 12%, transparent)`,
  };
}

export function Badge({
  tone = "neutral",
  className,
  style,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize leading-4",
        toneClasses[tone],
        className,
      )}
      style={{ ...severityStyle(tone), ...style }}
      {...props}
    />
  );
}

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

export function SeverityBadge({ severity }: { severity: string }) {
  const tone = SEVERITY_TONE[severity] ?? "neutral";
  return (
    <Badge tone={tone} className="gap-1.5">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `var(--color-severity-${severity}, currentColor)` }}
      />
      {severity}
    </Badge>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  open: "critical",
  investigating: "medium",
  remediated: "success",
  accepted_risk: "outline",
  false_positive: "outline",
  proposed: "neutral",
  pending_approval: "medium",
  approved: "brand",
  rejected: "critical",
  executed: "success",
  failed: "critical",
  pending: "medium",
  locked: "brand",
  expired: "outline",
  intake: "neutral",
  in_progress: "brand",
  pending_review: "medium",
  completed: "success",
  archived: "outline",
  running: "brand",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>;
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "neutral" | "critical" | "success" | "brand";
  trend?: { direction: "up" | "down" | "flat"; label: string };
}

const toneRing: Record<NonNullable<StatCardProps["tone"]>, string> = {
  neutral: "bg-[var(--bg-sunken)] text-[var(--text-muted)]",
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  brand: "bg-brand-500/10 text-brand-600 dark:text-brand-300",
};

export function StatCard({ label, value, icon: Icon, tone = "neutral", trend }: StatCardProps) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
            {value}
          </p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", toneRing[tone])}>
          <Icon size={18} strokeWidth={2} />
        </div>
      </div>
      {trend && (
        <p
          className={cn(
            "mt-2 text-[11px] font-medium",
            trend.direction === "up" && "text-red-500",
            trend.direction === "down" && "text-emerald-500",
            trend.direction === "flat" && "text-[var(--text-faint)]",
          )}
        >
          {trend.label}
        </p>
      )}
    </Card>
  );
}

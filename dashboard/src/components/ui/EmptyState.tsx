import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: "var(--bg-sunken)" }}
      >
        <Icon className="h-5 w-5" style={{ color: "var(--text-faint)" }} />
      </div>
      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {description && (
        <p className="max-w-xs text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  );
}

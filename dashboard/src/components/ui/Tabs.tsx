import { cn } from "@/lib/utils";

interface TabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; count?: number }[];
}

export function Tabs<T extends string>({ value, onChange, items }: TabsProps<T>) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border p-1"
      style={{ borderColor: "var(--border)", background: "var(--bg-sunken)" }}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-[var(--bg-elevated)] text-[var(--text)] shadow-[var(--shadow-card)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] leading-none",
                  active ? "bg-brand-600/10 text-brand-600" : "bg-[var(--border)] text-[var(--text-faint)]",
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

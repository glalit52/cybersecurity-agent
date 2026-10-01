import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "@/store/theme-store";
import { isDemoMode } from "@/lib/supabase";
import { Badge } from "@/components/ui/Badge";

export function Topbar({ title, description }: { title: string; description?: string }) {
  const { theme, toggle } = useThemeStore();

  return (
    <header
      className="flex h-16 shrink-0 items-center justify-between border-b px-6"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      <div>
        <h1 className="text-base font-bold tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {description && (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isDemoMode && (
          <Badge tone="brand" title="No Supabase project configured — showing seeded demo data.">
            Demo data
          </Badge>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--bg-sunken)]"
          style={{ borderColor: "var(--border)" }}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white"
          title="Signed in as org admin"
        >
          AC
        </div>
      </div>
    </header>
  );
}

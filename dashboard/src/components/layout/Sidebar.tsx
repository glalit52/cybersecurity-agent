import { NavLink } from "react-router-dom";
import {
  ClipboardCheck,
  FileCheck2,
  LayoutDashboard,
  Plug,
  ShieldAlert,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApprovals } from "@/lib/queries";

const NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/cybersecurity", label: "Cybersecurity", icon: ShieldAlert },
  { to: "/compliance", label: "Compliance", icon: FileCheck2 },
  { to: "/playbooks", label: "Playbooks", icon: Workflow },
  { to: "/connectors", label: "Connectors", icon: Plug },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
];

export function Sidebar() {
  const { data: approvals } = useApprovals();
  const pendingCount = approvals?.filter((a) => a.status === "pending").length ?? 0;

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col border-r"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm shadow-brand-600/30">
          <ShieldCheck size={17} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight" style={{ color: "var(--text)" }}>
            Enterprise Trust Agent
          </p>
          <p className="text-[11px] leading-tight" style={{ color: "var(--text-faint)" }}>
            Anvita AI
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const badge = item.to === "/approvals" ? pendingCount : undefined;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-600/10 text-brand-600 dark:text-brand-300"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text)]",
                )
              }
            >
              <item.icon size={16} strokeWidth={2} className="shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {!!badge && (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
        <p className="px-2 text-[11px] leading-snug" style={{ color: "var(--text-faint)" }}>
          Connectors → Evidence Graph → Reasoning → Orchestration → Action → Policy → Audit Trail
        </p>
      </div>
    </aside>
  );
}

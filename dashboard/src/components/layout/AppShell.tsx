import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

export function AppShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} description={description} />
        <main className="scrollbar-thin flex-1 overflow-y-auto p-6">
          <div className="animate-in mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

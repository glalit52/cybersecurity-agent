import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, PlayCircle, Radio, Workflow } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { usePlaybookRuns } from "@/lib/queries";
import { runPlaybook } from "@/lib/actions";
import { useToastStore } from "@/store/toast-store";
import { formatRelativeTime, titleCase } from "@/lib/utils";
import { PLAYBOOK_CATALOG } from "@/lib/types";

type CategoryFilter = "all" | "cybersecurity" | "compliance";

const TRIGGER_ICON = { manual: PlayCircle, scheduled: Calendar, event: Radio } as const;

export function Playbooks() {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const { data: runs } = usePlaybookRuns();
  const push = useToastStore((s) => s.push);
  const queryClient = useQueryClient();
  const [runningId, setRunningId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, cat }: { id: string; cat: "cybersecurity" | "compliance" }) => runPlaybook(id, cat),
    onMutate: ({ id }) => setRunningId(id),
    onSuccess: (_, { id }) => {
      push(`"${titleCase(id)}" run completed.`, "success");
      queryClient.invalidateQueries({ queryKey: ["playbook-runs"] });
      queryClient.invalidateQueries({ queryKey: ["findings"] });
    },
    onError: (err: Error) => push(err.message, "error"),
    onSettled: () => setRunningId(null),
  });

  const catalog = PLAYBOOK_CATALOG.filter((p) => category === "all" || p.category === category);
  const recentRuns = (runs ?? []).slice(0, 8);

  return (
    <AppShell
      title="Playbooks"
      description="The reusable procedures behind every cybersecurity and compliance workflow."
    >
      <Tabs<CategoryFilter>
        value={category}
        onChange={setCategory}
        items={[
          { value: "all", label: "All", count: PLAYBOOK_CATALOG.length },
          {
            value: "cybersecurity",
            label: "Cybersecurity",
            count: PLAYBOOK_CATALOG.filter((p) => p.category === "cybersecurity").length,
          },
          {
            value: "compliance",
            label: "Compliance",
            count: PLAYBOOK_CATALOG.filter((p) => p.category === "compliance").length,
          },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.map((p) => {
          const TriggerIcon = TRIGGER_ICON[p.trigger];
          const isRunning = mutation.isPending && runningId === p.id;
          return (
            <Card key={p.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
                    <TriggerIcon size={12} />
                    {titleCase(p.trigger)}
                  </div>
                  <CardTitle className="mt-1">{p.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-3 pt-0">
                <CardDescription className="leading-5">{p.description}</CardDescription>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={isRunning}
                  onClick={() => mutation.mutate({ id: p.id, cat: p.category })}
                  className="self-start"
                >
                  <PlayCircle size={14} />
                  Run now
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent runs</CardTitle>
            <CardDescription>Most recent executions across both categories</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentRuns.length === 0 ? (
            <EmptyState icon={Workflow} title="No playbook runs yet" />
          ) : (
            recentRuns.map((run) => (
              <div key={run.id} className="flex items-start justify-between gap-3 border-b pb-3 text-sm last:border-0 last:pb-0" style={{ borderColor: "var(--border)" }}>
                <div className="min-w-0">
                  <p className="font-medium" style={{ color: "var(--text)" }}>{titleCase(run.playbook_id)}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{run.summary}</p>
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {run.findings_created} finding(s) created · {run.gaps_flagged} gap(s) flagged · {formatRelativeTime(run.started_at)}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

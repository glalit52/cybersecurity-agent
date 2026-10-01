import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, XCircle } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { useApprovals, useComplianceQuestions, useRemediations } from "@/lib/queries";
import { resolveApproval } from "@/lib/actions";
import { useToastStore } from "@/store/toast-store";
import { formatRelativeTime, titleCase } from "@/lib/utils";

export function Approvals() {
  const { data: approvals, isLoading } = useApprovals();
  const { data: remediations } = useRemediations();
  const { data: questions } = useComplianceQuestions();
  const push = useToastStore((s) => s.push);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approved" | "rejected" }) =>
      resolveApproval(id, decision),
    onSuccess: (_, { decision }) => {
      push(`Request ${decision}.`, decision === "approved" ? "success" : "info");
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      queryClient.invalidateQueries({ queryKey: ["remediations"] });
    },
    onError: (err: Error) => push(err.message, "error"),
  });

  const remediationById = new Map((remediations ?? []).map((r) => [r.id, r]));
  const questionById = new Map((questions ?? []).map((q) => [q.id, q]));

  const pending = (approvals ?? []).filter((a) => a.status === "pending");
  const resolved = (approvals ?? []).filter((a) => a.status !== "pending").slice(0, 10);

  return (
    <AppShell
      title="Approvals"
      description="Every action that touches a live system waits here for a human decision."
    >
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pending</CardTitle>
            <CardDescription>Claim-and-resolve — the first approver to act wins the request</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
          ) : pending.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing pending" description="All caught up." />
          ) : (
            pending.map((a) => {
              const remediation = a.ref_type === "remediation_action" ? remediationById.get(a.ref_id) : undefined;
              const question = a.ref_type === "compliance_answer" ? questionById.get(a.ref_id) : undefined;
              const isActing = mutation.isPending && mutation.variables?.id === a.id;
              return (
                <div
                  key={a.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                      {titleCase(a.ref_type)}
                    </p>
                    <p className="mt-0.5 text-sm font-medium" style={{ color: "var(--text)" }}>
                      {remediation?.description ?? question?.question_text ?? a.ref_id}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      Requested {formatRelativeTime(a.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={isActing && mutation.variables?.decision === "rejected"}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: a.id, decision: "rejected" })}
                    >
                      <XCircle size={14} /> Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={isActing && mutation.variables?.decision === "approved"}
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ id: a.id, decision: "approved" })}
                    >
                      <CheckCircle2 size={14} /> Approve
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recently resolved</CardTitle>
            <CardDescription>Last 10 approval decisions</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {resolved.length === 0 ? (
            <EmptyState icon={ClipboardCheck} title="No resolved approvals yet" />
          ) : (
            resolved.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate" style={{ color: "var(--text-muted)" }}>
                  {titleCase(a.ref_type)} · {formatRelativeTime(a.resolved_at ?? a.created_at)}
                </span>
                <StatusBadge status={a.status} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

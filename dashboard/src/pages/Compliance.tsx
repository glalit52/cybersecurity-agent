import { useState } from "react";
import { AlertCircle, CheckCircle2, FileCheck2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/Badge";
import { cn, formatDateTime, formatRelativeTime, titleCase } from "@/lib/utils";
import { useComplianceQuestions, useComplianceRequests } from "@/lib/queries";

export function Compliance() {
  const { data: requests, isLoading: requestsLoading } = useComplianceRequests();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const activeId = selectedId ?? requests?.[0]?.id ?? null;
  const { data: questions, isLoading: questionsLoading } = useComplianceQuestions(activeId ?? undefined);
  const activeRequest = requests?.find((r) => r.id === activeId);

  return (
    <AppShell
      title="Compliance"
      description="RFPs, security questionnaires, and audit/governance requests answered from the evidence graph."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Requests</CardTitle>
              <CardDescription>Intake through completion</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-1.5 px-2.5 pb-3">
            {requestsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
            ) : !requests?.length ? (
              <EmptyState icon={FileCheck2} title="No compliance requests" />
            ) : (
              requests.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "w-full rounded-lg px-3 py-2.5 text-left transition-colors",
                    r.id === activeId ? "bg-brand-600/10" : "hover:bg-[var(--bg-sunken)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                      {r.title}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>{titleCase(r.request_type)}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(r.updated_at)}</span>
                    {r.due_date && (
                      <>
                        <span>·</span>
                        <span>Due {r.due_date}</span>
                      </>
                    )}
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>{activeRequest ? activeRequest.title : "Questions"}</CardTitle>
              <CardDescription>
                {activeRequest
                  ? "Answered from the evidence graph; gaps are flagged for human follow-up"
                  : "Select a request to see its questions"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeId ? (
              <EmptyState icon={FileCheck2} title="No request selected" />
            ) : questionsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : !questions?.length ? (
              <EmptyState icon={FileCheck2} title="No questions yet" />
            ) : (
              questions.map((q) => (
                <div
                  key={q.id}
                  className="rounded-lg border p-3.5"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {q.question_text}
                    </p>
                    {q.flagged_gap ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        <AlertCircle size={13} /> Gap
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 size={13} /> Answered
                      </span>
                    )}
                  </div>
                  {q.answer_text ? (
                    <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                      {q.answer_text}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-sm" style={{ color: "var(--text-faint)" }}>
                      {q.gap_reason ?? "No answer found."}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
                    {q.confidence !== null && <span>Confidence {Math.round(q.confidence * 100)}%</span>}
                    {q.evidence_node_ids.length > 0 && (
                      <span>{q.evidence_node_ids.length} evidence citation(s)</span>
                    )}
                    {q.answered_at && <span>Answered {formatDateTime(q.answered_at)}</span>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

import { AlertTriangle, ClipboardCheck, Plug, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { FindingsTrendChart } from "@/components/charts/FindingsTrendChart";
import { useApprovals, useConnectors, useFindings, usePlaybookRuns } from "@/lib/queries";
import { findingsTrend, severityBreakdown } from "@/lib/mock-data";
import { formatRelativeTime, titleCase } from "@/lib/utils";

export function Overview() {
  const { data: findings, isLoading: findingsLoading } = useFindings();
  const { data: approvals } = useApprovals();
  const { data: connectors } = useConnectors();
  const { data: runs } = usePlaybookRuns();

  const breakdown = severityBreakdown(findings ?? []);
  const pendingApprovals = approvals?.filter((a) => a.status === "pending").length ?? 0;
  const activeConnectors = connectors?.filter((c) => c.enabled).length ?? 0;
  const recentFindings = (findings ?? []).slice(0, 6);
  const recentRuns = (runs ?? []).slice(0, 5);

  return (
    <AppShell
      title="Overview"
      description="Cybersecurity and compliance posture across every connected system."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open critical/high findings"
          value={breakdown.critical + breakdown.high}
          icon={ShieldAlert}
          tone="critical"
          trend={{ direction: "flat", label: `${breakdown.critical} critical · ${breakdown.high} high` }}
        />
        <StatCard
          label="Pending approvals"
          value={pendingApprovals}
          icon={ClipboardCheck}
          tone={pendingApprovals > 0 ? "critical" : "success"}
          trend={{ direction: "flat", label: "Awaiting human decision" }}
        />
        <StatCard
          label="Active connectors"
          value={`${activeConnectors}/${connectors?.length ?? 0}`}
          icon={Plug}
          tone="brand"
          trend={{ direction: "flat", label: "Enabled for this organization" }}
        />
        <StatCard
          label="Playbook runs (recent)"
          value={runs?.length ?? 0}
          icon={AlertTriangle}
          tone="neutral"
          trend={{ direction: "flat", label: `${runs?.filter((r) => r.status === "failed").length ?? 0} failed` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Findings trend</CardTitle>
              <CardDescription>Open findings detected per day, by severity</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FindingsTrendChart data={findingsTrend()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent playbook runs</CardTitle>
              <CardDescription>Across cybersecurity and compliance</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRuns.length === 0 && (
              <EmptyState icon={AlertTriangle} title="No playbook runs yet" />
            )}
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium" style={{ color: "var(--text)" }}>
                    {titleCase(run.playbook_id)}
                  </p>
                  <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {run.summary}
                  </p>
                </div>
                <StatusBadge status={run.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent findings</CardTitle>
            <CardDescription>Latest signals across every connected security tool</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {findingsLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : recentFindings.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState icon={ShieldAlert} title="No findings" description="Nothing detected yet." />
            </div>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Severity</TH>
                  <TH>Summary</TH>
                  <TH>Connector</TH>
                  <TH>Status</TH>
                  <TH>Detected</TH>
                </tr>
              </THead>
              <TBody>
                {recentFindings.map((f) => (
                  <TR key={f.id}>
                    <TD><SeverityBadge severity={f.severity} /></TD>
                    <TD className="max-w-md truncate">{f.summary}</TD>
                    <TD className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {titleCase(f.connector)}
                    </TD>
                    <TD><StatusBadge status={f.status} /></TD>
                    <TD className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                      {formatRelativeTime(f.detected_at)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

import { useState } from "react";
import { ShieldAlert, Wrench } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeverityBadge, StatusBadge } from "@/components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { useFindings, useRemediations } from "@/lib/queries";
import { formatRelativeTime, titleCase } from "@/lib/utils";

type SubTab = "findings" | "remediations";

export function Cybersecurity() {
  const [tab, setTab] = useState<SubTab>("findings");
  const { data: findings, isLoading: findingsLoading } = useFindings();
  const { data: remediations, isLoading: remediationsLoading } = useRemediations();

  return (
    <AppShell
      title="Cybersecurity"
      description="Findings and proposed remediations across every connected security tool."
    >
      <Tabs<SubTab>
        value={tab}
        onChange={setTab}
        items={[
          { value: "findings", label: "Findings", count: findings?.length },
          { value: "remediations", label: "Remediations", count: remediations?.length },
        ]}
      />

      {tab === "findings" && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Security findings</CardTitle>
              <CardDescription>Correlated signals from SIEM, EDR, vulnerability, and cloud connectors</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {findingsLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !findings?.length ? (
              <div className="px-5 pb-5">
                <EmptyState icon={ShieldAlert} title="No findings" description="Nothing detected yet." />
              </div>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Severity</TH>
                    <TH>Summary</TH>
                    <TH>Resource</TH>
                    <TH>Connector</TH>
                    <TH>Status</TH>
                    <TH>Detected</TH>
                  </tr>
                </THead>
                <TBody>
                  {findings.map((f) => (
                    <TR key={f.id}>
                      <TD><SeverityBadge severity={f.severity} /></TD>
                      <TD className="max-w-sm truncate">{f.summary}</TD>
                      <TD className="max-w-[220px] truncate font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {f.resource_ref}
                      </TD>
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
      )}

      {tab === "remediations" && (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle>Remediation actions</CardTitle>
              <CardDescription>Proposed and executed fixes — approvals happen in the Approvals tab</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {remediationsLoading ? (
              <div className="space-y-2 px-5 pb-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !remediations?.length ? (
              <div className="px-5 pb-5">
                <EmptyState icon={Wrench} title="No remediation actions" />
              </div>
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Action</TH>
                    <TH>Description</TH>
                    <TH>Status</TH>
                    <TH>Auto-approved</TH>
                    <TH>Created</TH>
                  </tr>
                </THead>
                <TBody>
                  {remediations.map((r) => (
                    <TR key={r.id}>
                      <TD className="whitespace-nowrap font-medium">{titleCase(r.action_type)}</TD>
                      <TD className="max-w-md truncate">{r.description}</TD>
                      <TD><StatusBadge status={r.status} /></TD>
                      <TD style={{ color: "var(--text-muted)" }}>{r.auto_approved ? "Yes" : "No"}</TD>
                      <TD className="whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {formatRelativeTime(r.created_at)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}

// Read hooks. Each branches on isDemoMode: live mode queries Supabase
// directly (RLS scopes every row to the signed-in user's organization via
// the current_org_id() policy — see migration 0001), demo mode reads the
// zustand store seeded from mock-data.ts. Callers never need to know which.

import { useQuery } from "@tanstack/react-query";
import { isDemoMode, supabase } from "@/lib/supabase";
import { useDemoStore } from "@/store/demo-store";
import {
  MOCK_COMPLIANCE_QUESTIONS,
  MOCK_COMPLIANCE_REQUESTS,
  MOCK_FINDINGS,
} from "@/lib/mock-data";
import type {
  ApprovalRequest,
  ComplianceQuestion,
  ComplianceRequest,
  ConnectorConfig,
  PlaybookRun,
  RemediationAction,
  SecurityFinding,
} from "@/lib/types";

const REFRESH_MS = 30_000;

export function useFindings() {
  const demoFindings = MOCK_FINDINGS;
  return useQuery({
    queryKey: ["findings"],
    queryFn: async (): Promise<SecurityFinding[]> => {
      if (isDemoMode) return demoFindings;
      const { data, error } = await supabase!
        .from("security_findings")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as SecurityFinding[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function useRemediations() {
  const demoRemediations = useDemoStore((s) => s.remediations);
  return useQuery({
    queryKey: ["remediations", isDemoMode ? demoRemediations : null],
    queryFn: async (): Promise<RemediationAction[]> => {
      if (isDemoMode) return demoRemediations;
      const { data, error } = await supabase!
        .from("remediation_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as RemediationAction[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function useApprovals() {
  const demoApprovals = useDemoStore((s) => s.approvals);
  return useQuery({
    queryKey: ["approvals", isDemoMode ? demoApprovals : null],
    queryFn: async (): Promise<ApprovalRequest[]> => {
      if (isDemoMode) return demoApprovals;
      const { data, error } = await supabase!
        .from("approval_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as ApprovalRequest[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function useComplianceRequests() {
  return useQuery({
    queryKey: ["compliance-requests"],
    queryFn: async (): Promise<ComplianceRequest[]> => {
      if (isDemoMode) return MOCK_COMPLIANCE_REQUESTS;
      const { data, error } = await supabase!
        .from("compliance_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as ComplianceRequest[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function useComplianceQuestions(requestId?: string) {
  return useQuery({
    queryKey: ["compliance-questions", requestId ?? "all"],
    queryFn: async (): Promise<ComplianceQuestion[]> => {
      if (isDemoMode) {
        return requestId
          ? MOCK_COMPLIANCE_QUESTIONS.filter((q) => q.request_id === requestId)
          : MOCK_COMPLIANCE_QUESTIONS;
      }
      let query = supabase!.from("compliance_questions").select("*").order("created_at", {
        ascending: true,
      });
      if (requestId) query = query.eq("request_id", requestId);
      const { data, error } = await query;
      if (error) throw error;
      return data as ComplianceQuestion[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function useConnectors() {
  const demoConnectors = useDemoStore((s) => s.connectors);
  return useQuery({
    queryKey: ["connectors", isDemoMode ? demoConnectors : null],
    queryFn: async (): Promise<ConnectorConfig[]> => {
      if (isDemoMode) return demoConnectors;
      const { data, error } = await supabase!.from("connector_configs").select("*");
      if (error) throw error;
      return data as ConnectorConfig[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

export function usePlaybookRuns() {
  const demoRuns = useDemoStore((s) => s.playbookRuns);
  return useQuery({
    queryKey: ["playbook-runs", isDemoMode ? demoRuns : null],
    queryFn: async (): Promise<PlaybookRun[]> => {
      if (isDemoMode) return demoRuns;
      const { data, error } = await supabase!
        .from("playbook_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as PlaybookRun[];
    },
    refetchInterval: isDemoMode ? false : REFRESH_MS,
  });
}

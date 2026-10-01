import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plug } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConnectors } from "@/lib/queries";
import { toggleConnector } from "@/lib/actions";
import { useToastStore } from "@/store/toast-store";
import { CONNECTOR_CATALOG } from "@/lib/types";
import { formatRelativeTime } from "@/lib/utils";

export function Connectors() {
  const { data: connectors, isLoading } = useConnectors();
  const push = useToastStore((s) => s.push);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ type, next }: { type: string; next: boolean }) => toggleConnector(type, next),
    onSuccess: (_, { type, next }) => {
      push(`${CONNECTOR_CATALOG.find((c) => c.id === type)?.label ?? type} ${next ? "enabled" : "disabled"}.`, "success");
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
    },
    onError: (err: Error) => push(err.message, "error"),
  });

  const byType = new Map((connectors ?? []).map((c) => [c.connector_type, c]));

  return (
    <AppShell
      title="Connectors"
      description="Enable the security and compliance tools this organization has access to."
    >
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : !connectors?.length ? (
        <EmptyState icon={Plug} title="No connectors configured" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTOR_CATALOG.map((catalogEntry) => {
            const config = byType.get(catalogEntry.id);
            const enabled = config?.enabled ?? false;
            return (
              <Card key={catalogEntry.id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{catalogEntry.label}</CardTitle>
                    <CardDescription className="mt-1">
                      {config?.last_sync_at
                        ? `Last synced ${formatRelativeTime(config.last_sync_at)}`
                        : "Never synced"}
                    </CardDescription>
                  </div>
                  <Switch
                    checked={enabled}
                    disabled={mutation.isPending}
                    onChange={(next) => mutation.mutate({ type: catalogEntry.id, next })}
                    aria-label={`Toggle ${catalogEntry.label}`}
                  />
                </CardHeader>
                <CardContent>
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-medium"
                    style={{ color: enabled ? "var(--color-success)" : "var(--text-faint)" }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: enabled ? "var(--color-success)" : "var(--text-faint)" }}
                    />
                    {enabled ? "Enabled" : "Disabled"}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

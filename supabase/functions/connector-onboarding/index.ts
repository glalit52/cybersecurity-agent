// Connector Onboarding — HTTP entrypoint for enabling/disabling connectors
// per org. Shared by both agents (a connector like github-security feeds
// Cybersecurity findings AND is cited as evidence-graph source_connector
// for Compliance answers), so this is its own function rather than living
// inside either agent. See ../_shared/connector-configs.ts for the
// enablement logic and why it exists.

import "../_shared/connectors/register-all.ts";
import { listConnectors } from "../_shared/connectors/base.ts";
import { listConnectorConfigs, enableConnector, disableConnector } from "../_shared/connector-configs.ts";

interface OnboardingRequest {
  action: "list" | "enable" | "disable";
  organizationId: string;
  actorId: string | null;
  params: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  try {
    const body: OnboardingRequest = await req.json();
    const { action, organizationId, actorId, params } = body;

    switch (action) {
      case "list": {
        const registered = listConnectors();
        const configs = await listConnectorConfigs(organizationId);
        const configById = new Map(configs.map((c) => [c.connectorType, c]));

        return Response.json({
          connectors: registered.map((c) => {
            const cfg = configById.get(c.id);
            return {
              id: c.id,
              enabled: cfg?.enabled ?? false,
              lastSyncAt: cfg?.lastSyncAt ?? null,
              hasCredential: Boolean(cfg?.credentialRef),
            };
          }),
        });
      }

      case "enable": {
        const connectorId = String(params.connectorId ?? "");
        if (!listConnectors().some((c) => c.id === connectorId)) {
          return Response.json(
            { error: `Unknown connector "${connectorId}". See action:"list" for valid ids.` },
            { status: 400 },
          );
        }
        const { connectorId: _drop, credentialRef, ...config } = params;
        await enableConnector(organizationId, connectorId, {
          config,
          credentialRef: credentialRef as string | undefined,
          actorId,
        });
        return Response.json({ ok: true, connectorId, enabled: true });
      }

      case "disable": {
        const connectorId = String(params.connectorId ?? "");
        await disableConnector(organizationId, connectorId, actorId);
        return Response.json({ ok: true, connectorId, enabled: false });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err) {
    console.error("connector-onboarding error:", err);
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});

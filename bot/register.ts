// Single entrypoint the real bot backend imports to wire in both new
// agents' commands. Example (in the real bot repo):
//
//   import { registerEnterpriseTrustAgentCommands } from "./cybersecurity-agent-scaffold/bot/register.ts";
//   registerEnterpriseTrustAgentCommands(router.registerCommand);

import { registerCyberCommands } from "./commands/cyber.ts";
import { registerComplianceCommands } from "./commands/compliance.ts";
import type { CommandHandler } from "./router-types.ts";

export function registerEnterpriseTrustAgentCommands(
  registerCommand: (name: string, handler: CommandHandler) => void,
) {
  registerCyberCommands(registerCommand);
  registerComplianceCommands(registerCommand);
}

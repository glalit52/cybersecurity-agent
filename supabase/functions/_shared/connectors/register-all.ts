// Side-effect import: registers every connector. Both agent HTTP
// entrypoints (and any playbook module, since Deno Edge Functions each run
// in their own isolated process — connector registration doesn't persist
// across functions) import this so getConnector() always resolves
// regardless of which function is handling the request.

import { registerConnector } from "./base.ts";
import { AwsSecurityHubConnector } from "./aws-security-hub.ts";
import { GitHubSecurityConnector } from "./github-security.ts";
import { SiemWebhookConnector } from "./siem-webhook.ts";
import { MicrosoftSentinelConnector } from "./microsoft-sentinel.ts";
import { CrowdStrikeFalconConnector } from "./crowdstrike-falcon.ts";
import { TenableIoConnector } from "./tenable-io.ts";

[
  new AwsSecurityHubConnector(),
  new GitHubSecurityConnector(),
  new SiemWebhookConnector(),
  new MicrosoftSentinelConnector(),
  new CrowdStrikeFalconConnector(),
  new TenableIoConnector(),
].forEach(registerConnector);

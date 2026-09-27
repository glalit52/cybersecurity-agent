// Only the registry (register/get/list) is unit-tested here — runPlaybook()
// writes to playbook_runs via the DB client and belongs in an integration
// test against a real (or locally-running) Supabase instance, not a unit
// test.

import { assertEquals } from "@std/assert";
import { getPlaybook, listPlaybooks, Playbook, registerPlaybook } from "./base.ts";

function fakePlaybook(id: string, category: Playbook["category"]): Playbook {
  return {
    id,
    category,
    title: `Test playbook ${id}`,
    description: "A fake playbook for registry unit tests.",
    trigger: "manual",
    run: () => Promise.resolve({ summary: "ok", data: {} }),
  };
}

Deno.test("registerPlaybook makes a playbook resolvable by id", () => {
  const playbook = fakePlaybook("test-only-registry-playbook", "cybersecurity");
  registerPlaybook(playbook);
  assertEquals(getPlaybook("test-only-registry-playbook"), playbook);
});

Deno.test("getPlaybook returns undefined for an unregistered id", () => {
  assertEquals(getPlaybook("definitely-not-registered"), undefined);
});

Deno.test("listPlaybooks with no filter includes every registered playbook", () => {
  const playbook = fakePlaybook("test-only-listed-playbook", "compliance");
  registerPlaybook(playbook);
  assertEquals(listPlaybooks().some((p) => p.id === playbook.id), true);
});

Deno.test("listPlaybooks filters by category", () => {
  const cyber = fakePlaybook("test-only-cyber-filter", "cybersecurity");
  const compliance = fakePlaybook("test-only-compliance-filter", "compliance");
  registerPlaybook(cyber);
  registerPlaybook(compliance);

  const cyberOnly = listPlaybooks("cybersecurity");
  assertEquals(cyberOnly.some((p) => p.id === cyber.id), true);
  assertEquals(cyberOnly.some((p) => p.id === compliance.id), false);
});

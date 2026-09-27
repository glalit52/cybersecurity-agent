import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { getConnector, listConnectors, registerConnector, StubConnector } from "./base.ts";

class FakeConnector extends StubConnector {
  readonly id = "test-only-fake-connector";
}

Deno.test("registerConnector makes a connector resolvable by id", () => {
  const connector = new FakeConnector();
  registerConnector(connector);
  assertEquals(getConnector("test-only-fake-connector"), connector);
});

Deno.test("getConnector returns undefined for an unregistered id", () => {
  assertEquals(getConnector("definitely-not-registered"), undefined);
});

Deno.test("listConnectors includes a registered connector", () => {
  const connector = new FakeConnector();
  registerConnector(connector);
  assertEquals(listConnectors().some((c) => c.id === connector.id), true);
});

Deno.test("re-registering the same id replaces rather than duplicates", () => {
  registerConnector(new FakeConnector());
  registerConnector(new FakeConnector());
  const matches = listConnectors().filter((c) => c.id === "test-only-fake-connector");
  assertEquals(matches.length, 1);
});

Deno.test("StubConnector default methods report unimplemented rather than pretending to succeed", async () => {
  const connector = new FakeConnector();
  const signals = await connector.fetchSignals("org-1");
  assertEquals(signals, []);

  const action = await connector.executeAction("org-1", { actionType: "revoke_access", resourceRef: "r", parameters: {} });
  assertEquals(action.success, false);

  const verification = await connector.verifyFact("org-1", "some fact");
  assertEquals(verification.verified, false);
});

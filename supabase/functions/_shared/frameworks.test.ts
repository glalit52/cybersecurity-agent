import { assertEquals } from "jsr:@std/assert@^1.0.0";
import { REFERENCE_CONTROLS } from "./frameworks.ts";

Deno.test("every control has a unique frameworkId:controlRef pair", () => {
  const refs = REFERENCE_CONTROLS.map((c) => `${c.frameworkId}:${c.controlRef}`);
  const unique = new Set(refs);
  assertEquals(unique.size, refs.length);
});

Deno.test("every control has at least one keyword (otherwise it can never match)", () => {
  const withoutKeywords = REFERENCE_CONTROLS.filter((c) => c.keywords.length === 0);
  assertEquals(withoutKeywords, []);
});

Deno.test("every control has a non-empty title", () => {
  const withoutTitle = REFERENCE_CONTROLS.filter((c) => c.title.trim().length === 0);
  assertEquals(withoutTitle, []);
});

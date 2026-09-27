import { assertEquals } from "@std/assert";
import { splitIntoQuestions } from "./question-extraction.ts";

Deno.test("splits a numbered list into individual questions", () => {
  const input = `1. Do you encrypt data at rest?
2. Do you have a SOC 2 report?
3. Describe your incident response process and how quickly you notify customers of a breach.`;

  assertEquals(splitIntoQuestions(input), [
    "Do you encrypt data at rest?",
    "Do you have a SOC 2 report?",
    "Describe your incident response process and how quickly you notify customers of a breach.",
  ]);
});

Deno.test("splits a bulleted list", () => {
  const input = `- What is your data retention policy?
- Do you perform annual penetration testing?`;

  assertEquals(splitIntoQuestions(input), [
    "What is your data retention policy?",
    "Do you perform annual penetration testing?",
  ]);
});

Deno.test("does not bleed an unrelated line into a completed question", () => {
  // Regression test: an earlier version left a completed ("?"-terminated)
  // question "open," so the next line (a heading with no marker and no
  // "?") got silently appended to it instead of being dropped.
  const input = `Section 3: Security
Do you encrypt customer data at rest?
Do you encrypt data in transit?
This is a heading with no question mark`;

  assertEquals(splitIntoQuestions(input), [
    "Do you encrypt customer data at rest?",
    "Do you encrypt data in transit?",
  ]);
});

Deno.test("accumulates a list item wrapped across multiple lines", () => {
  const input = `1. Please describe your process for
   granting and revoking employee access
   to production systems.
2. Do you use MFA for all admin accounts?`;

  assertEquals(splitIntoQuestions(input), [
    "Please describe your process for granting and revoking employee access to production systems.",
    "Do you use MFA for all admin accounts?",
  ]);
});

Deno.test("returns an empty array for empty input", () => {
  assertEquals(splitIntoQuestions(""), []);
});

Deno.test("drops items shorter than the minimum plausible-question length", () => {
  assertEquals(splitIntoQuestions("1. Yes?"), []);
});

Deno.test("de-dupes identical questions", () => {
  const input = `1. Do you encrypt data at rest?
2. Do you encrypt data at rest?`;

  assertEquals(splitIntoQuestions(input), ["Do you encrypt data at rest?"]);
});

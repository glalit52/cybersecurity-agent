import { assertEquals, assertRejects } from "@std/assert";
import { DocumentExtractionUnsupportedError, extractText } from "./document-extraction.ts";

const enc = new TextEncoder();

Deno.test("extracts plain text by content type", async () => {
  const result = await extractText(
    enc.encode("Do you encrypt data?\nDo you have SOC2?"),
    "text/plain",
    "q.txt",
  );
  assertEquals(result, { text: "Do you encrypt data?\nDo you have SOC2?", method: "plain-text" });
});

Deno.test("extracts CSV, normalizing delimiters to newlines", async () => {
  const result = await extractText(
    enc.encode("Q1,Q2\nDo you encrypt?,Do you audit?"),
    "text/csv",
    "q.csv",
  );
  assertEquals(result.method, "csv");
  assertEquals(result.text, "Q1\nQ2\nDo you encrypt?\nDo you audit?");
});

Deno.test("guesses content type from filename when contentType is null", async () => {
  const result = await extractText(enc.encode("hello"), null, "notes.md");
  assertEquals(result, { text: "hello", method: "plain-text" });
});

Deno.test("throws a typed error for unsupported formats instead of returning empty text", async () => {
  await assertRejects(
    () => extractText(enc.encode("%PDF-1.4 fake"), "application/pdf", "rfp.pdf"),
    DocumentExtractionUnsupportedError,
  );
});

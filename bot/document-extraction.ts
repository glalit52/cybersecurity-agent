// Extracts plain text from an uploaded RFP/questionnaire file. Handles
// plain text/CSV/TSV directly (real, no dependency needed). PDF and DOCX
// — the formats RFPs actually arrive in — are deliberately NOT
// reimplemented here: the existing platform already has a Document
// Processing Agent with an OCR + AI extraction pipeline (KYC, claims, SOP
// extraction per the delivered WBS); duplicating PDF/DOCX parsing in this
// scaffold would either reinvent that pipeline poorly or pull in a large
// dependency for a capability that already exists elsewhere in the
// product. Call that agent's extraction endpoint instead once this merges.

export interface ExtractedDocument {
  text: string;
  method: "plain-text" | "csv" | "external-document-agent";
}

const PLAIN_TEXT_TYPES = new Set(["text/plain", "text/markdown"]);
const CSV_TYPES = new Set(["text/csv", "text/tab-separated-values"]);

export async function extractText(
  bytes: Uint8Array,
  contentType: string | null,
  filename: string,
): Promise<ExtractedDocument> {
  const type = contentType ?? guessContentTypeFromFilename(filename);

  if (type && PLAIN_TEXT_TYPES.has(type)) {
    return { text: new TextDecoder().decode(bytes), method: "plain-text" };
  }

  if (type && CSV_TYPES.has(type)) {
    // Treat each cell as potential question text; callers run this through
    // splitIntoQuestions() anyway, which is tolerant of delimiter noise.
    return { text: new TextDecoder().decode(bytes).replace(/[,\t]/g, "\n"), method: "csv" };
  }

  // TODO(connector): route to the existing Document Processing Agent's
  // extraction endpoint for PDF/DOCX (and scanned/image-based
  // questionnaires, which need its OCR step). Throwing a clear, typed
  // error rather than silently returning empty text so callers can tell
  // the user what to do instead of getting a confusing "0 questions found."
  throw new DocumentExtractionUnsupportedError(
    `Cannot extract text from "${filename}" (${type ?? "unknown type"}) directly — ` +
      "this needs the platform's Document Processing Agent (PDF/DOCX/OCR pipeline), " +
      "not yet wired into this scaffold. Ask the user to paste the questions as text, " +
      "or upload a .txt/.csv export instead, in the meantime.",
  );
}

export class DocumentExtractionUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentExtractionUnsupportedError";
  }
}

function guessContentTypeFromFilename(filename: string): string | null {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "txt":
    case "md":
      return "text/plain";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    default:
      return null;
  }
}

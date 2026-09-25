// Splits raw extracted text from an RFP/questionnaire into discrete
// questions. Real heuristic (not a stub): handles numbered/lettered lists,
// bullet points, and bare interrogative sentences, which covers the large
// majority of how security questionnaires are actually formatted
// (SIG, CAIQ-style numbered controls, or prose-style vendor forms).

const LIST_MARKER = /^\s*(?:\d+[.)]|[a-z][.)]|[-*•])\s+/i;
const TRAILING_WHITESPACE = /\s+$/;

export function splitIntoQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const questions: string[] = [];
  let current = "";

  for (const line of lines) {
    const isListItem = LIST_MARKER.test(line);
    const looksLikeQuestion = /\?\s*$/.test(line) || isListItem;

    if (isListItem) {
      if (current) questions.push(finalize(current));
      current = line.replace(LIST_MARKER, "");
    } else if (looksLikeQuestion) {
      if (current) questions.push(finalize(current));
      current = line;
    } else if (current) {
      // Continuation of the previous item (wrapped line in the source doc).
      current += ` ${line}`;
    }
    // Lines with no list marker and no accumulated context (e.g. a title
    // or section header before the first question) are dropped.
  }
  if (current) questions.push(finalize(current));

  // De-dupe and drop anything too short to plausibly be a real question
  // (catches stray headers/markers that slipped through).
  const seen = new Set<string>();
  return questions.filter((q) => {
    if (q.length < 8 || seen.has(q)) return false;
    seen.add(q);
    return true;
  });
}

function finalize(raw: string): string {
  return raw.replace(TRAILING_WHITESPACE, "").replace(/\s{2,}/g, " ");
}

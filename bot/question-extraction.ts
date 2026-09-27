// Splits raw extracted text from an RFP/questionnaire into discrete
// questions. Real heuristic (not a stub): handles numbered/lettered lists,
// bullet points, and bare interrogative sentences, which covers the large
// majority of how security questionnaires are actually formatted
// (SIG, CAIQ-style numbered controls, or prose-style vendor forms).

const LIST_MARKER = /^\s*(?:\d+[.)]|[a-z][.)]|[-*•])\s+/i;
const TRAILING_WHITESPACE = /\s+$/;
const ENDS_WITH_QUESTION_MARK = /\?\s*$/;

export function splitIntoQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const questions: string[] = [];
  // Only a list item can stay "open" across wrapped lines — a list marker
  // unambiguously starts a new item, so everything until the next marker
  // safely belongs to it, even without terminal punctuation. A bare
  // interrogative sentence, once it hits its "?", is complete: nothing
  // should get glued onto it, so it's pushed immediately rather than left
  // open (an earlier version of this function left it open, which caused
  // the next unrelated line — e.g. a section heading — to be silently
  // appended to the previous question).
  let openListItem = "";

  const flushOpenListItem = () => {
    if (openListItem) {
      questions.push(finalize(openListItem));
      openListItem = "";
    }
  };

  for (const line of lines) {
    const isListItem = LIST_MARKER.test(line);
    const endsWithQuestionMark = ENDS_WITH_QUESTION_MARK.test(line);

    if (isListItem) {
      flushOpenListItem();
      const content = line.replace(LIST_MARKER, "");
      if (endsWithQuestionMark) {
        questions.push(finalize(content));
      } else {
        openListItem = content;
      }
    } else if (openListItem) {
      openListItem += ` ${line}`;
      if (endsWithQuestionMark) flushOpenListItem();
    } else if (endsWithQuestionMark) {
      questions.push(finalize(line));
    }
    // Otherwise: no list marker, no open item, no "?" — a title or section
    // header with nothing to attach it to. Dropped.
  }
  flushOpenListItem();

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

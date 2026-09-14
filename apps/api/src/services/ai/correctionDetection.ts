/**
 * Task 12 — Guard B: explicit-correction detection.
 *
 * Deliberately narrow and deterministic (Task 11's own "no broad NLP"
 * finding) — a small, fixed set of Egyptian-Arabic correction markers, not
 * a general language-understanding capability. Same technique and
 * precedent as `toolRouting.ts`'s own `KEYWORD_RULES`: plain substring/
 * regex matching, no `\b` word-boundary anchors (JS regex word boundaries
 * are computed against ASCII `\w` and silently never match around Arabic
 * text — a real bug class already hit once in this project, per
 * `searchSuppliers.ts`'s own "Gap 2a" comment).
 *
 * This only detects THAT a correction happened in the current turn — it
 * deliberately does NOT attempt to extract the newly-named entity from the
 * message (no deterministic name extraction is attempted; no pattern here
 * is "extremely narrow and already-obvious" enough to justify one). The
 * caller (`aiAgentService.ts`) uses this signal only to refuse reuse of the
 * OLD context's entityId — never to guess the new one.
 */

const EXPLICIT_CORRECTION_PATTERNS: RegExp[] = [
  // "لا، قصدي ..." / "لا قصدي ..." / "لا، أقصد ..." / "لا أقصد ..."
  /لا،?\s*(قصدي|أقصد)/,
  // "مش <short gap> قصدي ..." / "مش <short gap>، قصدي ...". The gap is
  // capped at 60 chars so this can never scan an entire (up to 8000-char)
  // message hunting for a distant, unrelated "قصدي" — bounds both false
  // positives on long unrelated text and worst-case regex backtracking.
  /مش\s+[\s\S]{0,60}?قصدي/,
];

export function isExplicitCorrection(message: string): boolean {
  return EXPLICIT_CORRECTION_PATTERNS.some((pattern) => pattern.test(message));
}

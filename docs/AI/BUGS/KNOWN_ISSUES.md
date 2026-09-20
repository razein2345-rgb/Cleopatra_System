# Known Issues (Backlog — Not Yet Fixed)

Tracked issues that were found during other work but are intentionally left
untouched to keep that work's commits narrow and single-purpose. Each entry
states what was found, when, and why it wasn't fixed on the spot.

---

## Backend error messages leak raw English text to the UI

**Found:** Cutover / Opening State revision round (post-Phase-3D), while
reviewing the two new error classes `AlreadyConsumedExceedsRequirementError`
and `AlreadyConsumedWithoutCustomerOpeningError`.

**What's wrong:** `apps/web/src/lib/api.ts`'s request helpers
(`apiPost`/`apiPut`/etc.) throw `new Error(body.error.message)` directly —
the backend's raw `error.message` string, with **no translation or
`error.code`-based mapping**. Every backend error class across this entire
codebase (`PricingInputError`, `PartnerRequiredError`, `OpeningCreditExceededError`,
`CreditBelowConsumedError`, `PaymentNotFoundError`, and dozens more) has its
`.message` written in English. Whenever one of these reaches the UI without
the specific screen catching it by name and substituting its own Arabic
string, the end user sees raw English text — a direct violation of this
project's "zero English text anywhere in the system" rule
(see `feedback_arabic_only_ui` in project memory).

**Scope of this issue:** systemic, not specific to any one feature. It
predates the Cutover/Opening State work and affects every existing error
class in `apps/api/src/services/*.ts`.

**Why it wasn't fixed here:** the owner's explicit decision for this
revision round — only the errors newly introduced in this round
(`VerificationNotAllowedError`, `CustomerOpeningReferenceInvalidError`,
`AlreadyConsumedExceedsRequirementError`, `AlreadyConsumedWithoutCustomerOpeningError`)
were given Arabic messages, added at the controller layer via `instanceof`
checks (see `controllers/cutover.ts`, `controllers/openingState.ts`,
`controllers/orders.ts`). Every pre-existing error class keeps its English
message untouched, to keep this revision round's commits narrow and
scoped to Cutover/Opening State only — not a system-wide error-message
audit.

**What a real fix would look like (not scoped/estimated, for future
reference only):** either (a) a systematic pass giving every existing
service-layer error class its own Arabic message at the point it's already
caught in a controller's `handleServiceError`/inline `catch`, or (b) a
central translation layer keyed by `error.code` so the frontend never
needs to display `error.message` raw at all. Either approach touches a
large number of files across the whole API and is explicitly **out of
scope** for the Cutover/Opening State track.

---

## `getCompanyFinancialSummary`'s "time-basis fix" tests are flaky around Cairo midnight

**Found:** Cutover / Opening State revision round, Step 7 (Test B1), while
running the full API suite after adding the new B1 exclusion-guarantee
tests to `branchFinancialsService.test.ts`. Confirmed reproducible on this
machine at the time: local clock `2026-09-21 00:05 GMT+3`, real UTC time
`2026-09-20T21:05Z`, while `todayInBusinessTimezone()` (Cairo business day)
had already rolled over to `2026-09-21T00:00:00.000Z` — a ~3-hour window
where the machine's local calendar day and the Cairo business day disagree.

**What's wrong:** the three tests in the `getCompanyFinancialSummary —
time-basis fix (Phase B)` describe block (`includes a today order in BOTH
salesTotal and netProfit/realProfit`, `a mix of yesterday + today orders...`,
`netAfterDailyFixedCost compares TODAY profit...`) build their "today"
order fixture using bare `new Date()`. The production code they're testing
correctly buckets orders as "today" via `todayInBusinessTimezone()`
(`order.date < todayStart` in `branchFinancialsService.ts`) — but `new
Date()` in the test only reliably matches that bucket when the test
machine's real UTC clock and the Cairo business-day boundary agree on
what day it is. In the window where they don't (any time close to
midnight, in either direction, depending on the runner's own timezone),
these three tests fail even though `getCompanyFinancialSummary`'s actual
behavior is correct — the bug is in the test fixture's date, not in the
function under test.

**Scope of this issue:** pre-existing, from an earlier round (Phase B,
accounting audit fix, 2026-09-17) — entirely unrelated to Decision A/B1/B3/C
of the Cutover/Opening State revision round. Confirmed via `git diff` that
none of this round's changes touch that describe block.

**Why it wasn't fixed here:** the owner's explicit decision — this
revision round's commits stay scoped to Cutover/Opening State; a fix here
would mean editing test code from a separate, already-shipped feature
round, which is exactly the kind of scope-widening this track has
deliberately avoided everywhere else. The new Test B1 test added in this
same round hit the identical trap during development (it also started out
using `new Date()`) and was fixed **in place** by anchoring to
`todayInBusinessTimezone()` instead — the safe fix for new code; the
pre-existing tests were deliberately left untouched.

**What a real fix would look like (not scoped/estimated, for future
reference only):** replace `new Date()` with `todayInBusinessTimezone()`
(optionally + a fixed offset to land safely inside the business day) in
all three fixtures, exactly as done for the new B1 test — a small,
mechanical, low-risk change, but still a change to another feature's
already-approved test file, so left for a dedicated pass rather than
folded into this round.

---

## `getCustomerOpeningPosition` has zero test coverage

**Found:** Cutover / Opening State revision round, Step 7 (Test B1), while
answering the owner's question of whether Test A already covered this
function — it doesn't. A repo-wide search turned up no test file
referencing `getCustomerOpeningPosition` at all. Pre-existing gap, not
introduced or widened by this revision round — left untouched, owner's
explicit decision (answer-only, no action requested).

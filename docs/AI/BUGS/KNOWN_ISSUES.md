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

---

## `OrderItemReturn.orderId` has no foreign key or index live

**Found:** 2026-09-21, while constructing the Cutover migration
(`20260921195220_opening_state_cutover`) via `prisma migrate diff
--from-config-datasource --to-schema` against the live database. The raw
diff proposed adding both `OrderItemReturn_orderId_fkey` and
`OrderItemReturn_orderId_idx`, which was surprising — `orderId` was
supposedly already added by the separate, still-uncommitted
`order_item_return_history_fix` migration (applied live 2026-09-16, see
`_prisma_migrations`). Verified directly against `pg_constraint`/
`pg_indexes`: the `NOT NULL` column genuinely exists live, but **neither
the foreign key nor the index were ever created** — that migration added
the column only.

**Concrete consequence:** referential integrity between `OrderItemReturn.
orderId` and `Order.id` is not enforced at the database level at all right
now (an orphaned `orderId` pointing at a deleted/nonexistent order would
currently be silently accepted), and any query filtering or joining on
`orderId` (e.g. `mapOrderToDto`'s per-order sum, per its own accounting-
fix doc comment) runs a full sequential scan rather than an index lookup.

**Why it wasn't fixed here:** `OrderItemReturn` has nothing to do with
Cutover — fixing this is that other, still-uncommitted feature's own
migration to write and review, not something to fold into an unrelated
migration silently. Excluded from the Cutover migration by deliberate,
confirmed decision (verified the two are fully independent — different
table, different constraint names, zero overlap).

**What a real fix would look like:** a small follow-up migration —
`ALTER TABLE "OrderItemReturn" ADD CONSTRAINT "OrderItemReturn_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON
UPDATE CASCADE;` + `CREATE INDEX "OrderItemReturn_orderId_idx" ON
"OrderItemReturn"("orderId");` — reviewed and applied alongside (or as
part of) that other migration's own eventual commit, not standalone.

---

## "Connection terminated unexpectedly" — root cause identified (external), two downstream effects now mitigated, one still open

**Found:** 2026-09-22, during the live browser verification of the Cutover
screens (`PENDING_VERIFICATION.md`) — hit repeatedly (5+ times) across a
single session: on `POST /api/auth/login` itself (20-30s before failing),
on `/orders/new`'s initial load (`/api/partners`), and once mid-save. This
is the exact same error the `keepAlive`/`idleTimeoutMillis` fix in
`apps/api/src/lib/prisma.ts` (commit `815fc58`, documented in `CLAUDE.md`
as resolving "Issue 1") was believed to have closed. It has not.

**Root cause, now identified as external:** a direct `pg_stat_activity`
check during the incident showed only 18/60 connections in use (ruling out
pool exhaustion), the API process never restarted during the session
(ruling out `tsx watch`/HMR cold-starts), and every failure hung for a
fixed ~10s/~20s/~30s before erroring — a "the pooler layer itself is stuck"
shape, not "the connection was refused." This matches a still-open Supabase
upstream issue, **[supabase/supabase#49991](https://github.com/supabase/supabase/issues/49991)**
("Both Supavisor poolers intermittently take 12–93s to accept a connection
while PostgREST against the same database stays at 0.35s median — so
Postgres is healthy and the pooler layer is not"). Full write-up, and why
this must be re-checked before assuming any regression is "the same bug
again," in `docs/AI/BUGS/EXTERNAL_DEPENDENCY_SUPAVISOR_49991.md`.

**Two concrete downstream consequences found this session — now mitigated
(commit `04b9380`, 2026-09-22, independent of Cutover):**

1. ~~A transient backend failure sometimes surfaces to the frontend as a
   401, which the app treats as "session invalid" and force-reloads —
   silently wiping any in-progress form/cart state.~~ **The forced reload
   itself is still not fixed** (see "Still open" below) — what's fixed is
   its worst consequence: a real Opening Credit payment succeeded
   server-side, then an unrelated crash blanked the page; reloading right
   then used to mint a brand-new idempotency key, unaware it might be
   retrying an operation that already succeeded. `useIdempotencyKey` now
   stores its key in `sessionStorage` (survives the reload, clears on tab
   close) instead of a bare `useRef`, wired into all four of its call
   sites (order creation, payment recording). A stale key reused for a
   genuinely different payload still fails safely — the backend's
   fingerprint check in `idempotencyService.ts` rejects the mismatch with
   a 409 rather than silently returning someone else's result.
2. ~~An uncaught frontend crash (`Cannot read properties of undefined
   (reading 'every')` in `react-dom`, blank black page, no error
   boundary) — the backend operation had already succeeded (confirmed via
   DB) but the UI gave zero feedback.~~ **Fixed** — a new `ErrorBoundary`
   now wraps `NewOrderPage`/`OrderDocumentPage` at the route level
   (`App.tsx`), page-level rather than just around the payment dialog,
   because the crash actually observed originated from an `order` state
   update rippling through `react-dom`'s own reconciliation, not code
   confined to the dialog's subtree. Shows a clear Arabic recovery message
   ("تأكد من حالة العملية... قبل ما تحاول تاني") instead of a blank page.

**Still open — not fixed by the above, deliberately out of scope for that
narrow commit:**

- The frontend still treats a 5xx/timeout as if it were a genuine 401 and
  force-reloads/logs out. The *consequences* of that reload (duplicate
  submission, a dead blank page) are now covered, but the reload — and
  the confusing "you got logged out for no reason" UX, and the lost
  in-progress form data for anything that ISN'T behind
  `useIdempotencyKey` — still happens. A real fix means the frontend
  should never treat a 5xx/network failure as a 401 (only an explicit
  auth rejection should trigger a forced logout).
- `useIdempotencyKeyMap` (`ExpensesPage.tsx`'s mark-paid,
  `PosPage.tsx`/`NewOrderPage.tsx`'s batch quick-sale line items) has the
  exact same `useRef`-only weakness `useIdempotencyKey` had — a crash +
  reload mid-batch would lose its keys too. **Known, not fixed** — narrower
  blast radius than the main fix (shorter-lived, per-line-item operations,
  not a single large payment/order), deliberately left out of the
  2026-09-22 commit to keep it scoped; a future pass should apply the same
  `sessionStorage` treatment here too.
- The stall inside Supavisor itself has no fix on our end at all — see
  `docs/AI/BUGS/EXTERNAL_DEPENDENCY_SUPAVISOR_49991.md` for what would
  actually resolve it (none of which is ours to build).

---

## Architectural pattern gap: a service throwing a custom error is not proof the controller catches it

**Found:** 2026-09-22, while reviewing the Idempotency wiring's remaining
scope. `orderService.ts` correctly defined and threw
`CustomerOpeningReferenceInvalidError`, `AlreadyConsumedWithoutCustomerOpeningError`,
and `AlreadyConsumedExceedsRequirementError` — fully committed, exercised
by real unit tests (`orderService.alreadyConsumed.test.ts`). But
`orders.ts`'s `createOrderHandler` never actually caught any of them; they
fell through to `throw err`, surfacing as a raw/generic error instead of
the required Arabic message. This shipped and was pushed to `main` before
being caught (see the `fix(cutover): handle already-consumed/opening-credit
errors in order creation` commit that fixed it) — the only reason it
surfaced at all was a live browser click-through, not any automated check.

**Why this is a pattern, not a one-off:** a service-level test proves the
service does its part (throws the right error, with the right data). It
proves nothing about whether any given controller actually catches that
error and maps it to the right HTTP status/message — that wiring lives
entirely in the controller, and nothing forces it to exist just because
the error class does. This project's own convention (`handleServiceError`-
style `instanceof` chains repeated per-controller) makes this an easy
omission: adding a new error to a service is a green service test; forgetting
to add the matching `if (err instanceof ...)` block in every controller
that calls it is invisible to that same test.

**Why it wasn't fixed everywhere here:** this entry exists to name the
*pattern*, not to audit every controller/service pair in the codebase for
the same gap — that's a larger, dedicated pass, out of scope for the
Idempotency review that surfaced this one instance.

**What a real fix would look like:** a controller-level test for every
handler that calls a service function capable of throwing a custom error
class — asserting the HTTP status, `code`, and (for Arabic-message errors)
the exact message — not just a service-level test that the class gets
thrown. Doesn't need to be exhaustive on day one; the immediate value is
simply *some* controller-level coverage existing for `createOrderHandler`'s
three Cutover-era errors, so this exact class of gap can't silently recur
there again.

---

## Supplier payment recording has zero branch-access check (temporary, deliberate)

**Found/introduced:** 2026-09-22, committing the Idempotency review's
`suppliers.ts` piece (commit `c5222b2`). Built from the committed `HEAD`
baseline, deliberately excluding the still-uncommitted
supplier-accounting-fixes feature that lives in the same file's working-tree
diff — including that feature's `canAccessBranch(auth, input.branchId)`
check on this exact handler.

**Concrete consequence, right now:** `POST /api/suppliers/:id/payments`
has **no branch-access check at all**. Any staff member holding the
permission this route requires can record a supplier payment against
*any* branch, not just the ones they're scoped to — there is currently no
`branchId` concept on this endpoint's input in the committed schema for it
to check against in the first place (that field is part of the
not-yet-committed `supplier-accounting-fixes` schema change). This is not
a regression introduced by the idempotency commit — the committed baseline
never had this check either — but it's being named explicitly now, at the
exact moment it was consciously chosen not to fix, rather than left to be
rediscovered as a surprise later.

**Why it wasn't fixed here:** fixing it means bringing in
`supplier-accounting-fixes`'s own schema/migration change
(`SupplierPayment.branchId`), which is exactly the feature due its own
narrow, dedicated review — pulling one check out of it in isolation would
mean reviewing (and trusting) part of that feature without the rest of the
scrutiny it's going to get.

**What closes this gap:** the `supplier-accounting-fixes` migration +
its `suppliers.ts` branch-scoping changes getting their own reviewed,
narrow commit(s) — at which point this entry should be deleted, not just
marked done.

---

## `updateOrder`/`deleteOrder` can double-restock inventory for a returned item (not yet fixed)

**Found:** 2026-09-23, order-item-return-history-fix review (Decision B),
while separating that feature's `orderId`/history-preservation fix from
everything else mixed into the same `orderService.ts` diff.

**What's wrong:** `materialsToRestock(item)` always returns an item's FULL
original consumption. When an order with an already-(partially-)returned
`INVENTORY_RETAIL` item gets edited or deleted, `updateOrder`/`deleteOrder`
restock that full original quantity again — including the portion a prior
`createReturn()` call already restocked once. A working, tested fix
(`materialsToRestockAfterReturns`, which subtracts `item.returns`' summed
quantity before restocking) already exists uncommitted in the working
tree, with 7 passing unit tests in `orderService.restock.test.ts`.

**Why it wasn't fixed here:** it's a real bug, but a different one from
what this review was scoped to (`OrderItemReturn` history surviving an
order edit) — the two happen to touch the same functions
(`updateOrder`/`deleteOrder`'s item-replace loop) only by coincidence.
Committing it here would mean reviewing/trusting an inventory-correctness
fix without giving it its own dedicated scrutiny.

**What closes this gap:** `materialsToRestockAfterReturns` and its call
sites in `updateOrder`/`deleteOrder` (plus the `returns: { select: {
quantity: true } }` include additions those functions need) getting their
own reviewed, narrow commit — restoring `orderService.restock.test.ts`
alongside it.

---

## `orderService.ts` has three unreviewed Decimal-precision fixes (not yet committed)

**Found:** 2026-09-23, order-item-return-history-fix review (Decision C),
same separation pass as the double-restock issue above.

**What's wrong (as currently written, still live/committed):**
`updatePayment`'s `newAmount` and `createReturn`'s `refundAmount` are both
computed by converting a `Prisma.Decimal` to a plain JS number
(`.toNumber()`), doing float arithmetic, then persisting a freshly-parsed
`Decimal` — a round trip that can silently lose or shift precision on the
last decimal place. `updateOrder`'s `discountPercent` has the same
round-trip issue when the caller doesn't actually change the discount (the
original `Decimal` instance gets needlessly re-parsed on every save,
instead of only when the input changes it). Working fixes for all three
already exist uncommitted in the working tree, computed entirely in
`Prisma.Decimal` space (no float round-trip).

**Why it wasn't fixed here:** unrelated to `OrderItemReturn` history
preservation — it happens to live in two of the same functions
(`updatePayment`, `createReturn`) plus one more (`updateOrder`'s discount
handling) purely by coincidence of when both fixes were written. This is
an accounting-precision concern that deserves its own review, not a
drive-by change riding on this feature's commit.

**What closes this gap:** a dedicated review of these three Decimal fixes
(plus the `import type { Prisma }` → `import { Prisma }` change they
require, since `new Prisma.Decimal(...)` needs it as a value) getting its
own narrow commit.

---

## `getSalesSummary`'s "today"/"this week" boundaries use server-local time, not Cairo time (not yet committed)

**Found:** 2026-09-23, order-item-return-history-fix review (Decision D),
same separation pass as the two issues above.

**What's wrong (as currently written, still live/committed):**
`getSalesSummary` computes `startOfToday` via
`new Date(now.getFullYear(), now.getMonth(), now.getDate())` — a plain JS
`Date` constructed from the SERVER's own local timezone (typically UTC on
cloud hosting), not Cairo's. Depending on the time of day and DST, "مبيعات
اليوم"/"مبيعات هذا الأسبوع" on the dashboard can straddle the wrong
calendar day by 2-3 hours — the same class of bug `businessDayRangeUtc`
already fixed for Treasury/attendance elsewhere in this codebase. A
working fix (`todayInBusinessTimezone(now)` + `setUTCDate` instead of
`setDate`, reusing the same Cairo-aware helper) already exists uncommitted
in the working tree.

**Why it wasn't fixed here:** unrelated to `OrderItemReturn` history —
it happens to share `getSalesSummary` with an in-scope change (this
review needed to switch the function's returns calculation from
`items[].returns` to the new `order.itemReturns` relation) purely by
coincidence.

**Correction (2026-09-24):** this entry originally claimed the fix
"can't be committed on its own" because `todayInBusinessTimezone` was
only reachable through an uncommitted `packages/shared` barrel-export
line — that was wrong. `orderService.ts` imports `todayInBusinessTimezone`
directly from `../lib/businessTimezone.js` (the API's own lib), which
already had the full, real implementation committed at HEAD long before
this review — the `packages/shared` move (Unit 5 of the 2026-09-17 audit
mapping, since committed) was only ever needed to let the *frontend*
(`CustomerStatementTab.tsx`) reuse the same logic, and never blocked this
backend fix. No real dependency existed.

**What closes this gap:** a dedicated review of this timezone fix on its
own narrow commit — likely alongside or shortly after
`businessDayRangeUtc`'s own precedent, since both are the same class of
fix.

---

## `netProfit` on the branch financial summary is currently wrong — live, on a dashboard the owner reads today

**Found:** 2026-09-23, mapping the full "Accounting audit fix (2026-09-17)"
initiative into 7 distinct units before starting any of them. Documented
immediately upon discovery (not deferred) per explicit owner instruction —
this is a live accuracy gap on a number already in front of the owner,
not a newly-introduced risk, and it needs to be on record before anyone
asks "can I trust this number" in the meantime.

**What's wrong, right now, on the currently-committed/live code:**
`resolveItemProfit`'s `netProfit` (surfaced on the branch financial
summary — dashboard + Treasury page, shipped 2026-08-26) sums an item's
revenue across **all time**, but subtracts the branch's `dailyFixedCost`
(rent + amortized salaries) computed for **a single day only**. The two
figures use different time bases and get combined into one number anyway
— confirmed as a genuine calculation bug by the 2026-09-17 accounting
audit, not a documented approximation. In practice this means `netProfit`
skews further from reality the longer a branch has been operating (more
all-time revenue stacked against one day's fixed cost), and the direction
of the error only gets worse over time, never self-corrects.

**Why it wasn't fixed here:** a working fix already exists uncommitted in
the working tree (Phase B: scopes the revenue side to the same
Cairo-business-day window `dailyFixedCost` already uses, plus splits the
result into disclosed `realProfit`/`estimatedProfit`/`realCost`/
`estimatedCost` per Decision 5) — but it lives in the same 366-line
`branchFinancialsService.ts` diff as an unrelated net-new report (Phase
3 C/D: a separate Gross→Operating Profit / Revenue / Cash Received / AR
breakdown), and this is the single highest-stakes unit of the whole
audit initiative (an owner-facing number already being read for real
decisions) — it gets a full, unhurried, Cutover-style review on its own,
scheduled last (after 6 simpler/lower-risk units), not a rushed drive-by
fix riding on an unrelated commit.

**Addendum (2026-09-24) — the uncommitted Phase B fix itself has its own
timezone bug, found by accident while verifying an unrelated commit
(Unit 2/expense-system) with the real-world clock sitting inside Cairo's
own "already tomorrow, still today in UTC" window (~21:00–02:00 UTC).**
`branchFinancialsService.ts`'s today-scoping check
(`if (order.date < todayStart) continue;`, `todayStart =
todayInBusinessTimezone()`) uses the wrong helper for a real instant-range
comparison: `todayInBusinessTimezone` deliberately returns a *label*-shaped
UTC date (same calendar-day number as Cairo's current date, expressed as
literal UTC midnight — correct for day-bucketing columns like
`AttendanceEntry.date`, see that function's own doc comment) rather than
the real UTC instant Cairo midnight actually falls at.
`businessDayRangeUtc(dateString).start` is the helper that computes the
real instant, and already exists for exactly this purpose (its own doc
comment calls itself "the reverse of `todayInBusinessTimezone`"). Verified
live during this session's own real clock (2026-09-23T22:47 UTC / already
2026-09-24 in Cairo): the branch-financials test suite's 3 "Phase B"
tests — which construct a "today" order via bare `new Date()` — failed
non-deterministically with `netProfit` computing to 0 instead of the
expected value, purely because of this boundary bug; a direct comparison
confirmed `businessDayRangeUtc(...).start` gives the correct answer where
`todayInBusinessTimezone()` used as a boundary does not. Zero live impact
today (this file is entirely uncommitted), but the eventual Unit 7 review
needs to swap this one comparison to the correct helper, not just extract
Phase B from Phase 3 C/D as originally scoped.

**What closes this gap:** the dedicated review of unit 7
(reports/branchFinancials — Phase B + Decision 5 + Phase 3 C/D) already
planned as the final step of the 7-unit sequence. If the wrong number
itself needs closing sooner than the full unit, Phase B (the fix) is
separable from Phase 3 C/D (the new report) and could be pulled forward
on its own — flagged to the owner as an option, not yet exercised.

# Pending Pre-Commit Verification (Cutover Revision Round)

## Status: closed for Cutover (2026-09-22)

**Owner confirmation (2026-09-22): Cutover itself worked exactly as
designed, and full cleanup of the test data was confirmed — this formally
closes the gate for the Opening State/Cutover work.** The three sub-items
under "Still open" below are minor, narrower-scope follow-ups (not
re-tested this round), not blockers — Cutover's own commits do not need
to wait on them.

DB connectivity came back (Cutover migration `20260921195220_opening_state_cutover`
applied live) and a real, live, browser click-through was finally done —
dev servers (`api`/`web`) against the same live database, logged in as
`razein2345@gmail.com` (SUPER_ADMIN). One dedicated test partner + a real
`CustomerOpening` + a real `Order`/`Payment` were created through the actual
UI flows (not seeded directly), used to exercise every check below, then
hard-deleted afterward — verified via direct query that all 5 Cutover
tables are back to 0 rows and the specific test records no longer exist.

**Everything below that owner explicitly asked to check passed.** Three
sub-items from the ORIGINAL checklist (kept below, unstruck) were not
re-tested this round and stay open for a future pass.

## What was verified live, 2026-09-22

1. **`apps/web/src/pages/orders/NewOrderPage.tsx`**
   - ✅ The "هذا الأوردر استمرار لشغلانة قبل التفعيل" checkbox appears only
     with a real (non-walk-in) customer + an APPROVED `CustomerOpening`
     selected; toggling walk-in on/off correctly hides/restores it. The
     ADMIN+-only gate (`isAdminOrAbove`) was confirmed by reading
     `NewOrderPage.tsx`'s render condition, not by live-clicking a second,
     non-admin account this round (see "still open" below).
   - ✅ The per-material "منها اتصرف بره النظام بالفعل" input appeared
     correctly under a `LOOSE_PAPER` cart line (single-`inventoryItemId`
     kind), directly below its "إجمالي الورق: N فرخ" requirement line.
   - ✅ Entering a deliberately too-large value (999, against a real
     requirement of 3) and saving produced the Arabic
     `AlreadyConsumedExceedsRequirementError` message with the real
     material name resolved: *"الكمية اللي أدخلتها كـ"مستهلكة بالفعل بره
     النظام" لصنف "ورق 100" (999) أكبر من احتياج هذا البند الفعلي (3)..."*
     — no raw UUID, no English.
   - ✅ Saving with a valid value (2) succeeded (`CLP-INV-2026-000066`);
     confirmed directly via DB that the Order's `customerOpeningId` was
     set to the real `CustomerOpening.id`.

2. **`apps/web/src/pages/cutover/CustomerOpeningPage.tsx`**
   - ✅ `PartnerCombobox` search works (typed a partial name, got a live
     match).
   - ✅ Create → Verify → Approve lifecycle works end to end: status/badge
     flips DRAFT+UNVERIFIED → DRAFT+VERIFIED → APPROVED correctly, and the
     live "remaining credit" figure correctly shows 0.00 while DRAFT and
     jumps to the real amount only once APPROVED (confirms
     `getCustomerOpeningPosition`'s `isApproved` gate).
   - ✅ Self-approval exception badge ("⚠️ تم الاعتماد ذاتيًا (استثناء
     طارئ)") appeared correctly, since the same account both created and
     approved the record.
   - ✅ "تصحيح الرصيد" is a real `<dialog>` (not a browser `prompt()`),
     visible for this SUPER_ADMIN account, with both fields (new amount +
     mandatory reason) working; after confirming, `creditAmount` updated
     and a new footer line appeared showing `creditCorrectedAt`'s
     timestamp + `creditCorrectionReason` verbatim.

3. **`apps/web/src/pages/orders/OrderDocumentPage.tsx`** (added to this
   round's ask, cross-screen check)
   - ✅ Badge "🔗 استمرار للالتزام سابق قبل التفعيل (Opening Credit)"
     appears next to the invoice number.
   - ✅ The "استخدام رصيد افتتاحي" toggle in the payment dialog correctly
     fetched and displayed the real remaining balance (600.00, matching
     `CustomerOpeningPage`'s own figure exactly — cross-screen numbers
     agree).
   - ✅ Entering 700 (> 600 remaining) was rejected with a clean Arabic
     message: *"المبلغ أكبر من الرصيد الافتتاحي المتاح (600.00 ج.م)"*.
   - ✅ Entering 150 (valid) succeeded; confirmed via DB the `Payment` row
     was created with `sourceType: OPENING_CREDIT_APPLICATION` and the
     correct amount, tied to the right Order.

## Still open (not re-tested this round, kept from the original checklist)

- Live-clicking the checkbox's ADMIN+ gate with a genuine non-admin
  account (this round only confirmed it by reading the render condition
  plus testing as SUPER_ADMIN).
- `CustomerOpeningPage.tsx`'s "reopen" step of the lifecycle (create →
  verify → approve were tested; reopen was not clicked this round).
- The nav link ("الرصيد الافتتاحي للعملاء" under المالية) visible/hidden
  exactly like the existing Cutover link, same `treasury.view` gate — not
  specifically re-checked with a second, lower-privilege account.

## Unrelated, higher-severity finding surfaced during this session — now partly fixed

Real, repeatedly-reproducing "Connection terminated unexpectedly" DB
connection drops were hit throughout this verification pass — on login,
on `/orders/new`'s load, and mid-save. Root-caused to a still-open,
external Supabase upstream issue (Supavisor pooler stalls,
[supabase/supabase#49991](https://github.com/supabase/supabase/issues/49991) —
full write-up in `docs/AI/BUGS/EXTERNAL_DEPENDENCY_SUPAVISOR_49991.md`),
not something in this codebase. Two downstream consequences it can trigger
were found and treated as a priority above Cutover's own doc updates:

1. A transient backend failure sometimes surfaces to the frontend as a
   401, forcing a full app reload. **The reload itself is still not
   fixed**, but its most dangerous consequence — losing the idempotency
   key that proves a retry after that reload is the SAME submission, not
   a new duplicate one — **is fixed** (commit `04b9380`, 2026-09-22):
   `useIdempotencyKey` now persists in `sessionStorage`, survives the
   reload.
2. An uncaught frontend crash (blank page, no error boundary) was hit once
   when a flaky response arrived mid-payment — the backend operation had
   already succeeded (confirmed via DB) but the UI gave zero feedback.
   **Fixed** (same commit) — a new `ErrorBoundary` around
   `NewOrderPage`/`OrderDocumentPage` now shows a clear recovery message
   instead.

This fix is entirely independent of Cutover (no Cutover file touched).
Full details, what's still open (the 401-as-reload behavior itself,
`useIdempotencyKeyMap`'s narrower version of the same original gap), and
why a symptom recurrence shouldn't be assumed to be "the same bug back
again" without first re-checking the upstream issue: `docs/AI/BUGS/KNOWN_ISSUES.md`.

---

# UI pass over the financial system — 2026-09-25

Method: the owner's logged-in production session (SUPER_ADMIN), clearly labeled
test data ("اختبار 2026-09-25"). Simple UI defects fixed directly; anything
touching financial logic / RBAC / intended behavior stopped and presented
first, then changed only on the owner's decision.

## Verified OK
- Cutover (Printing House): create (branch selector offers both branches) →
  add treasury opening → verify line → submit → approve (self-approval badge
  shown). Activation deliberately never exercised (owner instruction).
- Reports: debts tab (3,349 + 451 + 226 = 4,026) equals the header card and
  the invoices tab's remaining amounts.
- NewOrderPage: customer search, manual item, cart total (250 x 2 = 500.00),
  "حفظ فقط" → invoice number assigned, document page matches.
- OrderDocumentPage: payment recorded and shown in the payment log (this is
  also how the overpayment gap below was found).

## Fixed
| Change | Kind | Commit state |
|---|---|---|
| Cutover "Branch ID" free-text → branch selector | UI | pushed (`c64ce19`) |
| Cutover: raw "Inventory Item ID" box → item picker; branch name in list; Arabic status/method/verification labels and buttons | UI | local |
| Money shown with 3 decimals (`1,753.571`, `1,963.571`) in branch summary, fixed-expense editor, reports overview → 2 | UI | local |
| Reports heading "(Gross Profit)" English gloss removed | UI | local |
| Treasury table: 295/346 editable rows showed raw `CASH` and `130` → Arabic label and `130.00` | UI | local |
| **Overpayment rejected** (owner decision): `recordPayment`, a raised `updatePayment` amount and `createOrder`'s initial payments are capped at finalTotal − returns − other payments; 409 `PAYMENT_EXCEEDS_REMAINING`, Arabic message with the true remaining; per-order advisory lock; lowering/method-only edits never blocked | financial logic | local |
| **New invoice starts with no customer** (owner decision): it defaulted to the first partner in the list | behavior | local |

## Recorded, not changed
- `GET /api/branches` is requireAuth-only by design (owner: leave) —
  `KNOWN_ISSUES.md`.
- Inventory reconciliation differences on two Printing House items —
  `KNOWN_ISSUES.md`; owner reviews manually before any real Cutover
  activation.
- Related observation: the branch field of a new invoice also defaults to the
  first branch in the list (`branches[0]`). Same shape as the customer default
  but no debt is attached to a wrong branch silently visible in the form; not
  changed, raised for the owner.
- Invoice numbers are sequential: removing a test invoice leaves a gap.

## Test data — cleanup status
Left in production by this pass; the owner is removing the payment, invoice and
customer himself from the UI (the session's permission classifier blocked the
assistant from deleting the payment, which was the correct call):

| What | Identifier |
|---|---|
| Customer | "اختبار 2026-09-25" — partner `80b8ff2e-edd1-4d73-a9ff-e925806cbae2` |
| Invoice | `CLP-INV-2026-000067`, order `b8c0f714-10ea-4966-a0bb-056779fcd33c` |
| Payment | one CASH payment of 600.00 on that invoice (+ its INCOME treasury entry) |
| Cutover | Printing House, go-live 2026-09-26, notes "اختبار 2026-09-25 — سجل تجريبي، لا يُفعَّل", APPROVED, never activated — to be superseded (owner decision) |

## Still to test
NewOrderPage opening-balance-linked order, OrderDocumentPage opening-credit
payment, expenses, advances, profitability report against a known day.

## Follow-up fixes (same day, after the owner's decisions)
| Change | Kind |
|---|---|
| **A superseded Cutover can no longer be activated.** `activateCutover` only checked `status === APPROVED`; a superseded record keeps that status and the UI still offered "تفعيل", which would have posted its inventory openings on a branch with live data. Now: server throws `CutoverSupersededError` (409, Arabic) before any write; UI hides submit/approve/activate/reopen/supersede, the add-line forms and verify links on a superseded row and shows "أُلغي نهائيًا — للعرض فقط". | financial logic + UI |
| **New invoice/quotation starts with no branch** (same rule as the customer). Submit rejects with "اختر الفرع أولًا"; "+ عميل جديد" and quick manual income are disabled until a branch is chosen. | behavior |

Not changed, for the owner: on a superseded Cutover the server still accepts
reopen/approve/submit/supersede (harmless now that activation is blocked), and
superseding twice overwrites who/when/why.

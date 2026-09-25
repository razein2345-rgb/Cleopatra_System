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

---

## Final results — 2026-09-25 (after cleanup, live checks on production)

Cleanup confirmed by the owner (payment, invoice `CLP-INV-2026-000067`, test
customer deleted; Printing House treasury back to 1,682.41, sales 1,924.00 /
5 invoices). Render confirmed by the owner for `f017e9e`.

### Verified live
- **Overpayment rejection** (normal payment): a 600 payment on a 500 invoice is
  refused with "المبلغ أكبر من المتبقي على الفاتورة (500.00 ج.م) — لا يمكن تسجيل
  دفعة تزيد عن المستحق."; the invoice stays at paid 0.00 / remaining 500.00.
- **Empty defaults on a new invoice:** branch shows "— اختر الفرع —" and the
  customer "— اختر العميل —"; saving with neither → "اختر الفرع أولًا", with only
  a branch → "اختر العميل أولًا", with both → saved (`CLP-INV-2026-000068`, 500.00).
- **Cutover page** after supersede: Arabic status labels, branch name in the list,
  no action buttons on the superseded record.
- **Profitability report, one known day (2026-09-02):** arithmetic ties out —
  manual expenses 3,500.00 = 2,000 + 500 + 600 + 400 (the four manual expense
  entries of that day); gross profit 450.75 = (6,344.15 − 4,790.40 unknown-cost
  revenue) − (220.00 confirmed + 883.00 estimated cost); operating profit
  −5,012.82 = 450.75 − (1,963.57 fixed + 3,500.00 manual). The invoices tab for
  the period lists exactly the two invoices of that day.
- **Expenses:** amount 0 is rejected server-side; nothing was persisted.

### Explained, not a bug — for the owner's awareness
- Report revenue for 2026-09-02 is 6,344.15 while the two invoices total
  6,345.00: revenue sums each item's exact value, whereas an invoice total is
  rounded UP to a whole pound (`Math.ceil`). The 0.85 difference is that rounding
  (0.25 + 0.60).

### Needs an owner decision (not changed)
1. **The "صرف سلفة لموظف" dialog opens with the first employee pre-selected**
   ("أحمد") — same shape as the customer/branch defaults fixed today, on a cash
   payout. Proposed: start empty, require a choice.
2. **New-customer dialog** (`/partners`) also opens with the first branch
   pre-selected. Lower risk (a customer can be re-branched), same pattern.
3. **Invoice line unit price is shown rounded to 2 decimals while the line total
   uses the exact price** (e.g. 1000 × "1.10" = "1,103.75"). Display of a
   pricing figure — not touched.

### Minor UI notes (not changed)
- After a rejected payment the payment dialog closes and the error appears on the
  page, so the entered amount is lost.
- Server validation messages still show the English field key ("amount: ...").
- Expense "الفئة" is free text (no suggestions from existing categories).

### Not tested live (would post real cash that the assistant cannot remove)
- Expense DUE → PAID (posts a treasury OUT), creating an employee advance and a
  repayment. Their validation/forms were inspected; their logic is covered by the
  unit suites.
- The opening-credit-linked order flow was verified live on 2026-09-22; since
  then only the overpayment guard was added to it, covered by unit tests
  (`orderService.openingCredit.test.ts`).

### Test data currently live
| What | Identifier |
|---|---|
| Customer | "اختبار 2026-09-25" — partner `0a0fd1f7-f034-4bf0-a067-5518a93a554c` |
| Invoice | `CLP-INV-2026-000068`, order `c192c10d-7d7f-4f93-9387-002863cf6db6`, 500.00, **no payments** |
| Cutover | Printing House, superseded (kept, cannot be deleted from the UI) |

Invoice numbers 000067 (deleted) and the gap it leaves are expected.

### Access-review fixes shipped today (each with tests, isolated check, pushed)
Stock-movement edit/delete, field-assignment create/delete, machine
create/update/delete now check the record's own branch and audit under it;
unscoped READ endpoints are recorded in `KNOWN_ISSUES.md`.

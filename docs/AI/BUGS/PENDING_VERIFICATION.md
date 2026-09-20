# Pending Pre-Commit Verification (Cutover Revision Round)

Explicit gate, recorded per the owner's instruction: neither screen below
may be treated as closed/ready-to-commit until this is done, regardless of
how clean static checks (typecheck/lint/tests) already are.

## What's blocked

Live browser click-through of the two frontend screens below, together in
one pass, was not possible during this work because of a live database
connectivity issue on the dev environment at the time (`Connection
terminated unexpectedly` — seen even on unrelated endpoints like
`/api/auth/me`, and separately confirmed the Cutover/Opening State
migration itself has never been applied there — `Payment.sourceType does
not exist in the current database`). The owner is tracking/resolving the
connectivity issue separately; this file exists so the requirement to
verify isn't forgotten once it's back.

## What needs verifying, once DB connectivity is confirmed working again

1. **`apps/web/src/pages/orders/NewOrderPage.tsx`**
   - The "هذا الأوردر استمرار لشغلانة قبل التفعيل" checkbox: confirm it's
     genuinely invisible for a non-ADMIN/SUPER_ADMIN account, and only
     appears for an ADMIN+ account once a real (non-walk-in) customer
     with an APPROVED CustomerOpening is selected.
   - The per-material "منها اتصرف بره النظام" input: confirm it appears
     only when the checkbox above is on, only for single-material line
     kinds, and that switching customers/toggling walk-in correctly
     resets/hides it (no stale value carried over).
   - Submitting an order with the checkbox on: confirm the created Order
     actually carries `customerOpeningId`, and that a deliberately-too-large
     "already consumed" value produces the Arabic
     `AlreadyConsumedExceedsRequirementError` message with the real
     material name resolved (not a raw UUID).

2. **`apps/web/src/pages/cutover/CustomerOpeningPage.tsx`** (new page)
   - Search → create → verify → approve → reopen lifecycle actually works
     end to end for a real CustomerOpening record.
   - "تصحيح الرصيد" button: visible only for SUPER_ADMIN, opens the modal
     (not a browser prompt), and a successful correction updates the
     displayed `creditCorrectedAt`/`creditCorrectionReason` and the
     `selfApprovedException`-style badge area correctly.
   - Confirm the nav link ("الرصيد الافتتاحي للعملاء" under المالية) is
     visible/hidden exactly like the existing Cutover link (same
     `treasury.view` gate).

3. **Cross-screen**: create a continuation Order from `NewOrderPage.tsx`
   for a customer whose `CustomerOpeningPage.tsx` record you can see,
   confirm the numbers agree in both places (consumed/remaining credit).

## Status

Not done. No commit should happen for either screen until this file's
checklist is completed and this note is removed (or updated to record
what was actually verified and when).

# Pending Scope Decisions (Deliberately Deferred)

Explicit backlog of scope the owner has consciously decided to leave out
for now — distinct from `KNOWN_ISSUES.md` (bugs) and
`PENDING_VERIFICATION.md` (verification still owed before a commit). These
are not defects; they are decisions to revisit later, recorded so they
don't get silently forgotten.

---

## SupplierOpening has no frontend screen at all

**Decision (Cutover revision round, post-3D):** no `SupplierOpeningPage.tsx`
(or equivalent) will be built in this pass. `CustomerOpeningPage.tsx` was
built with its own dedicated minimal screen (search + detail +
correction); SupplierOpening gets nothing symmetric right now.

**Why:** the original Decision A (credit correction, `selfApprovedException`
tightened maker-checker) was scoped to Customer Credit specifically. The
priority right now is closing out the core Cutover implementation track
before opening a new scope (a Supplier-side screen) that was never part of
that original decision.

**Concrete consequence — this is the part that must not be forgotten:**
`SupplierOpening.selfApprovedException` is fully implemented end to end on
the backend — it's written correctly by `approveSupplierOpening`
(`openingStateService.ts`) and returned correctly by `toSupplierOpeningDto`.
**But there is no UI anywhere that reads or displays it.** Concretely: if a
SUPER_ADMIN ever self-approves their own SupplierOpening record (the
emergency exception path), the fact that it happened is real and durable
in the database and in any raw API response — but **no one can see it**
unless they query the API directly or look at the database. The same is
true, more broadly, of every other field/action on SupplierOpening
(create/verify/approve/reopen) — none of it has ever had a UI, even before
this revision round; this entry specifically flags `selfApprovedException`
because that's the field this round added and is the reason this gap was
freshly discovered.

**What would close this:** a `SupplierOpeningPage.tsx` mirroring
`CustomerOpeningPage.tsx`'s exact shape (search by partner, lifecycle
actions, `selfApprovedException` badge) — no new backend work needed, the
service/controller/route layer for SupplierOpening already exists and is
already tested; this is a frontend-only gap.

**Status:** intentionally not started. Revisit after the core Cutover
track (this revision round + its tests + final delta-audit) is closed.

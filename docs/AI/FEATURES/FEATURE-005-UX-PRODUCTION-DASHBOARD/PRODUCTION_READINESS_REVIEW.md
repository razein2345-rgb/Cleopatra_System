# FEATURE-005 — Production Readiness Review

**Reviewer stance**: ERP UX Architect + Printing Production Consultant, reviewing the
product as a printing-business owner would use it day to day — not the code.

**Method**: live session against the running app (Dashboard, `/production-board`,
all 11 departments, desktop and 375px mobile viewport) plus reading every screen's
actual data contract, so every finding below is about what the product currently
does, not a guess. No code was changed to produce this review.

**Standing constraint**: this environment has zero live `WorkflowInstance` data, so
every finding is based on structure, layout, and information architecture — not on
watching real queues fill up and drain under load. That's called out explicitly
wherever it limits the finding.

---

## Executive Summary

Sprint 1 and 2 built a real, working skeleton: a Dashboard that reads one honest
number source, a Production Board that reads and writes the actual Workflow Engine,
consistent Arabic RTL, clean empty states, and an extensible widget/provider
architecture that will make adding the next ten metrics cheap. That foundation is
sound and should not be re-architected.

But right now, if a printing-business owner opened this on a Monday morning, they
could tell "how many jobs are open" and "how many are late" — and almost nothing
else. They could not tell **which** job is late, **how** late, **why** it's stuck,
**who** should be chasing it, or **whether today is better or worse than usual**.
The product answers "is there a fire?" but not "where is the fire, and who's
standing next to it." That gap — from counting to acting — is the theme of nearly
every finding below.

---

## Findings

Each finding is numbered for reference in the roadmap section.

### A. Dashboard

**F1. Widgets are numbers you can't click.**
Every widget (waiting/in-progress/delayed/by-department/by-operator/supplier
delays) is read-only. Seeing "3 مهام متأخرة" gives no way to jump to those three
jobs — the owner has to go to Production Board, guess the department, and scan
manually.
- *Why it matters*: the Dashboard's entire job is to shorten "I see a problem" →
  "I'm looking at the problem." Right now it doubles the trip.
- *Suggested improvement*: make each widget (or its rows, for the list widgets)
  a link into Production Board pre-filtered to that department/employee/delay
  state.
- *Size*: Medium (Production Board needs a `?filter=` entry point; widgets need
  `<Link>` wrapping).
- *Priority*: **Critical**

**F2. No sense of "is this normal."**
"0 اليوم" or "12 قيد التنفيذ" is a number with no baseline. There's no
yesterday, no weekly average, no trend arrow.
- *Why it matters*: raw counts don't tell an owner whether to worry. "12 in
  progress" is either a normal Tuesday or a pileup, and the Dashboard can't say
  which.
- *Suggested improvement*: add a small delta/trend indicator (vs. yesterday, or a
  7-day sparkline) to the count-based widgets, starting with Daily Production and
  Delayed Jobs.
- *Size*: Medium (needs a historical query, not just the current snapshot).
- *Priority*: High

**F3. No single "should I be worried right now" signal.**
Nine widgets of equal visual weight. Nothing on the page says, in one glance,
"everything's fine" or "something needs you."
- *Why it matters*: a business owner checking the Dashboard between other tasks
  wants a five-second read, not nine cards to individually parse.
- *Suggested improvement*: a top-of-page status strip — green/yellow/red — driven
  by delayed-job count and supplier-delay count, above the widget grid.
- *Size*: Small–Medium.
- *Priority*: High

**F4. Supplier delays show a count, not an age.**
The Supplier Delays widget lists a supplier and "N متأخرة" — not how many days
late, or since when.
- *Why it matters*: a job that's one day late from an external finisher is a
  different conversation than one that's two weeks late. Both currently render
  identically.
- *Suggested improvement*: show the oldest delay's age (days) per supplier, or
  sort suppliers by worst delay first.
- *Size*: Small (the `expectedReturnDate` already exists on the stage instance —
  this is a display/aggregation change, not new data).
- *Priority*: Medium

**F5. No manual refresh, no staleness indicator.**
The Dashboard loads once on mount. If it's left open on an office monitor, the
numbers silently go stale.
- *Why it matters*: a Dashboard used as an "always-on wall screen" (very common in
  print shops) is actively misleading once it's a few hours old, with nothing
  telling the viewer that.
- *Suggested improvement*: a manual refresh button plus a "last updated Xm ago"
  label is the cheap fix; auto-poll (e.g. every 60s) is the real fix for a wall
  display.
- *Size*: Small (manual refresh) / Medium (auto-poll).
- *Priority*: Medium

---

### B. Production Board Usability

**F6. No summary counts on the board itself.**
The department switcher just lists 11 department names — no indication of which
ones actually need attention. Once inside a department, there's no "7 waiting · 2
delayed" header — you count rows.
- *Why it matters*: this is the screen a floor supervisor opens dozens of times a
  day. Forcing a full department-by-department click-through to find where the
  problem is defeats the purpose of a "board."
- *Suggested improvement*: show a small waiting/in-progress/delayed count next to
  each department name in the dropdown (or replace the dropdown with a
  department-tab strip showing counts, which also solves part of F16 below).
- *Size*: Small (the `dashboard-summary` endpoint's `byDepartment` already has
  these three numbers — this is wiring, not new backend work).
- *Priority*: **Critical**

**F7. No search or filter.**
No way to filter the queue by priority, by "delayed only," by assigned employee,
or search by order number.
- *Why it matters*: once a department queue has more than ~15–20 jobs (normal for
  a busy shop), scanning a flat table to find one order or all urgent jobs stops
  being viable.
- *Suggested improvement*: a lightweight filter bar above the table — priority
  dropdown, "delayed only" toggle, order-number search box. All client-side
  against the already-loaded queue; no new endpoint needed.
- *Size*: Small–Medium.
- *Priority*: High

**F8. No due date shown, and no elapsed/time-in-stage.**
The table shows a delayed/on-time badge but never the due date itself, and never
how long the job has sat in this stage.
- *Why it matters*: "متأخرة" alone doesn't tell a worker whether to panic (2 hours
  overdue) or not (2 days early counted wrong). Time-in-stage is one of the most
  basic production-floor signals — it's how a supervisor spots a stall before it
  becomes a formal delay.
- *Suggested improvement*: add a "تاريخ الاستحقاق" column, and a relative
  "منذ متى" (time since `startedAt`/`createdAt`) column or tooltip.
- *Size*: Small (both fields already exist on `WorkflowQueueItem`).
- *Priority*: **Critical**

**F9. No job/customer identity — only an order number.**
Every row shows a work-order number and nothing else identifying the job (no
customer name, no product/description).
- *Why it matters*: floor staff and supervisors think in terms of "the Al-Rashid
  business cards" or "the banner for the exhibition," not `WO-000412`. Forcing a
  second lookup to know what a row *is* slows down every single glance at the
  board.
- *Suggested improvement*: surface the customer name (and ideally a short
  job/item description) on the queue row — this needs the department-queue query
  to also select `workOrder.partner.name` (or equivalent), a small backend
  addition, not a new feature.
- *Size*: Medium (backend query change + shared schema field + column).
- *Priority*: **Critical**

**F10. No row-level color coding — only one small badge.**
A delayed or urgent job looks identical to a normal one except for a small badge
in one cell.
- *Why it matters*: production floor screens are read from a few feet away, often
  quickly, often by someone with their hands full. A badge in column 5 is easy to
  miss; a red-tinted row is not.
- *Suggested improvement*: tint the whole row (subtle background, not just text)
  when `isDelayed` is true, and again (a different tone) for `URGENT` priority.
- *Size*: Small.
- *Priority*: High

**F11. Destructive actions have no confirmation and sit next to each other.**
Complete / Skip / Fail / Edit are four buttons in a row with no confirmation step,
and Fail is a workflow-changing, hard-to-reverse action styled identically in
weight to a low-risk Edit button.
- *Why it matters*: a mis-click on a shared shop-floor tablet — Skip or Fail
  instead of Complete — silently mutates a real production workflow. There's no
  "are you sure," and no undo.
- *Suggested improvement*: require a confirmation step (dialog or two-step
  press-and-hold) for Fail specifically; keep Complete low-friction since it's the
  common, low-risk path.
- *Size*: Small.
- *Priority*: High

**F12. No stage-position context ("where in the job is this").**
A row shows the current stage name, but nothing about how many stages the job's
workflow has in total, or which number this is.
- *Why it matters*: "Design" in isolation doesn't tell a supervisor if a job is at
  the very start or nearly done. That changes how urgently a delay there should be
  treated.
- *Suggested improvement*: a small "المرحلة 3 من 7" indicator, sourced from the
  parent `WorkflowInstance`'s stage list already returned by the API.
- *Size*: Medium.
- *Priority*: Medium

**F13. Switching departments doesn't show a loading state — the old department's
rows stay on screen until the new ones arrive.**
`loadQueue` doesn't clear the table before fetching, so for a moment the visible
rows belong to the *previous* department while the dropdown already shows the new
one.
- *Why it matters*: this can read as "these are the new department's jobs" when
  they aren't — a real risk of someone acting on the wrong department's data for a
  second, which matters more here than on a typical back-office list.
- *Suggested improvement*: clear the table (or dim it) the instant the department
  selection changes, before the new response lands.
- *Size*: Small.
- *Priority*: Medium

**F14. No success feedback after Complete/Skip/Fail — the row just disappears.**
There's no toast/confirmation; the only feedback is the row vanishing from the
list once the queue reloads.
- *Why it matters*: implicit feedback is fine for a careful office user, less fine
  for a fast-moving floor worker who wants a clear "done" signal before moving on.
- *Suggested improvement*: a brief success toast ("تم إنهاء المرحلة").
- *Size*: Small.
- *Priority*: Low

**F15. No bulk actions.**
Every action is per-row; there's no way to reassign or reprioritize several jobs
at once.
- *Why it matters*: real shops batch work ("assign everything in Finishing to
  Ahmed this afternoon"). One-row-at-a-time doesn't match that.
- *Suggested improvement*: row selection + a bulk "reassign"/"set priority" bar.
- *Size*: Medium–Large.
- *Priority*: Low (revisit once real usage shows queue sizes)

---

### C. Workflow Visibility

**F16. A job's overall journey isn't visible anywhere.**
Production Board is department-siloed by design (correctly, per VISION.md's Queue
Philosophy) — but there's no complementary view of a *single order's* path across
departments. To follow one job end-to-end, you'd need to know which department it's
currently in and check there.
- *Why it matters*: "where is order #412 right now, and what's left" is one of the
  most common questions a business owner or a customer-facing employee gets asked,
  and today the product cannot answer it in fewer than several department-by-
  department checks.
- *Suggested improvement*: a per-order timeline view (all stage instances for one
  `WorkflowInstance`, in order, with status) — reachable from the order/work-order
  record, not necessarily a new nav item.
- *Size*: Medium (data already exists on `WorkflowInstance.stageInstances`; this
  is a new read-only screen, not new backend logic).
- *Priority*: High

**F17. Dashboard groups by department, never by stage/status combined.**
"Jobs by department" and "jobs by operator" exist; there's no "jobs by current
stage across the whole shop" view.
- *Why it matters*: department and stage aren't the same lens — Digital Printing
  might have jobs in three different stages under one department name. An owner
  planning the day thinks in stages ("what's stuck at plate prep") as often as
  departments.
- *Suggested improvement*: defer — F16's per-order timeline plus F7's filters
  cover most of this need without a new widget.
- *Size*: Medium.
- *Priority*: Low

---

### D. Department Workflow

**F18. No workload-vs-capacity signal per department.**
"4 waiting in Design" is shown with no sense of whether that's light or heavy for
that department (how many operators, how many they normally handle).
- *Why it matters*: VISION.md already commits to Capacity-Aware Marketing and
  Department Growth Recommendations as future strategic-intelligence features —
  this is the operational precursor to that data existing at all. Without it, "4
  waiting" is unopinionated.
- *Suggested improvement*: not for this pass — flag as a Future item that the
  eventual Capacity-Aware work (VISION.md) should build on top of the department
  summary this sprint already produces.
- *Size*: Large (needs a capacity/staffing model that doesn't exist yet).
- *Priority*: Low (Future — architecturally anticipated, not yet due)

**F19. No target/SLA comparison per department.**
There's no "average turnaround" or "target vs. actual" per department anywhere.
- *Why it matters*: covered in KPI section below (F20) — listed here because it's
  also a department-workflow gap, not just a metrics gap.
- *Suggested improvement*: see F20.
- *Size*: —
- *Priority*: —

---

### E. KPI Usefulness / Missing Production Metrics

**F20. No time-based KPIs at all — everything is a point-in-time count.**
Every number on the Dashboard is "how many right now." None answer "how long" or
"how well."
- *Why it matters*: a printing business runs on turnaround time, not headcount of
  open jobs. "12 waiting" doesn't tell an owner if the shop is fast or slow this
  week.
- *Suggested improvement*: add, in priority order: (1) average time-in-stage per
  department, (2) on-time completion rate (% of DONE stage instances that finished
  before `dueDate`), (3) oldest-waiting-job age ("backlog age").
- *Size*: Medium–Large (needs new aggregate queries over historical, not just
  open, stage instances).
- *Priority*: High

**F21. Failed/rework jobs are invisible once actioned.**
The queue only shows `WAITING`/`IN_PROGRESS` stage instances — the moment
something is marked `FAILED`, it disappears from Production Board entirely, and
nothing on the Dashboard counts failures. There is currently no place in the
product where an owner can see "how many jobs failed this week and why."
- *Why it matters*: failure/rework rate is a core quality metric for a print
  shop (wasted material, wasted time, customer-facing delay). Right now the data
  is captured (`WorkflowEvent` records the transition) but never surfaced.
- *Suggested improvement*: a "Failed this week" Dashboard widget, sourced from
  `WorkflowEvent` the same way `dailyProductionCount` already is.
- *Size*: Small–Medium (same pattern as the existing daily-production count).
- *Priority*: High

**F22. No throughput trend.**
`dailyProductionCount` is today-only, with no history, so there's no "jobs
completed per day this week" trend.
- *Why it matters*: a single day's count is noisy; a business owner judging
  shop performance needs the trend, not one data point. This is the same
  underlying gap as F2, called out separately here because it's a metrics gap,
  not just a display gap.
- *Suggested improvement*: a 7-day completed-stages sparkline/bar chart.
- *Size*: Medium.
- *Priority*: Medium

---

### F. Missing Alerts

**F23. The product is entirely pull-based — nothing pushes a problem at anyone.**
No notification center, no sidebar badge, no toast, no email/SMS. A delayed job
or a supplier delay is only visible if someone happens to open the Dashboard or
the right department's board.
- *Why it matters*: this is the single biggest gap for a real production
  environment. Delays and blockers need to reach a person, not wait for a person
  to go looking. Today, a job can sit delayed for days without anyone finding out
  unless they check.
- *Suggested improvement*: start small — a badge on the "لوحة الإنتاج" sidebar
  item showing the total delayed count app-wide (data already exists in
  `dashboard-summary`). Full alerting (email/SMS/push for a job crossing its due
  date) is a larger, separate effort and fits VISION.md's future AI Decision
  Support / Marketing Opportunity Detection pattern of proactive surfacing.
- *Size*: Small (sidebar badge) / Large (real alerting/notification system).
- *Priority*: **Critical** (sidebar badge specifically) / Future (full alerting)

---

### G. Empty States

**F24. Empty states are genuinely good — flagged as a strength, not a gap.**
Every screen checked (`Production Board`, all three list-style Dashboard widgets)
has a real, specific, Arabic empty-state message — "لا توجد مهام في قائمة الانتظار
لهذا القسم", "لا توجد تأخيرات من الموردين حاليًا", etc. — not a generic blank or
spinner-forever.
- *Why it matters*: this is exactly right and should be the template for every
  future screen.
- *Suggested improvement*: none needed. Minor polish only: none of the empty
  states offer a next action (which is correct here, since Production Board isn't
  where jobs get created) — no change recommended.
- *Size*: —
- *Priority*: — (strength, not a finding)

---

### H. Loading States

**F25. Loading states exist and are reasonable, with one gap (F13 above).**
`DashboardWidget` shows a spinner for `null` values instead of a misleading "0";
Production Board shows "جارٍ التحميل…" on first load. The one real gap is F13
(department switch doesn't reset the table), not a missing loading state per se.
- *Why it matters*: noted as a strength; F13 is the actionable item.
- *Suggested improvement*: see F13.
- *Size*: —
- *Priority*: —

---

### I. Mobile Usability

**F26. The Production Board's 8-column table requires horizontal scrolling to
reach the Actions column on a phone screen.**
Verified at a 375px viewport: department name, order number, stage, status,
priority, delay, employee, waiting-reason, and actions are all in one
`whitespace-nowrap` row inside a horizontally-scrolling table. The Actions column
— the single most-used part of the screen — is the last one, off-screen by
default.
- *Why it matters*: this table pattern is consistent with the rest of the app
  (Quotations, Partners, etc. use the same horizontal-scroll table, not a
  regression specific to this screen). But Production Board is far more likely
  than those back-office screens to be opened from a phone or shared tablet on
  the shop floor, which makes the same pattern considerably more costly here.
- *Suggested improvement*: a compact card layout for the queue below a breakpoint
  (order number + stage + status/priority badges + a visible primary action),
  replacing the table only on narrow screens.
- *Size*: Medium.
- *Priority*: High

**F27. Row action buttons (four per row: إنهاء/تخطي/فشل/تعديل) are tightly
packed, which is a bigger risk on a touchscreen than on desktop.**
- *Why it matters*: combined with F11 (no confirmation on Fail), a touch mis-tap
  is a real, live risk in exactly the physical environment this screen is built
  for.
- *Suggested improvement*: covered by F11 (confirm Fail) and F26 (card layout,
  which naturally gives touch targets more room).
- *Size*: —
- *Priority*: — (folded into F11/F26)

---

### J. Navigation & Information Hierarchy

**F28. No breadcrumb or page context on Production Board or Dashboard.**
The `Breadcrumbs` component exists and is used in Settings, but not on Production
Board or Dashboard.
- *Why it matters*: minor at the current one-level-deep navigation depth; would
  matter more once F16 (per-order timeline) or drill-down (F1) adds a second
  navigation level under Production Board.
- *Suggested improvement*: add breadcrumbs when — and only when — a
  drill-down/detail view is added under Production Board; not worth it for a
  single flat screen today.
- *Size*: Small.
- *Priority*: Low

**F29. Sidebar has no counts/badges anywhere.**
Every nav item, including "لوحة الإنتاج", is a plain label — no indication from
the sidebar alone that anything needs attention.
- *Why it matters*: duplicate of F23's sidebar-badge suggestion — listed here
  because it's also a navigation/information-hierarchy gap, not only an alerting
  gap.
- *Suggested improvement*: see F23.
- *Size*: —
- *Priority*: —

---

### K. Daily Production Workflow (end-to-end read)

**F30. Walking through "a supervisor's Monday morning" end-to-end surfaces the
cumulative effect of the findings above.**
Today that walk looks like: open Dashboard → see 9 unlinked numbers → open
Production Board → manually check up to 11 departments one at a time (no counts to
prioritize which to check first) → within a department, scan a flat table with no
filter, no due date, no customer name, and only a small badge marking trouble →
take an action with no confirmation and no success feedback.
- *Why it matters*: no single finding above is severe in isolation — together,
  they mean the current product answers "is something wrong" but requires real
  manual effort to answer "what, where, and how urgent." That's the gap between a
  working MVP and a tool a business owner reaches for every morning by habit.
- *Suggested improvement*: the Quick Wins and Sprint 2.5 items below are ordered
  specifically to close this walk-through gap first (F6, F8, F9, F10 turn the
  board into something scannable; F1, F3, F23 turn the Dashboard into something
  actionable).
- *Size*: — (summary finding)
- *Priority*: — (summary finding)

---

## Strengths Worth Preserving

Called out explicitly so future work builds on these rather than accidentally
undoing them:

- **One real number source.** Every widget and the Production Board read from
  the same `dashboard-summary`/`queue` endpoints with no duplicated calculation —
  the numbers will never quietly disagree with each other.
- **Sensible default queue ordering.** The department queue is already sorted by
  priority, then due date, then age — the right mental model for a work queue,
  done server-side, before any UI work happens on top of it.
- **Extensible widget/provider architecture.** Every new metric recommended above
  (F4, F20, F21, F22) is "write one new widget + register it" thanks to Sprint 1's
  registry pattern — this review should be cheap to act on precisely because that
  architecture exists.
- **Arabic-first, RTL-correct, permission-gated throughout**, with genuinely good
  empty states (F24). This is the right foundation to layer urgency/action onto.

---

## Roadmap

### Quick Wins
*(small, high-leverage, safe to do before Sprint 2.5 planning)*

| # | Finding | Priority |
|---|---------|----------|
| F6 | Department counts in the switcher | Critical |
| F8 | Due date + time-in-stage columns | Critical |
| F10 | Row-level color coding for delayed/urgent | High |
| F11 | Confirmation step on Fail | High |
| F13 | Clear table on department switch | Medium |
| F14 | Success toast after actions | Low |
| F5 (partial) | Manual refresh + "last updated" label | Medium |
| F23 (partial) | Sidebar badge with delayed-job count | Critical |
| F28 | (No action needed yet — explicitly deferred) | Low |

### Sprint 2.5
*(needs a small backend change, a new small screen, or touches several files —
right-sized for a dedicated sprint)*

| # | Finding | Priority |
|---|---------|----------|
| F9 | Customer/job identity on queue rows | Critical |
| F1 | Clickable widgets → filtered Production Board | Critical |
| F7 | Filter bar (priority / delayed-only / search) | High |
| F3 | Dashboard status strip (green/yellow/red) | High |
| F16 | Per-order cross-department timeline view | High |
| F21 | "Failed this week" metric + widget | High |
| F26 | Mobile card layout for Production Board | High |
| F4 | Supplier delay age, not just count | Medium |
| F12 | Stage-position indicator ("3 of 7") | Medium |

### Future Improvements
*(depends on data that doesn't exist yet, on VISION.md capabilities not yet due,
or is large enough to be its own feature)*

| # | Finding | Priority |
|---|---------|----------|
| F20 | Time-based KPIs (avg turnaround, on-time %, backlog age) | High |
| F22 | Throughput trend / weekly chart | Medium |
| F2 | Trend/delta indicators across widgets | High |
| F23 (full) | Real alerting (email/SMS/push on delay) | Future |
| F18 | Workload-vs-capacity per department | Low (Future) |
| F15 | Bulk queue actions | Low |
| F17 | Jobs-by-stage view | Low |

---

## Closing Note

None of the above requires re-architecting Sprint 1/2's foundations — every
suggestion builds on the widget registry, the provider pattern, the existing
`dashboard-summary` endpoint's fields, or data already stored on `StageInstance`.
The recommendation is to treat **Quick Wins** as a short polish pass before
FEATURE-006, and let the user decide whether **Sprint 2.5** happens now or is
folded into FEATURE-006's own planning.

No implementation was performed as part of this review.

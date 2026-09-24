import type { BranchFinancialSummary, CompanyFinancialSummary, ProfitabilityReport } from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { getDailyFixedCostByBranch } from './fixedExpensesService.js';
import { businessDayRangeUtc, todayInBusinessTimezone } from '../lib/businessTimezone.js';

/**
 * Owner (2026-08-26, "افصل تماماً بين أمين خزينة كليوباترا و أمين خزينة
 * برينتنج هاوس... صافي الربح من كل مكان لوحده... ولازم علشان يكون واضح
 * صافي الربح بالظبط يحسب فلوس نسبة الربح فقط") — جزء 2 من مبادرة "فصل
 * الخزينة/الربح بالفرع" (docs/AI/PROJECT_STATUS.md § 6، تكملة 33).
 *
 * Per-item profit resolution, in priority order:
 * 1. Margin-priced kinds (LOOSE_PAPER/NOTEBOOK/FOLDER/ENVELOPE/DIGITAL) —
 *    every one of them freezes `breakdown.subtotal` (the pre-margin cost)
 *    alongside `itemTotal` (subtotal × (1 + profitPercent/100)), so profit
 *    is `itemTotal - subtotal` — no lookup needed, always computable.
 * 2. INVENTORY_RETAIL — `inventoryItemId` is a real, always-populated FK;
 *    profit is `(chargedUnitPrice - InventoryItem.costPrice) × quantity`
 *    when a cost price has been recorded.
 * 3. PRODUCT — `readyProductId` is a real FK for any order created after
 *    2026-08-26 (see OrderItem.readyProductId's schema doc comment);
 *    older orders fall back to a best-effort `modelName` match against the
 *    current ReadyProduct catalog, same fragile-but-useful discipline
 *    `ReorderPredictionTab.tsx` already established for this exact gap.
 * 4. A MANUAL item with `ItemSupplierTask.cost` recorded on every one of
 *    its ad-hoc supplier legs (owner, 2026-09-09, "وفين السعر اللي هدفعه
 *    للمورد؟") — profit is `itemTotal - sum(supplierTasks.cost)`.
 * 5. BOARDS/SERVICE/MANUAL, or a retail/ready-product item with no cost
 *    price recorded — no cost basis exists yet. Contributes to `salesTotal`
 *    but *not* to `netProfit`, and flips `hasUnknownProfitItems` — a wrong
 *    guess would be worse than an honest gap here.
 *
 * Discounts (both this item's own `discountAmount` and the whole order's
 * `discountPercent`) reduce realized revenue the same way they reduce
 * `Order.finalTotal` itself (see orderService.ts's `afterDiscount`
 * formula) — the cost basis is never discount-adjusted (materials cost is
 * what it is regardless of what the customer was charged), so a heavy
 * discount correctly shrinks (or even zeroes out) the realized profit.
 */

interface ItemBreakdownShape {
  kind?: string;
  subtotal?: number;
  quantity?: number;
  unitPrice?: number;
  /** BOARDS only — see boardsCostCalculation.ts's `BoardsCostResult.supplierCost` doc comment (part 4 of this same initiative). */
  supplierCost?: number;
  /** LOOSE_PAPER/NOTEBOOK/FOLDER/ENVELOPE — zinc plates consumed, for the real zinc-supplier-cost calc below. */
  colorCount?: number;
  /** ENVELOPE only — the real per-piece supplier price the staff typed in at order time (already the true cost, no lookup needed). */
  readyEnvelopePricePerPiece?: number;
  /** NOTEBOOK (multi-material) only — each copy's own paper consumption, mirroring `OrderItem.materials`. */
  materials?: Array<{ inventoryItemId: string; sheetsNeeded: number }>;
  /** LOOSE_PAPER/FOLDER — sheets consumed (same value as the real `OrderItem.sheetsConsumed` column, also frozen into the breakdown itself). */
  sheetsNeeded?: number;
}

/**
 * Owner (2026-08-27, "سعر الزنكات بكام من عند المورد... وسعر الورق من عند
 * التاجر... علشان اقدر احسب فرق السعر والربح") — real cost for the OFFSET
 * family (LOOSE_PAPER/NOTEBOOK/FOLDER/ENVELOPE), using the real supplier
 * rates (`Setting.zincSupplierCost`/`SheetType.costPrice`) confirmed
 * separate from the padded pricing-formula inputs (`zincPrice`/
 * `SheetType.price`). Returns `null` (not a fallback estimate) unless BOTH
 * the paper cost and the zinc cost are fully resolvable — mixing one real
 * figure with one formula-derived guess would be a worse number than an
 * honest "unknown", not a better one.
 */
function resolveOffsetRealCost(
  breakdown: ItemBreakdownShape,
  item: { inventoryItemId: string | null },
  paperCostPriceByInventoryItemId: Map<string, number | null>,
  zincSupplierCost: number,
): number | null {
  if (zincSupplierCost <= 0) return null; // not configured yet (part 4's precedent: 0 = unconfigured)
  const colorCount = typeof breakdown.colorCount === 'number' ? breakdown.colorCount : 0;
  const zincCost = colorCount * zincSupplierCost;

  // ENVELOPE — the real supplier price is already what the staff typed in per order, no lookup needed.
  if (typeof breakdown.readyEnvelopePricePerPiece === 'number') {
    const quantity = typeof breakdown.quantity === 'number' ? breakdown.quantity : 0;
    return breakdown.readyEnvelopePricePerPiece * quantity + zincCost;
  }

  // NOTEBOOK (multi-material) — sum every copy's own paper.
  if (breakdown.materials && breakdown.materials.length > 0) {
    let paperCost = 0;
    for (const m of breakdown.materials) {
      const costPrice = paperCostPriceByInventoryItemId.get(m.inventoryItemId);
      if (costPrice == null) return null; // any copy missing a real cost — don't mix real+guessed
      paperCost += costPrice * m.sheetsNeeded;
    }
    return paperCost + zincCost;
  }

  // LOOSE_PAPER/FOLDER — single sheet-consuming material.
  if (item.inventoryItemId && typeof breakdown.sheetsNeeded === 'number') {
    const costPrice = paperCostPriceByInventoryItemId.get(item.inventoryItemId);
    if (costPrice == null) return null;
    return costPrice * breakdown.sheetsNeeded + zincCost;
  }

  return null;
}

/**
 * Accounting audit fix (2026-09-17, Phase 3/Decision 5) — every cost basis
 * this function can resolve now carries an explicit confidence tag instead
 * of collapsing into one blended `profit` number:
 *
 * - `REAL` — the cost figure traces directly to an owner-entered actual
 *   supplier rate/cost-price field (`InventoryItem.costPrice`,
 *   `ReadyProduct.costPrice`, `SheetType.costPrice`/`Setting.
 *   zincSupplierCost` for the OFFSET family, or the settings-configured
 *   supplier rate behind a BOARDS item's `breakdown.supplierCost` — the
 *   same figure `workflowInstanceService.maybeCreateBoardsSupplierPurchase`
 *   books as a real `SupplierPurchase`), or a `ItemSupplierTask.cost` whose
 *   task has actually reached `RECEIVED` (Decision 3 — only a RECEIVED
 *   task is a confirmed payable, not just a typed-in estimate).
 * - `ESTIMATED` — the pricing engine's own padded margin-ratio fallback
 *   (used only when a REAL rate isn't configured), or an
 *   `ItemSupplierTask.cost` whose task is still WAITING/SENT — a real
 *   number was typed in, but it is not yet a confirmed payable.
 * - `UNKNOWN` — no cost data resolvable at all; `profit`/`cost` stay
 *   `null`, exactly as before this fix (never a guess).
 *
 * `cost` is always derived as `revenue - profit` once profit is computed,
 * so the invariant `profit === revenue - cost` holds by construction —
 * there is no separate cost computation that could drift from it.
 */
export type CostConfidence = 'REAL' | 'ESTIMATED' | 'UNKNOWN';

export function resolveItemProfit(
  item: {
    itemTotal: number | null;
    discountAmount: number;
    breakdown: unknown;
    inventoryItemId: string | null;
    readyProductId: string | null;
    modelName: string | null;
    /**
     * Owner (2026-09-09, "وفين السعر اللي هدفعه للمورد؟ علشان تعرف تحسب
     * صافي الربح") — sum of a MANUAL item's `ItemSupplierTask.cost` rows,
     * only when every recorded leg has a cost (see the caller's own doc
     * comment). `null`/undefined = no known cost basis via this path,
     * same as before this field existed.
     */
    supplierTasksCost?: number | null;
    /**
     * Accounting audit fix (2026-09-17, Decision 5) — true only when
     * EVERY recorded supplier leg (the same set `supplierTasksCost` was
     * summed from) has reached `RECEIVED`. A cost typed in while a task is
     * still WAITING/SENT is a real number but not yet a confirmed
     * payable — classified `ESTIMATED`, not `REAL`, until then.
     */
    supplierTasksConfirmed?: boolean;
  },
  orderDiscountFactor: number,
  costPriceByInventoryItemId: Map<string, number | null>,
  costPriceByReadyProductId: Map<string, number | null>,
  costPriceByReadyProductName: Map<string, number | null>,
  paperCostPriceByInventoryItemId: Map<string, number | null> = new Map(),
  zincSupplierCost = 0,
): { revenue: number; profit: number | null; cost: number | null; confidence: CostConfidence } {
  const itemTotal = item.itemTotal ?? 0;
  const revenue = (itemTotal - item.discountAmount) * orderDiscountFactor;
  const breakdown = (item.breakdown ?? {}) as ItemBreakdownShape;

  const known = (profit: number, confidence: CostConfidence) => ({ revenue, profit, cost: revenue - profit, confidence });
  const unknown = () => ({ revenue, profit: null, cost: null, confidence: 'UNKNOWN' as const });

  // 1. Margin-priced kinds — subtotal is the pre-margin cost, always present.
  if (typeof breakdown.subtotal === 'number') {
    const realCost = resolveOffsetRealCost(breakdown, item, paperCostPriceByInventoryItemId, zincSupplierCost);
    if (realCost != null) {
      return known(revenue - realCost * orderDiscountFactor, 'REAL');
    }
    // Fallback — the pricing engine's own frozen (padded) cost baseline, same as before real supplier costs were tracked.
    const marginRatio = itemTotal > 0 ? (itemTotal - breakdown.subtotal) / itemTotal : 0;
    return known(revenue * marginRatio, 'ESTIMATED');
  }

  const quantity = typeof breakdown.quantity === 'number' ? breakdown.quantity : 1;
  const unitPrice = typeof breakdown.unitPrice === 'number' ? breakdown.unitPrice : null;

  // 2. INVENTORY_RETAIL — real FK, direct lookup.
  if (item.inventoryItemId) {
    const costPrice = costPriceByInventoryItemId.get(item.inventoryItemId);
    if (costPrice != null && unitPrice != null) {
      const costBasis = costPrice * quantity * orderDiscountFactor;
      return known(revenue - costBasis, 'REAL');
    }
    return unknown();
  }

  // 3. PRODUCT — real FK when present, best-effort name match otherwise.
  if (breakdown.kind === 'PRODUCT') {
    const costPrice = item.readyProductId
      ? costPriceByReadyProductId.get(item.readyProductId)
      : (item.modelName ? costPriceByReadyProductName.get(item.modelName.trim().toLowerCase()) : undefined);
    if (costPrice != null && unitPrice != null) {
      const costBasis = costPrice * quantity * orderDiscountFactor;
      return known(revenue - costBasis, 'REAL');
    }
    return unknown();
  }

  // 4. BOARDS — real supplier cost, computed at pricing time from the
  // area/piece geometry × the settings-configured supplier rate (part 4 of
  // this initiative) — the same figure that gets booked as a real
  // `SupplierPurchase` once the job reaches the EXTERNAL stage. `undefined`
  // means the item predates this feature or its material's supplier rate
  // was never configured (still 0/default) — an honest "unknown" rather
  // than a fabricated number.
  if (typeof breakdown.supplierCost === 'number') {
    const costBasis = breakdown.supplierCost * orderDiscountFactor;
    return known(revenue - costBasis, 'REAL');
  }

  // 5. MANUAL with ad-hoc supplier costs recorded (owner, 2026-09-09, "وفين
  // السعر اللي هدفعه للمورد؟") — REAL only once every recorded leg is
  // actually RECEIVED (a confirmed payable, Decision 3); ESTIMATED while
  // still WAITING/SENT (a real number, not yet a confirmed cost).
  if (item.supplierTasksCost != null) {
    const costBasis = item.supplierTasksCost * orderDiscountFactor;
    return known(revenue - costBasis, item.supplierTasksConfirmed ? 'REAL' : 'ESTIMATED');
  }

  // 6. SERVICE/MANUAL, or a BOARDS item with no supplier cost recorded — no cost basis concept yet.
  return unknown();
}

/**
 * Owner (2026-09-08, "ليه معملش دورين... افصلي الإتنين عن بعض وانا بس اللي
 * اقدر اشوف الحسابات بتاعت كل فرع على حده... ولو عايز اشوفه الإتنين مع
 * بعض تمام") — 🔴 this always computed and returned EVERY branch, with
 * zero scoping, to anyone holding `reports.view` — including a plain SALES
 * role (seeded with `reports.view` for its own unrelated reports), so a
 * cashier who also happens to carry SALES (e.g. one branch's front-desk
 * person) could see this widget with the OTHER branch's treasury/profit in
 * full. `branchIds` restricts every underlying query to that set — omitted
 * (the controller's SUPER_ADMIN case) keeps the original "every branch"
 * behavior unchanged; same "omit for admin, filter otherwise" shape as
 * `resolveBranchScope` in `treasuryEntries.ts`.
 */
export async function getCompanyFinancialSummary(branchIds?: string[]): Promise<CompanyFinancialSummary> {
  const branchWhere = branchIds ? { id: { in: branchIds } } : {};
  const entryBranchWhere = branchIds ? { branchId: { in: branchIds } } : {};
  // Accounting audit fix (2026-09-17, Phase B/time-basis) — `dailyFixedCost`
  // is inherently a ONE-DAY rate (its own name and formula say so); the
  // previous bug was subtracting it from an ALL-TIME cumulative `netProfit`
  // instead of TODAY's profit — two different time bases combined into one
  // number that corresponded to no real accounting period. `salesTotal`/
  // `treasuryBalance` below are UNCHANGED (still all-time — never flagged
  // as broken); only `netProfit`/`hasUnknownProfitItems`/the new REAL/
  // ESTIMATED/UNKNOWN breakdown are now scoped to TODAY (Cairo business
  // day), so they share the exact same period as the `dailyFixedCost`
  // they're compared against. `resolveBranchScope`/date-range-driven
  // reports (Phase C/D) are separate functions with an explicit,
  // caller-required range — this function's own no-argument shape keeps
  // serving the existing "today's spendable profit" dashboard widget.
  //
  // `todayInBusinessTimezone()` alone is NOT the right tool here — it
  // returns a day-bucketing LABEL (same calendar-day number as Cairo's
  // current date, expressed as literal UTC midnight; correct for a
  // `@db.Date` column like `AttendanceEntry.date`), not the real UTC
  // instant Cairo midnight falls at. Comparing a real timestamp
  // (`order.date`) against that label directly is wrong for roughly the
  // first 2-3 hours of every Cairo day (UTC is still "yesterday" by the
  // label's own numbering) — verified live: this exact mistake was caught
  // before commit by running this file's own test suite at 22:47 UTC,
  // when the bug reproduced immediately. `businessDayRangeUtc` is the
  // helper that resolves the real instant, and it's what `getReportsOverviewHandler`
  // and this same audit's own Phase 3 C/D report already use for
  // identical date-boundary comparisons — reused here rather than
  // re-deriving it.
  const todayStart = businessDayRangeUtc(todayInBusinessTimezone().toISOString().slice(0, 10)).start;
  const [branches, treasuryGrouped, orders, inventoryItems, readyProducts, paperInventoryItems, setting, dailyFixedCost] = await Promise.all([
    prisma.branch.findMany({ where: { isDeleted: false, ...branchWhere }, select: { id: true, name: true } }),
    prisma.treasuryEntry.groupBy({
      by: ['branchId', 'type'],
      where: { isDeleted: false, ...entryBranchWhere },
      _sum: { amount: true },
    }),
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' }, ...entryBranchWhere },
      select: {
        branchId: true,
        date: true,
        finalTotal: true,
        discountPercent: true,
        items: {
          select: {
            itemTotal: true,
            discountAmount: true,
            breakdown: true,
            inventoryItemId: true,
            readyProductId: true,
            modelName: true,
            // Owner (2026-09-09, "وفين السعر اللي هدفعه للمورد؟ علشان تعرف
            // تحسب صافي الربح") — real per-leg supplier cost for a manual
            // item with ad-hoc supplier work (see `resolveItemProfit`'s
            // step 3.5). `status` (Decision 5) distinguishes a confirmed
            // RECEIVED cost from a still-WAITING/SENT estimate.
            supplierTasks: { where: { isDeleted: false }, select: { cost: true, status: true } },
          },
        },
      },
    }),
    prisma.inventoryItem.findMany({ select: { id: true, costPrice: true } }),
    prisma.readyProduct.findMany({ where: { isDeleted: false }, select: { id: true, name: true, costPrice: true } }),
    // Owner (2026-08-27) — real merchant cost per paper type, for the OFFSET
    // real-cost calc (see `resolveOffsetRealCost`'s doc comment).
    prisma.inventoryItem.findMany({
      where: { sheetTypeId: { not: null } },
      select: { id: true, sheetType: { select: { costPrice: true } } },
    }),
    prisma.setting.findFirst({ select: { zincSupplierCost: true } }),
    getDailyFixedCostByBranch(),
  ]);

  const costPriceByInventoryItemId = new Map(inventoryItems.map((i) => [i.id, i.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductId = new Map(readyProducts.map((p) => [p.id, p.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductName = new Map(
    readyProducts.map((p) => [p.name.trim().toLowerCase(), p.costPrice?.toNumber() ?? null]),
  );
  const paperCostPriceByInventoryItemId = new Map(
    paperInventoryItems.map((i) => [i.id, i.sheetType?.costPrice?.toNumber() ?? null]),
  );
  const zincSupplierCost = setting?.zincSupplierCost.toNumber() ?? 0;

  const byBranch = new Map<
    string,
    {
      income: number;
      expense: number;
      salesTotal: number;
      salesCount: number;
      netProfit: number;
      realProfit: number;
      estimatedProfit: number;
      realCost: number;
      estimatedCost: number;
      unknownCostRevenue: number;
      hasUnknown: boolean;
    }
  >();
  const ensure = (branchId: string) => {
    const existing = byBranch.get(branchId);
    if (existing) return existing;
    const fresh = {
      income: 0,
      expense: 0,
      salesTotal: 0,
      salesCount: 0,
      netProfit: 0,
      realProfit: 0,
      estimatedProfit: 0,
      realCost: 0,
      estimatedCost: 0,
      unknownCostRevenue: 0,
      hasUnknown: false,
    };
    byBranch.set(branchId, fresh);
    return fresh;
  };

  for (const g of treasuryGrouped) {
    const entry = ensure(g.branchId);
    const amount = g._sum.amount?.toNumber() ?? 0;
    if (g.type === 'INCOME') entry.income += amount;
    else if (g.type === 'EXPENSE') entry.expense += amount;
  }

  for (const order of orders) {
    const entry = ensure(order.branchId);
    // `salesTotal`/`salesCount` stay ALL-TIME (unchanged) — only the
    // profit/cost-confidence breakdown below is scoped to today.
    entry.salesTotal += order.finalTotal.toNumber();
    entry.salesCount += 1;
    if (order.date < todayStart) continue;
    const orderDiscountFactor = 1 - order.discountPercent.toNumber() / 100;
    for (const item of order.items) {
      // Owner (2026-09-09) — a known cost basis only when EVERY recorded
      // supplier leg has a cost typed in; a partial cost would understate
      // the real spend and overstate profit, worse than an honest gap.
      const tasksWithCost = item.supplierTasks.every((t) => t.cost != null);
      const supplierTasksCost =
        item.supplierTasks.length > 0 && tasksWithCost
          ? item.supplierTasks.reduce((sum, t) => sum + t.cost!.toNumber(), 0)
          : null;
      const supplierTasksConfirmed = tasksWithCost && item.supplierTasks.every((t) => t.status === 'RECEIVED');
      const { revenue: itemRevenue, profit, cost, confidence } = resolveItemProfit(
        {
          itemTotal: item.itemTotal?.toNumber() ?? null,
          discountAmount: item.discountAmount.toNumber(),
          breakdown: item.breakdown,
          inventoryItemId: item.inventoryItemId,
          readyProductId: item.readyProductId,
          modelName: item.modelName,
          supplierTasksCost,
          supplierTasksConfirmed,
        },
        orderDiscountFactor,
        costPriceByInventoryItemId,
        costPriceByReadyProductId,
        costPriceByReadyProductName,
        paperCostPriceByInventoryItemId,
        zincSupplierCost,
      );
      if (profit === null || confidence === 'UNKNOWN') {
        entry.hasUnknown = true;
        entry.unknownCostRevenue += itemRevenue;
      } else {
        entry.netProfit += profit;
        if (confidence === 'REAL') {
          entry.realProfit += profit;
          entry.realCost += cost ?? 0;
        } else {
          entry.estimatedProfit += profit;
          entry.estimatedCost += cost ?? 0;
        }
      }
    }
  }

  const branchSummaries: BranchFinancialSummary[] = branches.map((branch) => {
    const entry = ensure(branch.id);
    // Owner (2026-09-08) — this branch's OWN overhead only (its scoped
    // `FixedMonthlyExpense` rows + its own staff's payroll), never a
    // company-wide expense — see `getDailyFixedCostByBranch`'s doc comment
    // for why that's added into the grand total separately instead.
    const branchDailyFixedCost = dailyFixedCost.perBranch.get(branch.id) ?? 0;
    return {
      branchId: branch.id,
      branchName: branch.name,
      treasuryIncome: entry.income,
      treasuryExpense: entry.expense,
      treasuryBalance: entry.income - entry.expense,
      salesTotal: entry.salesTotal,
      salesCount: entry.salesCount,
      // Accounting audit fix (2026-09-17, Phase B) — `netProfit` and
      // everything below it are now TODAY's figures (Cairo business day),
      // matching `dailyFixedCost`'s own period — `salesTotal` above stays
      // all-time, unchanged. See this function's own doc comment.
      netProfit: entry.netProfit,
      realProfit: entry.realProfit,
      estimatedProfit: entry.estimatedProfit,
      realCost: entry.realCost,
      estimatedCost: entry.estimatedCost,
      unknownCostRevenue: entry.unknownCostRevenue,
      hasUnknownProfitItems: entry.hasUnknown,
      dailyFixedCost: branchDailyFixedCost,
      netAfterDailyFixedCost: entry.netProfit - branchDailyFixedCost,
    };
  });

  const totalNetProfit = branchSummaries.reduce((sum, b) => sum + b.netProfit, 0);
  // Owner (2026-09-08) — the grand total additionally carries every
  // company-wide `FixedMonthlyExpense` (`branchId: null`) exactly once,
  // on top of each branch's own already-summed overhead — never per
  // branch (that would double- or triple-count it once more per branch).
  const totalDailyFixedCost = branchSummaries.reduce((sum, b) => sum + b.dailyFixedCost, 0) + dailyFixedCost.companyWideDaily;

  return {
    branches: branchSummaries,
    totalTreasuryBalance: branchSummaries.reduce((sum, b) => sum + b.treasuryBalance, 0),
    totalSales: branchSummaries.reduce((sum, b) => sum + b.salesTotal, 0),
    totalNetProfit,
    totalRealProfit: branchSummaries.reduce((sum, b) => sum + b.realProfit, 0),
    totalEstimatedProfit: branchSummaries.reduce((sum, b) => sum + b.estimatedProfit, 0),
    totalUnknownCostRevenue: branchSummaries.reduce((sum, b) => sum + b.unknownCostRevenue, 0),
    hasUnknownProfitItems: branchSummaries.some((b) => b.hasUnknownProfitItems),
    totalDailyFixedCost,
    totalNetAfterDailyFixedCost: totalNetProfit - totalDailyFixedCost,
  };
}

/**
 * Accounting audit fix (2026-09-17, Phase 3 C/D) — the Gross → Operating
 * Profit report plus the Revenue/Cash Received/AR breakdown, both scoped
 * to the SAME explicit `[from, to]` period and the caller's branch access
 * (`resolveBranchScope`-style — `undefined` branchIds means unrestricted,
 * an array clamps every query to it). See `ProfitabilityReport`'s own doc
 * comment in `@cleopatra/shared` for the exact accounting definition of
 * every field — none of them are invented here; each traces to an
 * existing Order/Payment/Return/Treasury/FixedMonthlyExpense query this
 * codebase already had, just consistently period- and branch-scoped.
 */
export async function getProfitabilityReport(from: Date, to: Date, branchIds?: string[]): Promise<ProfitabilityReport> {
  const dateFilter = { gte: from, lte: to };
  const branchWhere = branchIds ? { branchId: { in: branchIds } } : {};
  const orderBranchWhere = branchIds ? { branchId: { in: branchIds } } : {};

  const [
    periodOrders,
    periodReturns,
    periodPayments,
    arOrders,
    inventoryItems,
    readyProducts,
    paperInventoryItems,
    setting,
    dailyFixedCost,
    manualExpenseAgg,
  ] = await Promise.all([
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' }, date: dateFilter, ...orderBranchWhere },
      select: {
        finalTotal: true,
        discountPercent: true,
        items: {
          select: {
            itemTotal: true,
            discountAmount: true,
            breakdown: true,
            inventoryItemId: true,
            readyProductId: true,
            modelName: true,
            supplierTasks: { where: { isDeleted: false }, select: { cost: true, status: true } },
          },
        },
      },
    }),
    // Returns reduce THIS period's revenue (contra-revenue), regardless of
    // which period the original sale fell in — see the schema doc comment.
    prisma.orderItemReturn.findMany({
      where: { createdAt: dateFilter, ...branchWhere },
      select: { refundAmount: true },
    }),
    // Opening State / Cutover (Phase 3C.2 §15, mandatory) — "Cash Received"
    // is exactly that: real cash received in this period. A Payment with
    // sourceType OPENING_CREDIT_APPLICATION represents no new cash movement
    // at all (the cash was already counted once, inside TreasuryOpening, at
    // cutover) — summing it here unfiltered would overstate cash received
    // by exactly the amount of every opening-credit settlement.
    prisma.payment.findMany({
      where: {
        isDeleted: false,
        createdAt: dateFilter,
        sourceType: 'NORMAL',
        order: branchIds ? { branchId: { in: branchIds } } : {},
      },
      select: { amount: true },
    }),
    // AR — current outstanding balance (point-in-time, not period-bound),
    // scoped to the same branch access. Independent, deliberately not
    // reusing `reportsOverviewService.ts`'s own `totalCustomerDebt` — that
    // one is a documented, owner-approved always-company-wide figure never
    // scoped by branch; this is a separate, branch-respecting computation
    // for this specific report (see the audit's own Fix D discussion).
    prisma.order.findMany({
      where: { isDeleted: false, status: { not: 'CANCELLED' }, partnerId: { not: null }, ...orderBranchWhere },
      select: {
        finalTotal: true,
        payments: { where: { isDeleted: false }, select: { amount: true } },
        itemReturns: { select: { refundAmount: true } },
      },
    }),
    prisma.inventoryItem.findMany({ select: { id: true, costPrice: true } }),
    prisma.readyProduct.findMany({ where: { isDeleted: false }, select: { id: true, name: true, costPrice: true } }),
    prisma.inventoryItem.findMany({
      where: { sheetTypeId: { not: null } },
      select: { id: true, sheetType: { select: { costPrice: true } } },
    }),
    prisma.setting.findFirst({ select: { zincSupplierCost: true } }),
    getDailyFixedCostByBranch(),
    // Fix E's own reasoning applied here: only MANUAL EXPENSE entries — see
    // the schema doc comment for why SUPPLIER_PAYMENT/SALARY_PAYMENT/
    // EMPLOYEE_ADVANCE/RETURN are deliberately excluded (each already
    // counted elsewhere in this same report).
    prisma.treasuryEntry.aggregate({
      where: { isDeleted: false, type: 'EXPENSE', sourceType: 'MANUAL', date: dateFilter, ...branchWhere },
      _sum: { amount: true },
    }),
  ]);

  const costPriceByInventoryItemId = new Map(inventoryItems.map((i) => [i.id, i.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductId = new Map(readyProducts.map((p) => [p.id, p.costPrice?.toNumber() ?? null]));
  const costPriceByReadyProductName = new Map(
    readyProducts.map((p) => [p.name.trim().toLowerCase(), p.costPrice?.toNumber() ?? null]),
  );
  const paperCostPriceByInventoryItemId = new Map(
    paperInventoryItems.map((i) => [i.id, i.sheetType?.costPrice?.toNumber() ?? null]),
  );
  const zincSupplierCost = setting?.zincSupplierCost.toNumber() ?? 0;

  let grossRevenue = 0;
  let realCost = 0;
  let estimatedCost = 0;
  let unknownCostRevenue = 0;
  let realProfit = 0;
  let estimatedProfit = 0;
  let hasUnknownProfitItems = false;

  for (const order of periodOrders) {
    const orderDiscountFactor = 1 - order.discountPercent.toNumber() / 100;
    for (const item of order.items) {
      const tasksWithCost = item.supplierTasks.every((t) => t.cost != null);
      const supplierTasksCost =
        item.supplierTasks.length > 0 && tasksWithCost
          ? item.supplierTasks.reduce((sum, t) => sum + t.cost!.toNumber(), 0)
          : null;
      const supplierTasksConfirmed = tasksWithCost && item.supplierTasks.every((t) => t.status === 'RECEIVED');
      const { revenue, profit, cost, confidence } = resolveItemProfit(
        {
          itemTotal: item.itemTotal?.toNumber() ?? null,
          discountAmount: item.discountAmount.toNumber(),
          breakdown: item.breakdown,
          inventoryItemId: item.inventoryItemId,
          readyProductId: item.readyProductId,
          modelName: item.modelName,
          supplierTasksCost,
          supplierTasksConfirmed,
        },
        orderDiscountFactor,
        costPriceByInventoryItemId,
        costPriceByReadyProductId,
        costPriceByReadyProductName,
        paperCostPriceByInventoryItemId,
        zincSupplierCost,
      );
      grossRevenue += revenue;
      if (profit === null || confidence === 'UNKNOWN') {
        hasUnknownProfitItems = true;
        unknownCostRevenue += revenue;
      } else if (confidence === 'REAL') {
        realProfit += profit;
        realCost += cost ?? 0;
      } else {
        estimatedProfit += profit;
        estimatedCost += cost ?? 0;
      }
    }
  }

  const returnedAmount = periodReturns.reduce((sum, r) => sum + r.refundAmount.toNumber(), 0);
  const revenue = grossRevenue - returnedAmount;
  const cashReceived = periodPayments.reduce((sum, p) => sum + p.amount.toNumber(), 0);

  let accountsReceivable = 0;
  for (const order of arOrders) {
    const paid = order.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    const returned = order.itemReturns.reduce((sum, r) => sum + r.refundAmount.toNumber(), 0);
    const remaining = order.finalTotal.toNumber() - returned - paid;
    if (remaining > 0) accountsReceivable += remaining;
  }

  // Phase B discipline — the fixed-cost rate is per-day; multiply by the
  // exact number of days this report's own period spans, never a
  // mismatched fixed one-day assumption. Company-wide `FixedMonthlyExpense`
  // rows (branchId: null) are added exactly once regardless of scope — a
  // branch-scoped caller still owes their share of company-wide overhead,
  // same as `getCompanyFinancialSummary`'s own grand total does.
  // +1ms accounts for an inclusive `to` conventionally landing at
  // 23:59:59.999 of its day (e.g. `businessDayRangeUtc`'s own `end`) —
  // without it, a "from=day1 00:00, to=day2 23:59:59.999" range (2 whole
  // days) would compute as 1.999.. days and round down to a wrong count.
  const daysInRange = Math.max(1, Math.round((to.getTime() - from.getTime() + 1) / 86400000));
  const scopedBranchIds = branchIds ?? [...dailyFixedCost.perBranch.keys()];
  const dailyFixedCostTotal =
    scopedBranchIds.reduce((sum, id) => sum + (dailyFixedCost.perBranch.get(id) ?? 0), 0) + dailyFixedCost.companyWideDaily;
  const fixedExpenseCost = dailyFixedCostTotal * daysInRange;

  const manualTreasuryExpenses = manualExpenseAgg._sum.amount?.toNumber() ?? 0;
  const grossProfit = realProfit + estimatedProfit;
  const operatingExpenses = fixedExpenseCost + manualTreasuryExpenses;

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    revenue,
    cashReceived,
    accountsReceivable,
    realCost,
    estimatedCost,
    unknownCostRevenue,
    realProfit,
    estimatedProfit,
    grossProfit,
    fixedExpenseCost,
    manualTreasuryExpenses,
    operatingExpenses,
    operatingProfit: grossProfit - operatingExpenses,
    hasUnknownProfitItems,
  };
}

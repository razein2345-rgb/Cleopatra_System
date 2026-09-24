import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CompanyFinancialSummary } from '@cleopatra/shared';
import { BranchFinancialSummaryTable } from './BranchFinancialSummaryTable';

const HINT = 'لسه مفيش مبيعات النهارده — الرقم = المصاريف الثابتة بس، هيتحسّن مع أول أوردر';
const ROW_TAG = '(لسه مفيش مبيعات)';

function branch(id: string, name: string, overrides: Partial<CompanyFinancialSummary['branches'][number]> = {}) {
  return {
    branchId: id,
    branchName: name,
    treasuryIncome: 0,
    treasuryExpense: 0,
    treasuryBalance: 0,
    salesTotal: 1000,
    salesCount: 5,
    netProfit: 0,
    realProfit: 0,
    estimatedProfit: 0,
    realCost: 0,
    estimatedCost: 0,
    unknownCostRevenue: 0,
    hasUnknownProfitItems: false,
    dailyFixedCost: 210,
    netAfterDailyFixedCost: -210,
    ...overrides,
  };
}

function summaryOf(branches: CompanyFinancialSummary['branches']): CompanyFinancialSummary {
  return {
    branches,
    totalTreasuryBalance: 0,
    totalSales: 0,
    totalNetProfit: 0,
    totalRealProfit: branches.reduce((s, b) => s + b.realProfit, 0),
    totalEstimatedProfit: branches.reduce((s, b) => s + b.estimatedProfit, 0),
    totalUnknownCostRevenue: branches.reduce((s, b) => s + b.unknownCostRevenue, 0),
    hasUnknownProfitItems: false,
    totalDailyFixedCost: branches.reduce((s, b) => s + b.dailyFixedCost, 0),
    totalNetAfterDailyFixedCost: branches.reduce((s, b) => s + b.netAfterDailyFixedCost, 0),
  };
}

const render = (s: CompanyFinancialSummary) => renderToStaticMarkup(createElement(BranchFinancialSummaryTable, { summary: s }));
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('BranchFinancialSummaryTable — "no sales yet today" hint', () => {
  it('every branch idle: tags each row and shows the explanatory sentence under the table', () => {
    const html = render(summaryOf([branch('b1', 'كليوباترا'), branch('b2', 'برينتنج هاوس')]));
    expect(count(html, ROW_TAG)).toBe(2);
    // once as the visible sentence, twice more inside the rows' tooltips
    expect(html).toContain(`>${HINT}</p>`);
  });

  it('a branch with real profit today gets no tag, and the sentence is not shown while any branch is active', () => {
    const html = render(
      summaryOf([
        branch('b1', 'كليوباترا', { realProfit: 300, netAfterDailyFixedCost: 90 }),
        branch('b2', 'برينتنج هاوس'),
      ]),
    );
    expect(count(html, ROW_TAG)).toBe(1); // only the idle branch
    expect(html).not.toContain(`>${HINT}</p>`);
  });

  it('estimated profit or unknown-cost revenue alone counts as activity (no false "no sales" claim)', () => {
    const estimatedOnly = render(summaryOf([branch('b1', 'x', { estimatedProfit: 40 })]));
    const unknownOnly = render(summaryOf([branch('b1', 'x', { unknownCostRevenue: 500, hasUnknownProfitItems: true })]));
    expect(estimatedOnly).not.toContain(ROW_TAG);
    expect(unknownOnly).not.toContain(ROW_TAG);
  });

  it('a summary with no branches renders without the hint', () => {
    expect(render(summaryOf([]))).not.toContain(HINT);
  });
});

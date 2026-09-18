import { describe, expect, it } from 'vitest';
import { findHelpTopics, SYSTEM_HELP_TOPICS } from './helpKnowledge.js';

describe('findHelpTopics', () => {
  it('finds an exact topic by a natural-language question matching its keyword', () => {
    const results = findHelpTopics('إزاي أعمل إغلاق اليومية؟');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.id).toBe('daily_closure');
  });

  it('finds a topic via a short Arabic keyword alone', () => {
    const results = findHelpTopics('اوفست');
    expect(results.some((r) => r.id === 'offset_workflow')).toBe(true);
  });

  it('finds the digital workflow topic via a short Arabic keyword alone', () => {
    const results = findHelpTopics('ديجيتال');
    expect(results.some((r) => r.id === 'digital_workflow')).toBe(true);
  });

  it('finds a navigation/help query ("فين أقدر أشوف...")', () => {
    const results = findHelpTopics('فين أقدر أشوف الخزينة؟');
    expect(results.length).toBeGreaterThan(0);
  });

  it('is tolerant of common Arabic hamza spelling variants (أ/إ/آ vs bare ا)', () => {
    // The stored keyword is written with a bare alef ("فين اقدر اشوف") —
    // this confirms a hamza'd query still matches, not just an exact echo
    // of the stored spelling.
    const results = findHelpTopics('فين أقدر أشوف الخزينة؟');
    expect(results.some((r) => r.id === 'navigation_map')).toBe(true);
  });

  it('returns an empty list for a query with no relevant topic — never a guessed answer', () => {
    const results = findHelpTopics('zzz completely unrelated nonsense query 12345');
    expect(results).toEqual([]);
  });

  it('returns an empty list for an empty/whitespace-only query without throwing', () => {
    expect(findHelpTopics('')).toEqual([]);
    expect(findHelpTopics('   ')).toEqual([]);
  });

  it('every topic has a non-empty id, title, category, and answer (content sanity)', () => {
    for (const topic of SYSTEM_HELP_TOPICS) {
      expect(topic.id.length).toBeGreaterThan(0);
      expect(topic.title.length).toBeGreaterThan(0);
      expect(topic.category.length).toBeGreaterThan(0);
      expect(topic.answer.length).toBeGreaterThan(0);
      expect(topic.keywords.length).toBeGreaterThan(0);
    }
  });

  it('topic ids are unique', () => {
    const ids = SYSTEM_HELP_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * Task 15.4 — grounded keyword/topic additions for the six natural-
 * language questions Task 15.3 found unreachable. Each expected topic id
 * matches the grounded fact verified against real code (see
 * `helpKnowledge.ts`'s own per-topic doc comments for the exact source).
 */
describe('findHelpTopics — Task 15.4 natural-language coverage', () => {
  it('1. "فين الخزينة؟" resolves to the navigation map', () => {
    const results = findHelpTopics('فين الخزينة؟');
    expect(results.some((r) => r.id === 'navigation_map')).toBe(true);
  });

  it('2. "أمر الشغل بيتعمل إمتى؟" resolves to work_order_basics', () => {
    const results = findHelpTopics('أمر الشغل بيتعمل إمتى؟');
    expect(results.some((r) => r.id === 'work_order_basics')).toBe(true);
  });

  it('3. "العميل بيتحدد إزاي؟" resolves to new_order', () => {
    const results = findHelpTopics('العميل بيتحدد إزاي؟');
    expect(results.some((r) => r.id === 'new_order')).toBe(true);
  });

  it('4. "مين يقدر يعيد فتح اليوم؟" resolves to daily_closure despite the يعيد/إعادة mismatch', () => {
    const results = findHelpTopics('مين يقدر يعيد فتح اليوم؟');
    expect(results.some((r) => r.id === 'daily_closure')).toBe(true);
  });

  it('5. "هل التصميم إجباري؟" resolves to the new design_requirement topic, with the track-dependent answer', () => {
    const results = findHelpTopics('هل التصميم إجباري؟');
    expect(results[0]?.id).toBe('design_requirement');
    expect(results[0]?.answer).toContain('اللوحات والإعلانات');
    expect(results[0]?.answer).toContain('اختيارية');
  });

  it('6. "المخزون بيتابع إزاي؟" resolves to the new inventory_tracking topic', () => {
    const results = findHelpTopics('المخزون بيتابع إزاي؟');
    expect(results.some((r) => r.id === 'inventory_tracking')).toBe(true);
  });
});

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

import { describe, expect, it, vi } from 'vitest';

/**
 * Task 14.1 requirement — prove `search_help_topics` never touches the
 * database, not just infer it from code review. Any property access on
 * `prisma` throws immediately, so a passing test here is a direct runtime
 * guarantee: this tool's `execute()` cannot have gone anywhere near
 * Prisma/the database, or this whole file would fail.
 */
vi.mock('../../../lib/prisma.js', () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error('search_help_topics must never access prisma');
      },
    },
  ),
}));

const { searchHelpTopicsTool } = await import('./searchHelpTopics.js');

function fakeAuth() {
  return {
    staffId: 'staff-1',
    supabaseUserId: 'sb-1',
    name: 'Test User',
    email: 'test@example.com',
    branchId: 'branch-1',
    isActive: true,
    roleNames: ['SALES'],
    permissions: [],
    accessibleBranchIds: ['branch-1'],
    accessibleDepartmentIds: [],
    lastActiveAt: null,
  } as never;
}

describe('search_help_topics tool', () => {
  it('never touches the database', async () => {
    await expect(searchHelpTopicsTool.execute({ query: 'إغلاق اليومية' }, { auth: fakeAuth() })).resolves.toBeDefined();
  });

  it('requires no permission — any authenticated staff member can ask', () => {
    expect(searchHelpTopicsTool.requiredPermission).toBeNull();
    expect(searchHelpTopicsTool.requiresSuperAdmin).toBeUndefined();
  });

  it('finds the daily closure topic for an exact-ish natural-language question', async () => {
    const result = (await searchHelpTopicsTool.execute({ query: 'إزاي أعمل إغلاق اليومية؟' }, { auth: fakeAuth() })) as {
      id: string;
    }[];
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.id).toBe('daily_closure');
  });

  it('finds the offset workflow topic via a short Arabic keyword', async () => {
    const result = (await searchHelpTopicsTool.execute({ query: 'خطوات تشغيل اوفست' }, { auth: fakeAuth() })) as {
      id: string;
    }[];
    expect(result.some((r) => r.id === 'offset_workflow')).toBe(true);
  });

  it('finds the digital workflow topic via a short Arabic keyword', async () => {
    const result = (await searchHelpTopicsTool.execute({ query: 'مراحل الديجيتال' }, { auth: fakeAuth() })) as {
      id: string;
    }[];
    expect(result.some((r) => r.id === 'digital_workflow')).toBe(true);
  });

  it('finds a navigation topic for a "where can I see X" question', async () => {
    const result = (await searchHelpTopicsTool.execute({ query: 'فين أقدر أشوف الخزينة' }, { auth: fakeAuth() })) as unknown[];
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns an empty array — never a guessed answer — when nothing matches', async () => {
    const result = await searchHelpTopicsTool.execute({ query: 'completely unrelated zzz nonsense 99999' }, { auth: fakeAuth() });
    expect(result).toEqual([]);
  });

  it('returns no business data of any kind — only id/title/category/answer keys', async () => {
    const result = (await searchHelpTopicsTool.execute({ query: 'اوفست' }, { auth: fakeAuth() })) as Record<string, unknown>[];
    for (const topic of result) {
      expect(Object.keys(topic).sort()).toEqual(['answer', 'category', 'id', 'title']);
    }
  });

  it('rejects an empty query via schema validation', () => {
    expect(searchHelpTopicsTool.inputSchema.safeParse({ query: '' }).success).toBe(false);
  });

  it('rejects a missing query via schema validation', () => {
    expect(searchHelpTopicsTool.inputSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a valid query and normalizes surrounding whitespace', () => {
    const parsed = searchHelpTopicsTool.inputSchema.safeParse({ query: '  اوفست  ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.query).toBe('اوفست');
  });
});

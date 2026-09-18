import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { AiChatTurn } from '@cleopatra/shared';
import type { AnyAiToolDefinition } from './ai/toolTypes.js';
import type { LlmConverseInput, LlmConverseResult, LlmProvider } from './ai/llmProvider.js';

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const VALID_ID_2 = '22222222-2222-2222-2222-222222222222';

const readExecute = vi.fn(async (input: { id: string }) => ({ echo: input.id }));
const superAdminExecute = vi.fn(async () => ({ secret: true }));

const fakeReadTool: AnyAiToolDefinition = {
  name: 'fake_read',
  description: 'A fake read tool for orchestrator tests',
  requiredPermission: 'test.read',
  inputSchema: z.object({ id: z.string().uuid() }),
  inputJsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: readExecute as unknown as AnyAiToolDefinition['execute'],
};

const fakeSuperAdminTool: AnyAiToolDefinition = {
  name: 'fake_super_admin',
  description: 'A fake SUPER_ADMIN-only tool for orchestrator tests',
  requiredPermission: null,
  requiresSuperAdmin: true,
  inputSchema: z.object({}),
  inputJsonSchema: { type: 'object', properties: {} },
  execute: superAdminExecute as unknown as AnyAiToolDefinition['execute'],
};

/**
 * Task 12 — Guard A fakes. Named EXACTLY like the real tools
 * (`get_customer`/`search_customers`, `get_quotation`/`search_quotations`)
 * on purpose: `READ_GUARD_ENTITY_TOOLS` (readGuardMetadata.ts, NOT mocked
 * here) keys its allowlist by these literal real tool names, so reusing
 * them lets these tests exercise the real guard-metadata lookup while
 * still using fully fake, controllable `execute()`s — same pattern as
 * `fakeReadTool`/`fakeSuperAdminTool` above, just under names the guard
 * actually recognizes.
 */
const getCustomerExecute = vi.fn(async (input: { id: string }) => ({ found: true, partner: { id: input.id } }));
const searchCustomersExecute = vi.fn(async (input: { query?: string }) => [{ id: VALID_ID_2, nameAr: input.query ?? '' }]);
const getQuotationExecute = vi.fn(async (input: { id: string }) => ({ found: true, quotation: { id: input.id } }));
const searchQuotationsExecute = vi.fn(async (input: { query?: string }) => [{ id: VALID_ID_2, quotationNumber: input.query ?? '' }]);

const fakeGetCustomerTool: AnyAiToolDefinition = {
  name: 'get_customer',
  description: 'Fake get_customer for Task 12 guard tests',
  requiredPermission: 'partners.view',
  inputSchema: z.object({ id: z.string().uuid() }),
  inputJsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: getCustomerExecute as unknown as AnyAiToolDefinition['execute'],
};

const fakeSearchCustomersTool: AnyAiToolDefinition = {
  name: 'search_customers',
  description: 'Fake search_customers for Task 12 guard tests',
  requiredPermission: 'partners.view',
  inputSchema: z.object({ query: z.string().trim().min(1).max(200).optional() }),
  inputJsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
  execute: searchCustomersExecute as unknown as AnyAiToolDefinition['execute'],
};

const fakeGetQuotationTool: AnyAiToolDefinition = {
  name: 'get_quotation',
  description: 'Fake get_quotation for Task 12 guard tests',
  requiredPermission: 'quotations.view',
  inputSchema: z.object({ id: z.string().uuid() }),
  inputJsonSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  execute: getQuotationExecute as unknown as AnyAiToolDefinition['execute'],
};

const fakeSearchQuotationsTool: AnyAiToolDefinition = {
  name: 'search_quotations',
  description: 'Fake search_quotations for Task 12 guard tests',
  requiredPermission: 'quotations.view',
  inputSchema: z.object({ query: z.string().trim().min(1).max(200).optional() }),
  inputJsonSchema: { type: 'object', properties: { query: { type: 'string' } } },
  execute: searchQuotationsExecute as unknown as AnyAiToolDefinition['execute'],
};

/**
 * Task 15.7 — named exactly `search_help_topics` for the same reason the
 * Task 12 fakes above are named after their real tools: `toolRouting.ts`'s
 * `TOOL_DOMAINS`/`HELP_INTENT_PATTERNS` (NOT mocked here) key their HELP
 * classification by this literal real tool name, so the fallback's own
 * `selectedTools[0]?.name === 'search_help_topics'` check exercises the
 * real routing decision end-to-end while `execute()` stays fully fake and
 * controllable.
 */
const helpTopicsExecute = vi.fn(async (input: { query: string }) => [{ id: 'test_topic', title: 'Test Topic', category: 'test', answer: `topic answer for: ${input.query}` }]);

const fakeSearchHelpTopicsTool: AnyAiToolDefinition = {
  name: 'search_help_topics',
  description: 'Fake search_help_topics for Task 15.7 fallback tests',
  requiredPermission: null,
  inputSchema: z.object({ query: z.string().trim().min(1).max(200) }),
  inputJsonSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  execute: helpTopicsExecute as unknown as AnyAiToolDefinition['execute'],
};

/**
 * Task 15.7 fix — the real `AI_TOOLS` registry has THREE `requiredPermission:
 * null` tools (`calculate_price`, `get_dashboard_summary`,
 * `search_help_topics`), never just one. Before this fix, this fixture only
 * had `fakeSearchHelpTopicsTool` as a null-permission tool, so a
 * default-permission `auth()` with no matching domain/context keyword made
 * `selectToolsForRequest`'s `allowedTools` fallback accidentally resolve to
 * exactly `[fakeSearchHelpTopicsTool]` — colliding with the new
 * `isHelpExclusiveRequest` check for tests that have nothing to do with
 * HELP. These two mirror the real tools' names (so the real, unmocked
 * `toolRouting.ts` classifies them under PRICING/DASHBOARD, never HELP) and
 * null permission, restoring the real 3-tool composition.
 */
const fakeCalculatePriceTool: AnyAiToolDefinition = {
  name: 'calculate_price',
  description: 'Fake calculate_price for Task 15.7 fallback-collision fix',
  requiredPermission: null,
  inputSchema: z.object({}),
  inputJsonSchema: { type: 'object', properties: {} },
  execute: vi.fn(async () => ({})) as unknown as AnyAiToolDefinition['execute'],
};

const fakeDashboardSummaryTool: AnyAiToolDefinition = {
  name: 'get_dashboard_summary',
  description: 'Fake get_dashboard_summary for Task 15.7 fallback-collision fix',
  requiredPermission: null,
  inputSchema: z.object({}),
  inputJsonSchema: { type: 'object', properties: {} },
  execute: vi.fn(async () => ({})) as unknown as AnyAiToolDefinition['execute'],
};

vi.mock('./ai/tools/index.js', () => ({
  AI_TOOLS: [
    fakeReadTool,
    fakeSuperAdminTool,
    fakeGetCustomerTool,
    fakeSearchCustomersTool,
    fakeGetQuotationTool,
    fakeSearchQuotationsTool,
    fakeSearchHelpTopicsTool,
    fakeCalculatePriceTool,
    fakeDashboardSummaryTool,
  ],
}));

/**
 * Task 8 — the real `extractConversationContext` is keyed by real tool
 * names (`get_work_order`, `search_suppliers`, ...), none of which this
 * file's fake tools use — its own mapper logic is covered separately and
 * thoroughly in `ai/conversationContext.test.ts` with real fixtures. Here
 * we only need to test `runAiChat`'s *wiring* (does it call the extractor
 * after a successful dispatch, inject an incoming context, apply "last
 * eligible wins") in isolation from that mapper logic, so it's mocked with
 * a controllable stub instead.
 */
const mockExtractConversationContext = vi.fn<(toolName: string, content: string) => unknown>();

vi.mock('./ai/conversationContext.js', () => ({
  extractConversationContext: (toolName: string, content: string) => mockExtractConversationContext(toolName, content),
}));

const { runAiChat, __setProviderForTests } = await import('./aiAgentService.js');

function auth(overrides: Partial<{ permissions: string[]; roleNames: string[] }> = {}) {
  return {
    staffId: 'staff-1',
    supabaseUserId: 'sb-1',
    name: 'Test User',
    email: 'test@example.com',
    branchId: 'branch-1',
    isActive: true,
    roleNames: overrides.roleNames ?? ['SALES'],
    permissions: overrides.permissions ?? [],
    accessibleBranchIds: ['branch-1'],
    accessibleDepartmentIds: [],
    lastActiveAt: null,
  };
}

function turns(text: string): AiChatTurn[] {
  return [{ role: 'user', text }];
}

/** Queue-based fake provider — each call to `converse` returns the next queued result, in order. */
function queueProvider(results: LlmConverseResult[]): LlmProvider & { calls: LlmConverseInput[] } {
  const calls: LlmConverseInput[] = [];
  let i = 0;
  return {
    calls,
    async converse(input) {
      calls.push(input);
      const result = results[i];
      i++;
      if (!result) throw new Error('queueProvider ran out of queued results');
      return result;
    },
  };
}

beforeEach(() => {
  readExecute.mockClear();
  superAdminExecute.mockClear();
  getCustomerExecute.mockClear();
  searchCustomersExecute.mockClear();
  getQuotationExecute.mockClear();
  searchQuotationsExecute.mockClear();
  helpTopicsExecute.mockClear();
  __setProviderForTests(null);
  // Default: no tool call in these pre-existing tests is meant to produce a
  // context — matches their original behavior exactly (none of them assert
  // on `result.context`, so this must stay a no-op unless a Task 8 test
  // below explicitly overrides it).
  mockExtractConversationContext.mockReset();
  mockExtractConversationContext.mockReturnValue(null);
});

describe('runAiChat — permission enforcement (dispatcher gate, before execute)', () => {
  it('calls the tool and returns the final answer when the caller has the required permission', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'دي البيانات اللي طلبتها', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال تجريبي'));

    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(readExecute).toHaveBeenCalledWith({ id: VALID_ID }, expect.anything());
    expect(result.reply).toBe('دي البيانات اللي طلبتها');
    expect(result.toolsUsed).toEqual(['fake_read']);
  });

  it('never calls execute for a caller missing the required permission, and relays a plain-language refusal', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'معنديش صلاحية أعرض ده', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: [] }), turns('سؤال تجريبي'));

    expect(readExecute).not.toHaveBeenCalled();
    // The tool_result fed back to the model on the second turn must name the missing permission.
    const secondCallMessages = provider.calls[1]!.messages;
    const toolResultMessage = secondCallMessages.at(-1)!;
    const toolResultPart = toolResultMessage.content[0] as { type: 'tool_result'; content: string; isError?: boolean };
    expect(toolResultPart.isError).toBe(true);
    expect(toolResultPart.content).toContain('test.read');
    expect(result.reply).toBe('معنديش صلاحية أعرض ده');
  });

  it('never calls execute for a SUPER_ADMIN-only tool when the caller is not SUPER_ADMIN', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_super_admin', input: {} }], stopReason: 'tool_use' },
      { text: 'محتاج صلاحية أعلى', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ roleNames: ['ADMIN'], permissions: ['*'] }), turns('اديني المرتبات'));

    expect(superAdminExecute).not.toHaveBeenCalled();
  });

  it('allows a SUPER_ADMIN-only tool for a caller who is actually SUPER_ADMIN', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_super_admin', input: {} }], stopReason: 'tool_use' },
      { text: 'تمام', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ roleNames: ['SUPER_ADMIN'] }), turns('اديني المرتبات'));

    expect(superAdminExecute).toHaveBeenCalledTimes(1);
  });
});

describe('runAiChat — input validation (rejected before execute runs)', () => {
  it('rejects a malformed tool call without ever invoking execute', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: 'not-a-uuid' } }], stopReason: 'tool_use' },
      { text: 'مش قادر أتأكد من ده', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    expect(readExecute).not.toHaveBeenCalled();
  });

  it('reports an unknown tool name gracefully instead of crashing', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'does_not_exist', input: {} }], stopReason: 'tool_use' },
      { text: 'معرفش أعمل ده', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth(), turns('سؤال'));
    expect(result.reply).toBe('معرفش أعمل ده');
  });
});

describe('runAiChat — failure handling', () => {
  it('stops after a bounded number of tool iterations instead of looping forever', async () => {
    const infiniteResults: LlmConverseResult[] = Array.from({ length: 20 }, () => ({
      text: null,
      toolCalls: [{ id: 'call', name: 'fake_read', input: { id: VALID_ID } }],
      stopReason: 'tool_use' as const,
    }));
    __setProviderForTests(queueProvider(infiniteResults));

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));
    expect(result.reply).toContain('محتاج خطوات كتير');
  });

  it('propagates a provider failure rather than fabricating an answer (the controller turns this into a safe message)', async () => {
    __setProviderForTests({
      async converse(): Promise<LlmConverseResult> {
        throw new Error('network exploded');
      },
    });

    await expect(runAiChat(auth(), turns('سؤال'))).rejects.toThrow('network exploded');
  });

  /**
   * Task 13.1 — Task 13's audit found `dispatchTool`'s catch around
   * `tool.execute()` was completely silent, so a real failure (e.g. a
   * database error inside a tool) was indistinguishable from any other
   * cause once it reached the model. This test locks the fix: the caught
   * exception is now logged server-side (`console.error`, this codebase's
   * existing convention — see `jobs/autoCloseDayJob.ts`), while the
   * model/user-facing result is completely unchanged — same generic
   * Arabic fallback, same `isError: true` shape, zero raw exception text
   * anywhere in what the model or user ever sees.
   */
  it('an execute() exception is logged server-side but never leaks past the generic Arabic fallback', async () => {
    const dbFailure = new Error('ECONNRESET: simulated database failure');
    readExecute.mockRejectedValueOnce(dbFailure);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'معلش، حصل عندي مشكلة', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    const toolResultMessage = provider.calls[1].messages.at(-1);
    const toolResult = toolResultMessage?.content.find((p) => p.type === 'tool_result');
    expect(toolResult?.isError).toBe(true);
    expect(toolResult?.content).toBe('تعذر الوصول للبيانات دلوقتي، جرّب تاني بعد لحظة.');
    expect(toolResult?.content).not.toContain('ECONNRESET');
    expect(toolResult?.content).not.toContain(dbFailure.message);

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('fake_read'), dbFailure);
    consoleErrorSpy.mockRestore();
  });
});

describe('runAiChat — duplicate read-tool call guard (Gap 3, 2026-09-11)', () => {
  it('Test 1 — blocks an exact duplicate call (same tool, same arguments) within one request', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: null, toolCalls: [{ id: 'call2', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    // The real read only ever executes once — the second identical request is short-circuited.
    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('خلصت');

    // The model still receives a tool_result for the duplicate call (never silently dropped) —
    // just a note pointing back at the already-fetched answer, not a second live query.
    const thirdCallMessages = provider.calls[2]!.messages;
    const secondRoundResults = thirdCallMessages.at(-1)!;
    const duplicateResultPart = secondRoundResults.content[0] as { type: 'tool_result'; content: string; isError?: boolean };
    expect(duplicateResultPart.isError).toBe(false);
    expect(duplicateResultPart.content).toContain('نفس المدخلات');
    // Gap 3B fix: the guard must hand back the actual cached payload (not just
    // the instruction sentence) so the model has real data to answer with.
    expect(duplicateResultPart.content).toContain(VALID_ID);
  });

  it('Test 2 — still executes twice for the same tool with different arguments', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: null, toolCalls: [{ id: 'call2', name: 'fake_read', input: { id: VALID_ID_2 } }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    expect(readExecute).toHaveBeenCalledTimes(2);
    expect(readExecute).toHaveBeenNthCalledWith(1, { id: VALID_ID }, expect.anything());
    expect(readExecute).toHaveBeenNthCalledWith(2, { id: VALID_ID_2 }, expect.anything());
  });

  it('Test 3 — still executes both calls when they are two different tools', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: null, toolCalls: [{ id: 'call2', name: 'fake_super_admin', input: {} }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'], roleNames: ['SUPER_ADMIN'] }), turns('سؤال'));

    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(superAdminExecute).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('خلصت');
  });

  it('Test 4 — state does not leak between two separate requests (each executes the call fresh)', async () => {
    __setProviderForTests(
      queueProvider([
        { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
        { text: 'أول محادثة', toolCalls: [], stopReason: 'end_turn' },
      ]),
    );
    await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال أول'));

    __setProviderForTests(
      queueProvider([
        { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
        { text: 'محادثة تانية', toolCalls: [], stopReason: 'end_turn' },
      ]),
    );
    const second = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال تاني'));

    // Same tool + same arguments, but in two unrelated requests — both must execute for real.
    expect(readExecute).toHaveBeenCalledTimes(2);
    expect(second.reply).toBe('محادثة تانية');
  });

  it('Test 5 — a legitimate two-tool chain still completes normally end-to-end', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: null, toolCalls: [{ id: 'call2', name: 'fake_super_admin', input: {} }], stopReason: 'tool_use' },
      { text: 'دي تفاصيل الطلب الكاملة', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'], roleNames: ['SUPER_ADMIN'] }), turns('سؤال مركّب'));

    expect(result.reply).toBe('دي تفاصيل الطلب الكاملة');
    expect(result.toolsUsed).toEqual(['fake_read', 'fake_super_admin']);
  });
});

describe('runAiChat — Task 8: structured conversation context (2026-09-12)', () => {
  it('Test 1 — no incoming context and no eligible tool leaves result.context undefined', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    expect(result.context).toBeUndefined();
  });

  it('Test 2 — an eligible tool call sets result.context to the extracted breadcrumb', async () => {
    const expectedContext = { entityType: 'WORK_ORDER', entityId: VALID_ID, label: 'WO-2026-000123' };
    mockExtractConversationContext.mockReturnValue(expectedContext);
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    expect(result.context).toEqual(expectedContext);
  });

  it('Test 3 — an incoming context is injected as text into the prompt sent to the model', async () => {
    const incomingContext = { entityType: 'CUSTOMER' as const, entityId: VALID_ID, label: 'شركة كاليكس للتجارة' };
    const provider = queueProvider([{ text: 'تمام', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    await runAiChat(auth(), turns('طيب وريني تفاصيله'), incomingContext);

    const lastMessage = provider.calls[0]!.messages.at(-1)!;
    const textPart = lastMessage.content[0] as { type: 'text'; text: string };
    expect(textPart.text).toContain('سياق المحادثة');
  });

  it('Test 4 — the injected context text names the exact entityId and label', async () => {
    const incomingContext = { entityType: 'WORK_ORDER' as const, entityId: VALID_ID, label: 'WO-2026-000123' };
    const provider = queueProvider([{ text: 'تمام', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    await runAiChat(auth(), turns('طيب وريني تفاصيله'), incomingContext);

    const textPart = provider.calls[0]!.messages.at(-1)!.content[0] as { type: 'text'; text: string };
    expect(textPart.text).toContain(VALID_ID);
    expect(textPart.text).toContain('WO-2026-000123');
  });

  it('Test 5 — a malformed context fails aiConversationContextSchema validation clearly (not silently dropped)', async () => {
    const { aiConversationContextSchema } = await import('@cleopatra/shared');

    expect(aiConversationContextSchema.safeParse({ entityType: 'WORK_ORDER', entityId: 'not-a-uuid', label: 'x' }).success).toBe(
      false,
    );
    expect(aiConversationContextSchema.safeParse({ entityType: 'MACHINE', entityId: VALID_ID, label: 'x' }).success).toBe(false);
    expect(aiConversationContextSchema.safeParse({ entityType: 'WORK_ORDER', entityId: VALID_ID, label: '' }).success).toBe(false);
    expect(
      aiConversationContextSchema.safeParse({ entityType: 'WORK_ORDER', entityId: VALID_ID, label: 'x'.repeat(151) }).success,
    ).toBe(false);
    expect(aiConversationContextSchema.safeParse({ entityType: 'WORK_ORDER', entityId: VALID_ID, label: 'WO-1' }).success).toBe(
      true,
    );
  });

  it("Test 6 — an incoming context naming an entity never bypasses dispatchTool's own permission check", async () => {
    const incomingContext = { entityType: 'CUSTOMER' as const, entityId: VALID_ID, label: 'عميل مفترض في السياق' };
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'معنديش صلاحية أعرض ده', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    // Caller has NO permissions at all — same gate as the existing
    // "missing permission" test above, now with an incoming context
    // present, to prove the context text can't shortcut it.
    await runAiChat(auth({ permissions: [] }), turns('ده'), incomingContext);

    expect(readExecute).not.toHaveBeenCalled();
  });

  it('Test 7 — multiple eligible tool calls in the same turn: the LAST one by call order wins', async () => {
    const fakeReadContext = { entityType: 'CUSTOMER', entityId: VALID_ID, label: 'كيان من fake_read' };
    const fakeSuperAdminContext = { entityType: 'SUPPLIER', entityId: VALID_ID_2, label: 'كيان من fake_super_admin' };
    // Keyed by tool name (not call order) so the assertion below is robust
    // regardless of which concurrent dispatch actually settles first —
    // `runAiChat`'s own "last wins" loop iterates `Promise.all`'s
    // input-order-preserving output array, not real completion order.
    mockExtractConversationContext.mockImplementation((toolName: string) =>
      toolName === 'fake_read' ? fakeReadContext : toolName === 'fake_super_admin' ? fakeSuperAdminContext : null,
    );

    const provider = queueProvider([
      {
        text: null,
        toolCalls: [
          { id: 'call1', name: 'fake_read', input: { id: VALID_ID } },
          { id: 'call2', name: 'fake_super_admin', input: {} },
        ],
        stopReason: 'tool_use',
      },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'], roleNames: ['SUPER_ADMIN'] }), turns('سؤال'));

    // fake_super_admin is listed SECOND in toolCalls → it must win.
    expect(result.context).toEqual(fakeSuperAdminContext);
  });

  it('Test 7b — swapping the call order swaps the winner too (proves genuine order-dependence)', async () => {
    const fakeReadContext = { entityType: 'CUSTOMER', entityId: VALID_ID, label: 'كيان من fake_read' };
    const fakeSuperAdminContext = { entityType: 'SUPPLIER', entityId: VALID_ID_2, label: 'كيان من fake_super_admin' };
    mockExtractConversationContext.mockImplementation((toolName: string) =>
      toolName === 'fake_read' ? fakeReadContext : toolName === 'fake_super_admin' ? fakeSuperAdminContext : null,
    );

    const provider = queueProvider([
      {
        text: null,
        toolCalls: [
          { id: 'call1', name: 'fake_super_admin', input: {} },
          { id: 'call2', name: 'fake_read', input: { id: VALID_ID } },
        ],
        stopReason: 'tool_use',
      },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'], roleNames: ['SUPER_ADMIN'] }), turns('سؤال'));

    // fake_read is listed SECOND this time → it must win instead.
    expect(result.context).toEqual(fakeReadContext);
  });

  // Test 8 — the existing duplicate-guard describe block above ("runAiChat
  // — duplicate read-tool call guard") is left completely unmodified (bar
  // the one Task-7 content assertion added previously) and re-run as part
  // of this same file/suite — see the final test-run report for the actual
  // pass count, not a re-declaration of those assertions here.
});

/**
 * Task 10 — prompt-hardening regression lock. Live Ollama testing (Task 9)
 * found the model reusing a stale context entityId after an explicit user
 * correction, and calling a get_* tool with a human-readable name/number
 * instead of searching first. Both fixes are prompt-only (`systemKnowledge.ts`);
 * this test only pins that the strengthened wording actually reaches the
 * provider via `runAiChat`'s unchanged `system: CLEOPATRA_AI_SYSTEM_PROMPT`
 * wiring — it cannot itself verify real model behavior, which is why Task 10
 * also required a separate live-Ollama regression check.
 */
describe('runAiChat — Task 10 system prompt hardening wiring', () => {
  it('sends the explicit-correction-overrides-context rule to the provider', async () => {
    const provider = queueProvider([{ text: 'ok', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('لا، قصدي كمال سعد'));

    expect(provider.calls[0].system).toContain('لا، قصدي كمال سعد');
    expect(provider.calls[0].system).toContain('يُلغي الـID الموجود في السياق');
  });

  it('sends the search-before-get-for-human-readable-references rule to the provider', async () => {
    const provider = queueProvider([{ text: 'ok', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال تجريبي'));

    expect(provider.calls[0].system).toContain('NEVER call a get_*/detail tool passing a human name');
    expect(provider.calls[0].system).toContain('A UUID the user gives you directly may still be used with get_* right away');
  });
});

/**
 * Task 12 — centralized read-only tool guard. Task 10 proved prompt-only
 * hardening does not change qwen3's behavior for these two failure modes;
 * these tests lock in the deterministic, programmatic guards added to
 * `runAiChat`'s tool-call loop instead. `fakeGetCustomerTool`/
 * `fakeSearchCustomersTool`/`fakeGetQuotationTool`/`fakeSearchQuotationsTool`
 * are named exactly like the real tools on purpose — see their own
 * definitions above — so `READ_GUARD_ENTITY_TOOLS` (not mocked) recognizes
 * them without this file needing to duplicate or mock that metadata.
 */
describe('runAiChat — Task 12 Guard A (invalid get_* reference → search substitution)', () => {
  it('1. a valid UUID passed to a registered get_* tool executes normally, no substitution', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'get_customer', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'دي بياناته', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['partners.view'] }), turns('هات تفاصيل العميل ده'));

    expect(getCustomerExecute).toHaveBeenCalledTimes(1);
    expect(getCustomerExecute).toHaveBeenCalledWith({ id: VALID_ID }, expect.anything());
    expect(searchCustomersExecute).not.toHaveBeenCalled();
    expect(result.reply).toBe('دي بياناته');
  });

  it('2. a human customer name passed as get_customer id is intercepted — search_customers runs instead, get_customer.execute is never called', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'get_customer', input: { id: 'مايكل مخلص' } }], stopReason: 'tool_use' },
      { text: 'لقيت نتايج البحث', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['partners.view'] }), turns('عايز رصيد العميل مايكل مخلص'));

    expect(getCustomerExecute).not.toHaveBeenCalled();
    expect(searchCustomersExecute).toHaveBeenCalledTimes(1);
    expect(searchCustomersExecute).toHaveBeenCalledWith({ query: 'مايكل مخلص' }, expect.anything());
    expect(result.toolsUsed).toEqual(expect.arrayContaining(['get_customer', 'search_customers']));
    // The tool_result fed back to the model must explain what happened.
    const toolResultMessage = provider.calls[1].messages.at(-1);
    const resultText = toolResultMessage?.content.find((p) => p.type === 'tool_result')?.content ?? '';
    expect(resultText).toContain('مش UUID صالح');
    expect(resultText).toContain('تم البحث تلقائيًا بأداة search_customers');
  });

  it('3. a quotation number passed as get_quotation id is intercepted — search_quotations runs instead', async () => {
    const provider = queueProvider([
      {
        text: null,
        toolCalls: [{ id: 'call1', name: 'get_quotation', input: { id: 'CLP-QUO-2026-000019' } }],
        stopReason: 'tool_use',
      },
      { text: 'لقيت العرض', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['quotations.view'] }), turns('هات تفاصيل عرض السعر CLP-QUO-2026-000019'));

    expect(getQuotationExecute).not.toHaveBeenCalled();
    expect(searchQuotationsExecute).toHaveBeenCalledTimes(1);
    expect(searchQuotationsExecute).toHaveBeenCalledWith({ query: 'CLP-QUO-2026-000019' }, expect.anything());
  });

  it('4. invalid get_* input on a tool with NO paired-search metadata keeps today\'s plain rejection — no substitution attempted', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: 'not-a-uuid' } }], stopReason: 'tool_use' },
      { text: 'معلش', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['test.read'] }), turns('سؤال'));

    expect(readExecute).not.toHaveBeenCalled();
    expect(searchCustomersExecute).not.toHaveBeenCalled();
    expect(searchQuotationsExecute).not.toHaveBeenCalled();
    expect(result.toolsUsed).toEqual(['fake_read']);
  });

  it('9. search substitution still enforces RBAC — a caller without the search permission gets a permission-denied result, not data', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'get_customer', input: { id: 'مايكل مخلص' } }], stopReason: 'tool_use' },
      { text: 'معلش', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: [] }), turns('عايز رصيد العميل مايكل مخلص'));

    expect(searchCustomersExecute).not.toHaveBeenCalled();
    const toolResultMessage = provider.calls[1].messages.at(-1);
    const resultText = toolResultMessage?.content.find((p) => p.type === 'tool_result')?.content ?? '';
    expect(resultText).toContain('محتاج صلاحية "partners.view"');
  });

  it('10. a tool with no registered guard metadata (simulating an unmarked/future tool) is never auto-substituted', async () => {
    // `fake_super_admin` takes no id at all and isn't in READ_GUARD_ENTITY_TOOLS —
    // stands in for "a future tool nobody explicitly opted in", including a
    // hypothetical write tool: the guard must do nothing for it either way.
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_super_admin', input: {} }], stopReason: 'tool_use' },
      { text: 'تم', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ roleNames: ['SUPER_ADMIN'] }), turns('سؤال'));

    expect(superAdminExecute).toHaveBeenCalledTimes(1);
    expect(searchCustomersExecute).not.toHaveBeenCalled();
    expect(searchQuotationsExecute).not.toHaveBeenCalled();
  });

  // 11. "the guard never directly invokes tool.execute()" is verified by
  // tests 2 and 3 above: get_customer.execute/get_quotation.execute are
  // asserted NEVER called while the substituted search's execute IS called
  // — the only way that split happens is if the guard routes exclusively
  // through dispatchTool(searchTool, ...) and never calls the original
  // tool's execute directly.
});

describe('runAiChat — Task 12 Guard B (stale context after explicit correction)', () => {
  it('5. an explicit correction + a get_* call reusing the OLD context entityId is rejected before execute()', async () => {
    const incomingContext = { entityType: 'SUPPLIER' as const, entityId: VALID_ID, label: 'الجعراني' };
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'تمام هبحث', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('لا، قصدي كمال سعد.'), incomingContext);

    expect(readExecute).not.toHaveBeenCalled();
    const toolResultMessage = provider.calls[1].messages.at(-1);
    const resultText = toolResultMessage?.content.find((p) => p.type === 'tool_result')?.content ?? '';
    expect(resultText).toContain('صحّح اسم الكيان صراحةً');
    expect(resultText).toContain(VALID_ID);
  });

  it('6. an explicit correction does not block an unrelated call in the same turn (same tool, a DIFFERENT id)', async () => {
    const incomingContext = { entityType: 'SUPPLIER' as const, entityId: VALID_ID, label: 'الجعراني' };
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID_2 } }], stopReason: 'tool_use' },
      { text: 'خلصت', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('لا، قصدي كمال سعد.'), incomingContext);

    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(readExecute).toHaveBeenCalledWith({ id: VALID_ID_2 }, expect.anything());
  });

  it('7. a normal follow-up ("طب تفاصيله؟") with no correction marker keeps reusing the context id exactly as before', async () => {
    const incomingContext = { entityType: 'CUSTOMER' as const, entityId: VALID_ID, label: 'عميل ما' };
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'اهو تفاصيله', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['test.read'] }), turns('طب تفاصيله؟'), incomingContext);

    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(readExecute).toHaveBeenCalledWith({ id: VALID_ID }, expect.anything());
  });

  it('8. a normal topic switch with no explicit correction marker never triggers the guard, even if the id happens to match', async () => {
    const incomingContext = { entityType: 'CUSTOMER' as const, entityId: VALID_ID, label: 'عميل قديم' };
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'fake_read', input: { id: VALID_ID } }], stopReason: 'tool_use' },
      { text: 'اهو', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    // No correction marker ("لا، قصدي" / "مش ... قصدي") anywhere in this message.
    await runAiChat(auth({ permissions: ['test.read'] }), turns('هاتلي المورد كمال'), incomingContext);

    expect(readExecute).toHaveBeenCalledTimes(1);
    expect(readExecute).toHaveBeenCalledWith({ id: VALID_ID }, expect.anything());
  });

  // 12. Existing duplicate-call protection is unmodified and unaffected by
  // either guard — see the "runAiChat — duplicate read-tool call guard"
  // describe block earlier in this same file, re-run as part of this same
  // suite (final pass count in the task report, not re-declared here).
});

/**
 * Task 15.7 — deterministic HELP fallback. Tasks 15.5/15.6 proved qwen3
 * sometimes emits zero tool calls even when routing has already narrowed
 * the offered tools to exactly `search_help_topics`, and that Ollama has
 * no `tool_choice` mechanism to force this. These tests lock the
 * application-level fallback that replaces the model's decision with a
 * deterministic dispatch in that one narrow, unambiguous case only.
 *
 * "إزاي أستخدم النظام؟" is used as the canonical HELP-triggering message
 * throughout (already proven to match `HELP_INTENT_PATTERNS` in Task
 * 14.2's own tests) — none of these tests mock `toolRouting.ts`, so
 * routing runs for real against `fakeSearchHelpTopicsTool` above.
 */
describe('runAiChat — Task 15.7 deterministic HELP fallback', () => {
  it('A. HELP-exclusive request where the model calls search_help_topics normally — unchanged, fallback never fires', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [{ id: 'call1', name: 'search_help_topics', input: { query: 'إزاي أستخدم النظام؟' } }], stopReason: 'tool_use' },
      { text: 'دي الإجابة', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth(), turns('إزاي أستخدم النظام؟'));

    expect(helpTopicsExecute).toHaveBeenCalledTimes(1);
    expect(helpTopicsExecute).toHaveBeenCalledWith({ query: 'إزاي أستخدم النظام؟' }, expect.anything());
    expect(result.reply).toBe('دي الإجابة');
    expect(result.toolsUsed).toEqual(['search_help_topics']);
  });

  it('B. HELP-exclusive request where the model emits zero tool calls — fallback dispatches search_help_topics with the latest user message as query', async () => {
    const provider = queueProvider([
      { text: 'مش عارف أساعدك في الحاجة دي', toolCalls: [], stopReason: 'end_turn' },
      { text: 'الإجابة الصح المبنية على المعلومة', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth(), turns('إزاي أستخدم النظام؟'));

    expect(helpTopicsExecute).toHaveBeenCalledTimes(1);
    expect(helpTopicsExecute).toHaveBeenCalledWith({ query: 'إزاي أستخدم النظام؟' }, expect.anything());
    expect(result.toolsUsed).toEqual(['search_help_topics']);
    expect(result.reply).toBe('الإجابة الصح المبنية على المعلومة');

    // The second provider call must genuinely have received the grounded
    // tool result in its message history — proves the model got a real
    // chance to use it, not that the final text was fabricated.
    const secondCallMessages = provider.calls[1]!.messages;
    const toolResultMsg = secondCallMessages.at(-1);
    const toolResultPart = toolResultMsg?.content.find((p) => p.type === 'tool_result');
    expect(toolResultPart?.content).toContain('topic answer for: إزاي أستخدم النظام؟');
    expect(toolResultPart?.isError).toBe(false);
  });

  it('C. the fallback fires at most once — a second empty-tool-calls turn returns normally, no repeated dispatch', async () => {
    const provider = queueProvider([
      { text: null, toolCalls: [], stopReason: 'end_turn' },
      { text: 'لسه معنديش إجابة واضحة', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth(), turns('إزاي أستخدم النظام؟'));

    expect(helpTopicsExecute).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('لسه معنديش إجابة واضحة');
  });

  it('D. a business-data query ("رصيد الخزينة كام؟") never triggers the HELP fallback', async () => {
    const provider = queueProvider([{ text: 'مش لاقي أداة مناسبة', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth({ permissions: ['*'] }), turns('رصيد الخزينة كام؟'));

    expect(helpTopicsExecute).not.toHaveBeenCalled();
    expect(result.reply).toBe('مش لاقي أداة مناسبة');
  });

  it('E. a production/machines-shaped query ("إيه حالة الماكينات؟") never triggers the HELP fallback', async () => {
    const provider = queueProvider([{ text: 'مفيش بيانات', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    await runAiChat(auth({ permissions: ['*'] }), turns('إيه حالة الماكينات؟'));

    expect(helpTopicsExecute).not.toHaveBeenCalled();
  });

  it('F. when routing falls back to multiple tools (search_help_topics among them), the fallback does not activate', async () => {
    const provider = queueProvider([{ text: 'ازاي أقدر أساعدك؟', toolCalls: [], stopReason: 'end_turn' }]);
    __setProviderForTests(provider);

    // "ساعدني" matches no HELP_INTENT_PATTERN and no domain keyword, so
    // selectToolsForRequest() falls back to the FULL allowedTools set
    // (every fake here, including fakeSearchHelpTopicsTool, since it has
    // no requiredPermission) — length > 1, so isHelpExclusiveRequest must
    // be false even though the help tool is technically among those offered.
    const result = await runAiChat(auth({ roleNames: ['SUPER_ADMIN'], permissions: ['*'] }), turns('ساعدني'));

    expect(helpTopicsExecute).not.toHaveBeenCalled();
    expect(result.reply).toBe('ازاي أقدر أساعدك؟');
  });

  it('G. if the fallback dispatch itself fails, the existing tool-error convention applies — no exception, no fabricated answer', async () => {
    helpTopicsExecute.mockRejectedValueOnce(new Error('boom'));
    const provider = queueProvider([
      { text: null, toolCalls: [], stopReason: 'end_turn' },
      { text: 'تعذر الوصول للبيانات دلوقتي، جرّب تاني بعد لحظة.', toolCalls: [], stopReason: 'end_turn' },
    ]);
    __setProviderForTests(provider);

    const result = await runAiChat(auth(), turns('إزاي أستخدم النظام؟'));

    expect(helpTopicsExecute).toHaveBeenCalledTimes(1);
    expect(result.reply).toBe('تعذر الوصول للبيانات دلوقتي، جرّب تاني بعد لحظة.');
    expect(result.toolsUsed).toEqual(['search_help_topics']);
  });
});

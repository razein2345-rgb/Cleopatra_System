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

vi.mock('./ai/tools/index.js', () => ({
  AI_TOOLS: [fakeReadTool, fakeSuperAdminTool],
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

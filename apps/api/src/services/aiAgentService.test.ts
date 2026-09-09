import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { AiChatTurn } from '@cleopatra/shared';
import type { AnyAiToolDefinition } from './ai/toolTypes.js';
import type { LlmConverseInput, LlmConverseResult, LlmProvider } from './ai/llmProvider.js';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

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

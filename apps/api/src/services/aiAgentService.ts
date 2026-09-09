import { hasPermission } from '@cleopatra/shared';
import type { AiChatTurn } from '@cleopatra/shared';
import type { AuthenticatedUser } from './authContext.js';
import type { LlmMessage, LlmProvider, LlmToolDefinition } from './ai/llmProvider.js';
import { AnthropicProvider, toAssistantMessage } from './ai/providers/anthropicProvider.js';
import { CLEOPATRA_AI_SYSTEM_PROMPT } from './ai/systemKnowledge.js';
import { AI_TOOLS } from './ai/tools/index.js';
import type { AnyAiToolDefinition } from './ai/toolTypes.js';

/**
 * Cleopatra AI — orchestrator (CLEOPATRA_AI_IMPLEMENTATION_PLAN.md Phase 1).
 *
 * Zero conversation persistence: the caller resends recent turns every
 * request (CLEOPATRA_AI_ARCHITECTURE.md §4's "no new DB table" decision).
 * Zero write tools — every entry in `AI_TOOLS` is READ-only by
 * construction (Phase 1 scope). The permission check
 * (`hasPermission`/`requiresSuperAdmin`) always runs before a tool's
 * `execute()` is ever called — structurally identical to how
 * `requirePermission()` middleware gates every existing controller
 * (CLEOPATRA_AI_SECURITY.md §2) — never inside the tool's own body, so a
 * bug in a tool can never accidentally skip it.
 */

const MAX_TOOL_ITERATIONS = 6;

let cachedProvider: LlmProvider | null = null;

export class AiProviderNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not configured');
    this.name = 'AiProviderNotConfiguredError';
  }
}

function getProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiProviderNotConfiguredError();
  const model = process.env.ANTHROPIC_MODEL || undefined;
  cachedProvider = new AnthropicProvider(apiKey, model);
  return cachedProvider;
}

/** Test-only seam — lets tests substitute a fake provider without touching env vars or the real Anthropic SDK. */
export function __setProviderForTests(provider: LlmProvider | null): void {
  cachedProvider = provider;
}

function toLlmToolDefinitions(tools: AnyAiToolDefinition[]): LlmToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputJsonSchema,
  }));
}

function turnsToMessages(turns: AiChatTurn[]): LlmMessage[] {
  return turns.map((turn) => ({ role: turn.role, content: [{ type: 'text', text: turn.text }] }));
}

/**
 * The single permission-enforcement point for every tool call
 * (CLEOPATRA_AI_SECURITY.md §2) — runs before `execute()`, always. Never
 * trusts the model's own claims about what it's allowed to do.
 */
async function dispatchTool(
  tool: AnyAiToolDefinition,
  rawInput: unknown,
  auth: AuthenticatedUser,
): Promise<{ content: string; isError: boolean }> {
  if (tool.requiresSuperAdmin && !auth.roleNames.includes('SUPER_ADMIN')) {
    return { isError: true, content: 'محتاج صلاحية المسؤول العام (Super Admin) عشان أقدر أعرض بيانات المرتبات دي.' };
  }
  if (tool.requiredPermission && !hasPermission(auth.permissions, tool.requiredPermission)) {
    return { isError: true, content: `محتاج صلاحية "${tool.requiredPermission}" عشان أقدر أجاوبك على ده.` };
  }

  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('، ');
    return { isError: true, content: `مدخلات غير صحيحة لأداة ${tool.name}: ${message}` };
  }

  try {
    const result = await tool.execute(parsed.data, { auth });
    return { isError: false, content: JSON.stringify(result) };
  } catch {
    // Never surface a raw error/stack trace to the model or the end user
    // (CLEOPATRA_AI_SECURITY.md §6, "Tool failure" / "Database/network failure").
    return { isError: true, content: 'تعذر الوصول للبيانات دلوقتي، جرّب تاني بعد لحظة.' };
  }
}

export interface RunAiChatResult {
  reply: string;
  toolsUsed: string[];
}

export async function runAiChat(auth: AuthenticatedUser, turns: AiChatTurn[]): Promise<RunAiChatResult> {
  const provider = getProvider();
  const tools = toLlmToolDefinitions(AI_TOOLS);
  const toolsByName = new Map(AI_TOOLS.map((t) => [t.name, t]));
  const toolsUsed = new Set<string>();

  const messages: LlmMessage[] = turnsToMessages(turns);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.converse({ system: CLEOPATRA_AI_SYSTEM_PROMPT, messages, tools });

    if (result.toolCalls.length === 0) {
      return { reply: result.text ?? 'معنديش رد على السؤال ده دلوقتي.', toolsUsed: [...toolsUsed] };
    }

    messages.push(toAssistantMessage(result));

    const toolResultParts = await Promise.all(
      result.toolCalls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        if (!tool) {
          return { type: 'tool_result' as const, toolCallId: call.id, content: `أداة غير معروفة: ${call.name}`, isError: true };
        }
        toolsUsed.add(tool.name);
        const { content, isError } = await dispatchTool(tool, call.input, auth);
        return { type: 'tool_result' as const, toolCallId: call.id, content, isError };
      }),
    );

    messages.push({ role: 'user', content: toolResultParts });
  }

  return {
    reply: 'السؤال ده محتاج خطوات كتير — ممكن تبسطه أو تسأل جزء منه لوحده؟',
    toolsUsed: [...toolsUsed],
  };
}

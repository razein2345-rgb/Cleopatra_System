import { z } from 'zod';
import { hasPermission } from '@cleopatra/shared';
import type { AiChatTurn, AiConversationContext, AiEntityType } from '@cleopatra/shared';
import type { AuthenticatedUser } from './authContext.js';
import type { LlmMessage, LlmProvider, LlmTextPart, LlmToolDefinition } from './ai/llmProvider.js';
import { OllamaProvider, toAssistantMessage } from './ai/providers/ollamaProvider.js';
import { CLEOPATRA_AI_SYSTEM_PROMPT } from './ai/systemKnowledge.js';
import { AI_TOOLS } from './ai/tools/index.js';
import type { AnyAiToolDefinition } from './ai/toolTypes.js';
import { extractConversationContext } from './ai/conversationContext.js';
import { selectToolsForRequest } from './ai/toolRouting.js';
import { isExplicitCorrection } from './ai/correctionDetection.js';
import { READ_GUARD_ENTITY_TOOLS } from './ai/readGuardMetadata.js';

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

/**
 * Owner's correction (2026-09-09): Phase 1 validation runs against a
 * locally-installed Ollama instance — no hosted API key of any kind is
 * required. Both settings are plain, optional env vars with sensible
 * local defaults (never hard-coded into business logic, per the owner's
 * instruction) — `OllamaProvider` itself owns the actual defaults.
 */
function getProvider(): LlmProvider {
  if (cachedProvider) return cachedProvider;
  const baseUrl = process.env.OLLAMA_BASE_URL || undefined;
  const model = process.env.OLLAMA_MODEL || undefined;
  cachedProvider = new OllamaProvider(baseUrl, model);
  return cachedProvider;
}

/** Test-only seam — lets tests substitute a fake provider without touching env vars or a real Ollama instance. */
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

const ENTITY_TYPE_LABELS_AR: Record<AiEntityType, string> = {
  CUSTOMER: 'عميل',
  SUPPLIER: 'مورد',
  WORK_ORDER: 'أمر شغل',
  QUOTATION: 'عرض سعر',
};

/**
 * Task 8 — Structured Conversation Context V1. Renders the incoming
 * breadcrumb as a short plain-text note appended to the latest user
 * message (never a new message, never a tool_result — `LlmMessage`'s
 * shape and Ollama's own message mapping are untouched by this). The
 * model reads this as ordinary text; `systemKnowledge.ts`'s own new
 * "## Conversation context" section teaches it what to do with it.
 */
function buildContextNote(context: AiConversationContext): string {
  return `سياق المحادثة الحالي:\nالكيان: ${ENTITY_TYPE_LABELS_AR[context.entityType]}\nالمعرف: ${context.entityId}\nالوصف: ${context.label}`;
}

/** Appends the context note to the last message's text content — that message is always the newest user turn (`aiChatRequestSchema` guarantees at least one turn, and the frontend always sends the latest user message last). */
function injectContextNote(messages: LlmMessage[], context: AiConversationContext): void {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return;
  const note = buildContextNote(context);
  const textPart = lastMessage.content.find((p): p is LlmTextPart => p.type === 'text');
  if (textPart) {
    textPart.text = `${textPart.text}\n\n${note}`;
  } else {
    lastMessage.content.push({ type: 'text', text: note });
  }
}

/**
 * Gap 3 diagnostic (2026-09-11, read-only investigation) — confirmed live
 * that the local 8B model can re-request a tool it already called with the
 * exact same arguments earlier in the same conversation, burning every
 * remaining iteration with no new information gained (7/9 live runs on the
 * production-detail scenario ended this way). Deterministic one-level key
 * normalization: these input schemas are all flat objects (no nested
 * tools' inputs observed across the registry), so sorting top-level keys
 * before stringifying is sufficient — not a generic deep-normalizer.
 *
 * SAFE ONLY because every entry in AI_TOOLS is read-only by construction
 * (this file's own top comment) — replaying a cached result instead of
 * re-querying has zero correctness risk precisely because none of them
 * have side effects. Before any WRITE/action tool (create_order,
 * add_payment, ...) is ever added to AI_TOOLS, this key MUST be revisited
 * (e.g. gated behind an explicit read-only flag on AiToolDefinition) —
 * silently skipping a repeated mutation call would be a correctness bug,
 * not a safe optimization.
 */
function toolCallKey(name: string, input: unknown): string {
  const normalized =
    input && typeof input === 'object' && !Array.isArray(input)
      ? Object.fromEntries(Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : input;
  return `${name}::${JSON.stringify(normalized)}`;
}

/**
 * Task 12 — Guard A/B shared helpers. Neither guard below ever calls a
 * tool's `execute()` directly — both only ever route through `dispatchTool`
 * itself, so permission/SUPER_ADMIN/schema checks stay exactly as
 * authoritative as they are for any other call (see `dispatchTool`'s own
 * doc comment). The guards only decide whether/how a call reaches that
 * function, never whether it is authorized once it does.
 */
const UUID_SCHEMA = z.string().uuid();

/** Same check every get_* detail tool's own Zod schema already performs — reused here as a pre-check, not a replacement for it. */
function looksLikeUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_SCHEMA.safeParse(value).success;
}

/** Flat-object scan (this codebase's tool inputs are never nested — see `toolCallKey`'s own doc comment) for an exact match on one specific value, regardless of which field name holds it. */
function callInputContainsValue(input: unknown, value: string): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  return Object.values(input as Record<string, unknown>).some((v) => v === value);
}

function buildStaleContextRejection(staleEntityId: string): string {
  return `الـ ID اللي في سياق المحادثة السابق (${staleEntityId}) بقى غير صالح للاستخدام دلوقتي — المستخدم صحّح اسم الكيان صراحةً في آخر رسالة. متستخدمش هذا الـID تاني في أي استدعاء. ابحث عن الكيان الجديد اللي ذكره المستخدم بأداة search_* المناسبة أولًا، واستخرج الـUUID الصحيح من نتيجتها قبل استخدام أي أداة تفاصيل.`;
}

function buildSearchSubstitutionNote(originalToolName: string, searchToolName: string): string {
  return `الـ ID اللي اتبعت لأداة ${originalToolName} مش UUID صالح (يبدو إنه اسم أو رقم مرجعي بشري، مش المعرف الداخلي الحقيقي) — تم رفض تنفيذها. بدل كده تم البحث تلقائيًا بأداة ${searchToolName} بنفس القيمة كنص بحث. نتيجة البحث:`;
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
  } catch (err) {
    // Task 13 audit finding: this catch was completely silent, so a real
    // tool-execution failure (e.g. a database call inside `execute()`) was
    // indistinguishable from any other cause once it reached the model —
    // unfixable from server logs alone. Same convention as the rest of the
    // codebase's server-side logging (e.g. `jobs/autoCloseDayJob.ts`'s own
    // `console.error('[tag] ...', err)`) — tool name only, never the raw
    // input (which may carry customer-identifying search text) or `auth`.
    // Never surface a raw error/stack trace to the model or the end user
    // (CLEOPATRA_AI_SECURITY.md §6, "Tool failure" / "Database/network failure").
    console.error(`[ai-tool-dispatch] ${tool.name} execute() threw:`, err);
    return { isError: true, content: 'تعذر الوصول للبيانات دلوقتي، جرّب تاني بعد لحظة.' };
  }
}

export interface RunAiChatResult {
  reply: string;
  toolsUsed: string[];
  context?: AiConversationContext;
}

export async function runAiChat(
  auth: AuthenticatedUser,
  turns: AiChatTurn[],
  incomingContext?: AiConversationContext,
): Promise<RunAiChatResult> {
  const provider = getProvider();
  // Task 8.6 — Dynamic Tool Selection V1. Narrows only what qwen3 is TOLD
  // about (`tools`, below) — never what it may actually do. `toolsByName`
  // deliberately stays on the FULL, unrouted `AI_TOOLS` registry (unchanged
  // from before this task): if the model ever emits a call to a tool that
  // routing left out, that call still reaches the exact same
  // `dispatchTool()` permission check as any other call, rather than being
  // silently absorbed by the "unknown tool" branch — routing narrows the
  // model's menu, `dispatchTool` alone still decides what is authorized.
  // `latestUserMessage` is read from `turns` (never mutated) — not from
  // `messages` below, whose last entry gets the context note appended a
  // few lines down; matching keywords against that note's own words (e.g.
  // "الكيان: عميل") would defeat the topic-change rule on every follow-up.
  const latestUserMessage = turns[turns.length - 1]?.text ?? '';
  // Task 12 — Guard B signal. Computed once per request (the correction, if
  // any, is in the current turn's own raw text, which doesn't change across
  // this request's tool-call iterations) — only meaningful when there is an
  // existing context to correct away from.
  const correctionDetectedThisTurn = Boolean(incomingContext) && isExplicitCorrection(latestUserMessage);
  const selectedTools = selectToolsForRequest(AI_TOOLS, auth, latestUserMessage, incomingContext);
  // Task 15.7 — deterministic HELP fallback trigger condition, computed
  // once (identical for every loop iteration below, since `selectedTools`
  // never changes within one request). Uses the actual selected tool
  // OBJECT's own `.name` — the exact same array `toLlmToolDefinitions()`
  // turns into what the model is offered — never a re-match against the
  // raw message, so this can never drift from what Ollama was actually
  // told exists. Task 15.4's own routing tests already prove no business-
  // data query ever produces this exact single-tool set.
  const isHelpExclusiveRequest = selectedTools.length === 1 && selectedTools[0]?.name === 'search_help_topics';
  const tools = toLlmToolDefinitions(selectedTools);
  const toolsByName = new Map(AI_TOOLS.map((t) => [t.name, t]));
  const toolsUsed = new Set<string>();
  // Fresh per call — never persisted or shared across separate `runAiChat`
  // invocations/HTTP requests (see `toolCallKey`'s doc comment).
  const seenToolCalls = new Map<string, { content: string; isError: boolean }>();
  // Task 8 — starts as a pass-through of whatever the caller sent; only
  // overwritten when a tool call in this request actually qualifies (see
  // `extractConversationContext`'s per-tool rules). Never cleared just
  // because a turn used an unrelated/non-qualifying tool — the previous
  // entity may still be exactly what the user is talking about.
  let candidateContext: AiConversationContext | undefined = incomingContext;
  // Task 15.7 — guards the fallback to at most once per request. Set the
  // moment the fallback fires (before the extra provider round-trip even
  // resolves), so nothing about the model's SECOND response — another
  // empty response, a real tool call, anything — can ever re-trigger it;
  // every later iteration of this loop behaves exactly as it did before
  // this task.
  let helpFallbackUsed = false;

  const messages: LlmMessage[] = turnsToMessages(turns);
  if (incomingContext) injectContextNote(messages, incomingContext);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const result = await provider.converse({ system: CLEOPATRA_AI_SYSTEM_PROMPT, messages, tools });

    if (result.toolCalls.length === 0) {
      // Task 15.7 — deterministic HELP fallback. Task 15.5/15.6 proved
      // qwen3 sometimes emits zero tool calls even when routing already
      // narrowed the offered tools to exactly `search_help_topics`, and
      // that Ollama 0.33.3 has no `tool_choice` mechanism to force this
      // (Task 15.6's own direct-API experiment: identical behavior with
      // or without it). This is the smallest safe alternative: when
      // routing has ALREADY made the "which tool" decision unambiguous —
      // exactly one tool offered, and it's the read-only help lookup —
      // the application supplies the call the model chose not to make,
      // through the exact same `dispatchTool()` path any model-generated
      // call uses, so permission/schema/audit behavior is identical to a
      // normal call. The model's own (discarded) text from this turn is
      // never returned to the user — it's what Task 15.5 proved is
      // ungrounded guessing; the synthetic assistant/tool_result pair
      // below gives the model one more turn to phrase a grounded answer
      // from the real topic content instead.
      // `toolsUsed.size === 0` is required alongside `!helpFallbackUsed`:
      // without it, a model that correctly calls `search_help_topics` on
      // iteration 0 and then returns plain text with zero tool calls on
      // iteration 1 (the normal, correct "final answer" turn) would hit
      // this same branch again and get a REDUNDANT second dispatch —
      // `toolsUsed` only grows on a real dispatch (model-initiated or this
      // fallback's own), so a non-empty set means the model already did
      // the right thing this request and the fallback must stay out of it.
      if (isHelpExclusiveRequest && !helpFallbackUsed && toolsUsed.size === 0) {
        helpFallbackUsed = true;
        const helpTool = selectedTools[0]!;
        const fallbackInput = { query: latestUserMessage };
        const dispatched = await dispatchTool(helpTool, fallbackInput, auth);
        // Registered in the same Task 7 duplicate-call cache as any normal
        // dispatch — if the model's next turn redundantly calls
        // `search_help_topics` with this exact same query itself, the
        // existing guard echoes this cached result instead of dispatching
        // again (harmless either way, since this tool is read-only and
        // deterministic, but keeps this path consistent with every other).
        seenToolCalls.set(toolCallKey(helpTool.name, fallbackInput), dispatched);
        toolsUsed.add(helpTool.name);
        const extractedContext = dispatched.isError ? null : extractConversationContext(helpTool.name, dispatched.content);
        if (extractedContext) candidateContext = extractedContext;

        const fallbackToolCallId = 'help-fallback-1';
        messages.push({
          role: 'assistant',
          content: [{ type: 'tool_call', id: fallbackToolCallId, name: helpTool.name, input: fallbackInput }],
        });
        messages.push({
          role: 'user',
          content: [{ type: 'tool_result', toolCallId: fallbackToolCallId, content: dispatched.content, isError: dispatched.isError }],
        });
        continue;
      }

      return { reply: result.text ?? 'معنديش رد على السؤال ده دلوقتي.', toolsUsed: [...toolsUsed], context: candidateContext };
    }

    messages.push(toAssistantMessage(result));

    const toolResultParts = await Promise.all(
      result.toolCalls.map(async (call) => {
        const tool = toolsByName.get(call.name);
        if (!tool) {
          return {
            type: 'tool_result' as const,
            toolCallId: call.id,
            content: `أداة غير معروفة: ${call.name}`,
            isError: true,
            extractedContext: null as AiConversationContext | null,
          };
        }

        // Task 12 — Guard B: stale context after explicit correction.
        // Checked before anything else for this call (before the duplicate-
        // call cache, before dispatchTool) — this specific call must never
        // reach execute() carrying the entity the user just disowned. Only
        // intercepts a call whose input actually carries the OLD entityId
        // value; any other tool call in the same turn (even to the same
        // tool, with a different id) is completely unaffected.
        if (correctionDetectedThisTurn && incomingContext && callInputContainsValue(call.input, incomingContext.entityId)) {
          return {
            type: 'tool_result' as const,
            toolCallId: call.id,
            content: buildStaleContextRejection(incomingContext.entityId),
            isError: true,
            extractedContext: null as AiConversationContext | null,
          };
        }

        toolsUsed.add(tool.name);

        const key = toolCallKey(call.name, call.input);
        const cached = seenToolCalls.get(key);
        if (cached) {
          // Gap 3B fix (2026-09-12): the guard used to return a content-less
          // instruction sentence here, so the model had no data to answer
          // with even though it had already fetched it once in this same
          // request (5-run diagnostic: 0/5 produced a real answer after the
          // guard fired). Echoing `cached.content` verbatim is safe only
          // because every AI_TOOLS entry is read-only (this file's top
          // comment) and `dispatchTool` already enforced permissions once
          // for this exact payload earlier in the same request.
          // Context was already extracted (if eligible) the first time this
          // exact call was dispatched in this request — re-extracting the
          // same cached content here would only ever reproduce the same
          // result, so it's skipped as pure redundancy, not a gap.
          return {
            type: 'tool_result' as const,
            toolCallId: call.id,
            content: `تم استدعاء هذه الأداة بنفس المدخلات بالضبط قبل ذلك في نفس المحادثة — دي نتيجتها المخزّنة، استخدمها من غير ما تعيد الاستدعاء:\n${cached.content}`,
            isError: cached.isError,
            extractedContext: null as AiConversationContext | null,
          };
        }

        // Task 12 — Guard A: invalid get_*/detail reference with an
        // explicitly registered paired search tool (`READ_GUARD_ENTITY_TOOLS`
        // — never inferred from the tool's name). A valid UUID always skips
        // this branch untouched; a tool with no entry here always skips
        // this branch untouched (today's exact existing behavior). Never
        // calls `execute()` directly — the substituted call goes through
        // the exact same `dispatchTool()` as any other call, so that
        // search tool's own SUPER_ADMIN/permission/schema checks remain
        // fully active.
        const guardEntry = READ_GUARD_ENTITY_TOOLS[tool.name];
        if (guardEntry) {
          const rawIdValue = (call.input as Record<string, unknown> | null | undefined)?.[guardEntry.idField];
          if (!looksLikeUuid(rawIdValue)) {
            const searchTool = toolsByName.get(guardEntry.pairedSearchTool);
            if (searchTool) {
              const searchInput = { query: typeof rawIdValue === 'string' ? rawIdValue : '' };
              const searchDispatched = await dispatchTool(searchTool, searchInput, auth);
              toolsUsed.add(searchTool.name);
              const extractedContext = searchDispatched.isError
                ? null
                : extractConversationContext(searchTool.name, searchDispatched.content);
              return {
                type: 'tool_result' as const,
                toolCallId: call.id,
                content: `${buildSearchSubstitutionNote(tool.name, searchTool.name)}\n${searchDispatched.content}`,
                isError: searchDispatched.isError,
                extractedContext,
              };
            }
          }
        }

        const dispatched = await dispatchTool(tool, call.input, auth);
        seenToolCalls.set(key, dispatched);
        const extractedContext = dispatched.isError ? null : extractConversationContext(tool.name, dispatched.content);
        return {
          type: 'tool_result' as const,
          toolCallId: call.id,
          content: dispatched.content,
          isError: dispatched.isError,
          extractedContext,
        };
      }),
    );

    // Task 8 — "last eligible result wins", in the model's own emitted call
    // order. `Promise.all` preserves input order in its resolved array
    // regardless of which concurrent dispatch actually finished first, so
    // iterating this array in order is deterministic even though the
    // dispatches above ran concurrently.
    for (const part of toolResultParts) {
      if (part.extractedContext) candidateContext = part.extractedContext;
    }

    messages.push({
      role: 'user',
      content: toolResultParts.map((part) => ({
        type: part.type,
        toolCallId: part.toolCallId,
        content: part.content,
        isError: part.isError,
      })),
    });
  }

  return {
    reply: 'السؤال ده محتاج خطوات كتير — ممكن تبسطه أو تسأل جزء منه لوحده؟',
    toolsUsed: [...toolsUsed],
    context: candidateContext,
  };
}

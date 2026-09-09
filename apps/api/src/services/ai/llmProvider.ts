/**
 * Cleopatra AI — provider abstraction (CLEOPATRA_AI_ARCHITECTURE.md §3).
 *
 * Owner's Phase 1 approval, verbatim: "Do NOT hard-code Anthropic-specific
 * assumptions throughout the AI architecture." Every shape below is
 * deliberately provider-agnostic — no `@anthropic-ai/sdk` type or
 * content-block convention leaks past `providers/anthropicProvider.ts`.
 * `aiAgentService.ts` (the orchestrator), every tool file, and the
 * confirmation/audit code a later phase adds only ever see this file's
 * types, so a future `OllamaProvider` (or any other) can be swapped in by
 * adding one new file here and changing one constructor call — zero
 * changes to tools, permission checks, or orchestration logic.
 */

export type LlmRole = 'user' | 'assistant';

export interface LlmTextPart {
  type: 'text';
  text: string;
}

/** A tool the model is invoking — `id` round-trips back on the matching `LlmToolResultPart`. */
export interface LlmToolCallPart {
  type: 'tool_call';
  id: string;
  name: string;
  input: unknown;
}

/** The dispatcher's answer to one `LlmToolCallPart`, fed back into the next turn. */
export interface LlmToolResultPart {
  type: 'tool_result';
  toolCallId: string;
  content: string;
  isError?: boolean;
}

export type LlmContentPart = LlmTextPart | LlmToolCallPart | LlmToolResultPart;

export interface LlmMessage {
  role: LlmRole;
  content: LlmContentPart[];
}

/** Plain JSON Schema — the one wire format every LLM tool-use API (Anthropic, and every plausible future provider) already speaks, so it needs no translation layer of its own. */
export interface LlmToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LlmConverseInput {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
}

export type LlmStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'error';

export interface LlmConverseResult {
  text: string | null;
  toolCalls: { id: string; name: string; input: unknown }[];
  stopReason: LlmStopReason;
}

export interface LlmProvider {
  converse(input: LlmConverseInput): Promise<LlmConverseResult>;
}

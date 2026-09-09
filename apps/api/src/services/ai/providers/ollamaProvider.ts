import type {
  LlmContentPart,
  LlmConverseInput,
  LlmConverseResult,
  LlmMessage,
  LlmProvider,
  LlmStopReason,
} from '../llmProvider.js';

/**
 * The ONLY file in Cleopatra AI allowed to know about Ollama's HTTP API
 * (CLEOPATRA_AI_ARCHITECTURE.md §3) — everything else (the orchestrator,
 * every tool, the dispatcher) only ever talks to `LlmProvider`'s
 * provider-agnostic shapes. This keeps a future provider swap (back to a
 * hosted API, or a different local runtime) a one-file change.
 *
 * Owner's correction (2026-09-09): Phase 1 validation runs entirely
 * against a locally-installed Ollama instance running a local model
 * (Qwen by default) — no request or business data leaves the machine to
 * any hosted LLM API. Confirmed against Ollama's own published `/api/chat`
 * contract (docs/ollama/api.md, fetched 2026-09-09) before writing this,
 * per the owner's explicit "do not invent an API format" instruction.
 *
 * Ollama's own `/api/chat` contract (unlike Anthropic's) has NO id on a
 * tool call and expects the result echoed back only by `tool_name`, not
 * by id — so this file synthesizes its own ids (`ollama-tool-<n>`) purely
 * to satisfy the generic `LlmToolCallPart.id`/`LlmToolResultPart.toolCallId`
 * contract our other code relies on; those ids never reach Ollama itself.
 */

const DEFAULT_BASE_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen3';

interface OllamaToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChatResponse {
  message?: { role: string; content: string; tool_calls?: OllamaToolCall[] };
  done_reason?: string;
  done?: boolean;
  error?: string;
}

export class OllamaProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OllamaProviderError';
  }
}

/**
 * Converts one generic `LlmMessage` into zero or more Ollama chat messages.
 * A single assistant turn with both text and tool calls becomes one
 * `assistant` message (content + tool_calls); a `user` turn carrying
 * tool_result parts becomes one `tool` message per result — matching
 * Ollama's own "append a role: 'tool' message per result" convention.
 */
function toOllamaMessages(messages: LlmMessage[]): OllamaChatMessage[] {
  const out: OllamaChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'assistant') {
      const textPart = message.content.find((p): p is Extract<LlmContentPart, { type: 'text' }> => p.type === 'text');
      const toolCallParts = message.content.filter(
        (p): p is Extract<LlmContentPart, { type: 'tool_call' }> => p.type === 'tool_call',
      );
      out.push({
        role: 'assistant',
        content: textPart?.text ?? '',
        ...(toolCallParts.length > 0
          ? { tool_calls: toolCallParts.map((p) => ({ function: { name: p.name, arguments: p.input as Record<string, unknown> } })) }
          : {}),
      });
      continue;
    }

    // user turn: plain text parts become one user message; tool_result
    // parts each become their own `role: 'tool'` message, per Ollama's
    // contract (correlated by name, since Ollama has no result-id concept).
    for (const part of message.content) {
      if (part.type === 'text') {
        out.push({ role: 'user', content: part.text });
      } else if (part.type === 'tool_result') {
        out.push({
          role: 'tool',
          content: part.isError ? `Error: ${part.content}` : part.content,
          tool_name: toolNameForResult(messages, part.toolCallId),
        });
      }
    }
  }
  return out;
}

/** Ollama's `tool` message wants the tool's *name*, not our internal synthetic id — looked up from the assistant turn that issued the matching `tool_call`. */
function toolNameForResult(messages: LlmMessage[], toolCallId: string): string {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.content) {
      if (part.type === 'tool_call' && part.id === toolCallId) return part.name;
    }
  }
  return 'unknown_tool';
}

let syntheticIdCounter = 0;
function nextSyntheticId(): string {
  syntheticIdCounter += 1;
  return `ollama-tool-${syntheticIdCounter}`;
}

export class OllamaProvider implements LlmProvider {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL, model: string = DEFAULT_MODEL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
  }

  async converse(input: LlmConverseInput): Promise<LlmConverseResult> {
    const body = {
      model: this.model,
      stream: false,
      // Owner (2026-09-10, live-latency test): Qwen3's default hybrid
      // "thinking" mode measured at 55-256s per turn on this hardware —
      // disabling it (Ollama's own documented top-level "think" param)
      // measured 10x faster (26-30s) with identical tool-selection
      // correctness in a direct before/after test.
      think: false,
      messages: [{ role: 'system', content: input.system }, ...toOllamaMessages(input.messages)],
      tools: input.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      })),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new OllamaProviderError(
        `Could not reach the local Ollama instance at ${this.baseUrl} — is it running? (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new OllamaProviderError(`Ollama returned ${response.status}: ${text || response.statusText}`);
    }

    let data: OllamaChatResponse;
    try {
      data = (await response.json()) as OllamaChatResponse;
    } catch {
      throw new OllamaProviderError('Ollama returned a response that was not valid JSON');
    }

    if (data.error) {
      throw new OllamaProviderError(`Ollama error: ${data.error}`);
    }
    if (!data.message) {
      throw new OllamaProviderError('Ollama response had no "message" field');
    }

    const toolCalls = (data.message.tool_calls ?? []).map((call) => ({
      id: nextSyntheticId(),
      name: call.function.name,
      input: call.function.arguments,
    }));

    const text = data.message.content && data.message.content.length > 0 ? data.message.content : null;

    return {
      text,
      toolCalls,
      stopReason: toStopReason(toolCalls.length > 0, data.done_reason),
    };
  }
}

function toStopReason(hasToolCalls: boolean, doneReason: string | undefined): LlmStopReason {
  if (hasToolCalls) return 'tool_use';
  if (doneReason === 'length') return 'max_tokens';
  return 'end_turn';
}

/** Reconstructs the assistant turn from a converse result, same role as `anthropicProvider.ts`'s equivalent had — kept here since only this file knows the synthetic ids it just minted. */
export function toAssistantMessage(result: LlmConverseResult): LlmMessage {
  const content: LlmContentPart[] = [];
  if (result.text) content.push({ type: 'text', text: result.text });
  for (const call of result.toolCalls) {
    content.push({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
  }
  return { role: 'assistant', content };
}

import Anthropic from '@anthropic-ai/sdk';
import type {
  LlmContentPart,
  LlmConverseInput,
  LlmConverseResult,
  LlmMessage,
  LlmProvider,
  LlmStopReason,
} from '../llmProvider.js';

/**
 * The ONLY file in Cleopatra AI allowed to import `@anthropic-ai/sdk`
 * directly (CLEOPATRA_AI_ARCHITECTURE.md §3) — everything else talks to
 * `LlmProvider`'s provider-agnostic shapes. Translation is purely
 * mechanical in both directions: no business logic lives here.
 */

const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 2048;

function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content: message.content.map((part): Anthropic.ContentBlockParam => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text };
      }
      if (part.type === 'tool_call') {
        return { type: 'tool_use', id: part.id, name: part.name, input: part.input as Record<string, unknown> };
      }
      return {
        type: 'tool_result',
        tool_use_id: part.toolCallId,
        content: part.content,
        is_error: part.isError,
      };
    }),
  }));
}

function fromAnthropicStopReason(reason: Anthropic.Message['stop_reason']): LlmStopReason {
  if (reason === 'tool_use') return 'tool_use';
  if (reason === 'max_tokens') return 'max_tokens';
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end_turn';
  return 'error';
}

export class AnthropicProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(apiKey: string, model: string = DEFAULT_MODEL, maxTokens: number = DEFAULT_MAX_TOKENS) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxTokens = maxTokens;
  }

  async converse(input: LlmConverseInput): Promise<LlmConverseResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: input.system,
      messages: toAnthropicMessages(input.messages),
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });

    const textParts: string[] = [];
    const toolCalls: LlmConverseResult['toolCalls'] = [];
    for (const block of response.content) {
      if (block.type === 'text') {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }

    return {
      text: textParts.length > 0 ? textParts.join('\n') : null,
      toolCalls,
      stopReason: fromAnthropicStopReason(response.stop_reason),
    };
  }
}

/** Reconstructs the assistant turn (as our generic `LlmMessage`) from a converse result, so the orchestrator can append it to history before sending tool results back — kept here since its shape must exactly mirror what `converse()` above just parsed out of the real response. */
export function toAssistantMessage(result: LlmConverseResult): LlmMessage {
  const content: LlmContentPart[] = [];
  if (result.text) content.push({ type: 'text', text: result.text });
  for (const call of result.toolCalls) {
    content.push({ type: 'tool_call', id: call.id, name: call.name, input: call.input });
  }
  return { role: 'assistant', content };
}

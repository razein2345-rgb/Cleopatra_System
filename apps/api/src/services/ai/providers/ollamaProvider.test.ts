import { describe, expect, it, vi, afterEach } from 'vitest';
import type { LlmConverseInput, LlmMessage } from '../llmProvider.js';
import { OllamaProvider, OllamaProviderError, toAssistantMessage } from './ollamaProvider.js';

/**
 * Owner's correction (2026-09-09): Phase 1 validation runs against a
 * locally-installed Ollama instance instead of a hosted API. These tests
 * mock Ollama's own `/api/chat` HTTP contract (verified against Ollama's
 * published docs before implementation, not invented) — no running Ollama
 * instance is required to run this suite.
 */

const baseInput: LlmConverseInput = {
  system: 'system prompt',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'مرحبا' }] }],
  tools: [{ name: 'search_customers', description: 'search customers', inputSchema: { type: 'object', properties: {} } }],
};

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function mockFetchOnce(response: { ok: boolean; status?: number; json?: () => unknown; text?: () => Promise<string> }): FetchMock {
  const fetchMock: FetchMock = vi.fn(async () =>
    ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      statusText: 'mock',
      json: async () => (response.json ? response.json() : {}),
      text: response.text ?? (async () => ''),
    }) as unknown as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OllamaProvider — request shape', () => {
  it('POSTs to <baseUrl>/api/chat with stream:false, the system prompt, and mapped tools', async () => {
    const fetchMock = mockFetchOnce({
      ok: true,
      json: () => ({ message: { role: 'assistant', content: 'أهلاً' } }),
    });
    const provider = new OllamaProvider('http://localhost:11434', 'qwen3');

    await provider.converse(baseInput);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('qwen3');
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(body.tools).toEqual([
      { type: 'function', function: { name: 'search_customers', description: 'search customers', parameters: { type: 'object', properties: {} } } },
    ]);
  });

  it('trims a trailing slash on a custom base URL', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: () => ({ message: { role: 'assistant', content: 'ok' } }) });
    const provider = new OllamaProvider('http://localhost:11434/', 'qwen3');
    await provider.converse(baseInput);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/chat');
  });

  it('uses the documented defaults when constructed with no arguments', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: () => ({ message: { role: 'assistant', content: 'ok' } }) });
    const provider = new OllamaProvider();
    await provider.converse(baseInput);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe('qwen3');
  });
});

describe('OllamaProvider — response parsing', () => {
  it('parses a plain text response with no tool calls', async () => {
    mockFetchOnce({ ok: true, json: () => ({ message: { role: 'assistant', content: 'الرصيد صفر' }, done_reason: 'stop' }) });
    const result = await new OllamaProvider().converse(baseInput);
    expect(result).toEqual({ text: 'الرصيد صفر', toolCalls: [], stopReason: 'end_turn' });
  });

  it('parses a single tool call, synthesizing an id (Ollama itself has none)', async () => {
    mockFetchOnce({
      ok: true,
      json: () => ({
        message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'search_customers', arguments: { query: 'أحمد' } } }] },
      }),
    });
    const result = await new OllamaProvider().converse(baseInput);
    expect(result.stopReason).toBe('tool_use');
    expect(result.text).toBeNull();
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe('search_customers');
    expect(result.toolCalls[0]!.input).toEqual({ query: 'أحمد' });
    expect(typeof result.toolCalls[0]!.id).toBe('string');
    expect(result.toolCalls[0]!.id.length).toBeGreaterThan(0);
  });

  it('parses multiple tool calls issued in a single turn', async () => {
    mockFetchOnce({
      ok: true,
      json: () => ({
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            { function: { name: 'search_customers', arguments: { query: 'أحمد' } } },
            { function: { name: 'get_treasury_summary', arguments: {} } },
          ],
        },
      }),
    });
    const result = await new OllamaProvider().converse(baseInput);
    expect(result.toolCalls.map((c) => c.name)).toEqual(['search_customers', 'get_treasury_summary']);
    // Synthesized ids must be distinct so the orchestrator can correlate results independently.
    expect(new Set(result.toolCalls.map((c) => c.id)).size).toBe(2);
  });

  it('maps done_reason "length" to the max_tokens stop reason', async () => {
    mockFetchOnce({ ok: true, json: () => ({ message: { role: 'assistant', content: 'نص طويل مقطوع' }, done_reason: 'length' }) });
    const result = await new OllamaProvider().converse(baseInput);
    expect(result.stopReason).toBe('max_tokens');
  });
});

describe('OllamaProvider — failure handling', () => {
  it('throws OllamaProviderError when the local instance is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    await expect(new OllamaProvider().converse(baseInput)).rejects.toThrow(OllamaProviderError);
  });

  it('throws OllamaProviderError on a non-OK HTTP status (e.g. model not pulled)', async () => {
    mockFetchOnce({ ok: false, status: 404, text: async () => 'model "qwen3" not found, try pulling it first' });
    await expect(new OllamaProvider().converse(baseInput)).rejects.toThrow(OllamaProviderError);
  });

  it('throws OllamaProviderError when the response body is not valid JSON', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'ok',
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
      text: async () => '',
    }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(new OllamaProvider().converse(baseInput)).rejects.toThrow(OllamaProviderError);
  });

  it('throws OllamaProviderError when the response carries an "error" field', async () => {
    mockFetchOnce({ ok: true, json: () => ({ error: 'model "qwen3" not found, try pulling it first' }) });
    await expect(new OllamaProvider().converse(baseInput)).rejects.toThrow(OllamaProviderError);
  });

  it('throws OllamaProviderError when the response has no "message" field', async () => {
    mockFetchOnce({ ok: true, json: () => ({ done: true }) });
    await expect(new OllamaProvider().converse(baseInput)).rejects.toThrow(OllamaProviderError);
  });
});

describe('OllamaProvider — tool_result round-trip (Ollama correlates by name, not id)', () => {
  it('feeds a tool result back as a role:"tool" message naming the tool the assistant actually called', async () => {
    const fetchMock = mockFetchOnce({ ok: true, json: () => ({ message: { role: 'assistant', content: 'تمام' } }) });
    const provider = new OllamaProvider();

    const assistantTurn: LlmMessage = {
      role: 'assistant',
      content: [{ type: 'tool_call', id: 'call-1', name: 'search_customers', input: { query: 'أحمد' } }],
    };
    const toolResultTurn: LlmMessage = {
      role: 'user',
      content: [{ type: 'tool_result', toolCallId: 'call-1', content: '[{"nameAr":"أحمد"}]' }],
    };

    await provider.converse({ ...baseInput, messages: [baseInput.messages[0]!, assistantTurn, toolResultTurn] });

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    const toolMessage = body.messages.find((m: { role: string }) => m.role === 'tool');
    expect(toolMessage).toEqual({ role: 'tool', content: '[{"nameAr":"أحمد"}]', tool_name: 'search_customers' });
  });
});

describe('toAssistantMessage', () => {
  it('reconstructs text and tool_call parts from a converse result', () => {
    const message = toAssistantMessage({
      text: 'هفحص دلوقتي',
      toolCalls: [{ id: 'ollama-tool-1', name: 'search_customers', input: { query: 'أحمد' } }],
      stopReason: 'tool_use',
    });
    expect(message).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'هفحص دلوقتي' },
        { type: 'tool_call', id: 'ollama-tool-1', name: 'search_customers', input: { query: 'أحمد' } },
      ],
    });
  });
});

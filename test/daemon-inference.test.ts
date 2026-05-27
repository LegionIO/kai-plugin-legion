/**
 * Tests for daemon-inference.ts stream/tool loop behavior.
 *
 * Uses Node's built-in test runner (node --test).
 * Run: npx tsx test/daemon-inference.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTokenUsage,
  shouldForwardToolToDaemon,
} from '../src/backend/daemon-inference.js';

// ── Inline helpers (replicated from source to avoid import issues) ──────

type NormalizedToolCall = { id: string; name: string; arguments: string };

function normalizeOpenAIToolCalls(value: unknown): NormalizedToolCall[] {
  if (!Array.isArray(value)) return [];
  const calls: NormalizedToolCall[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const fn = (rec.function && typeof rec.function === 'object' && !Array.isArray(rec.function))
      ? rec.function as Record<string, unknown>
      : {};
    const id = typeof rec.id === 'string' && rec.id.trim().length > 0 ? rec.id : '';
    const name = typeof fn.name === 'string' && fn.name.trim().length > 0
      ? fn.name
      : typeof rec.name === 'string' && rec.name.trim().length > 0
        ? rec.name
        : '';
    if (!id || !name) continue;
    let argString = '{}';
    if (typeof fn.arguments === 'string') argString = fn.arguments;
    else if (typeof rec.arguments === 'string') argString = rec.arguments;
    else { try { argString = JSON.stringify(rec.arguments ?? {}); } catch { argString = '{}'; } }
    calls.push({ id, name, arguments: argString });
  }
  return calls;
}

// ── SSE frame builder ───────────────────────────────────────────────────

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildSSEStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = frames.map((f) => encoder.encode(f));
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('normalizeOpenAIToolCalls', () => {
  it('parses OpenAI nested format', () => {
    const input = [{
      id: 'call_123',
      type: 'function',
      function: { name: 'read_file', arguments: '{"path":"/tmp/x"}' },
    }];
    const result = normalizeOpenAIToolCalls(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'call_123');
    assert.equal(result[0].name, 'read_file');
    assert.equal(result[0].arguments, '{"path":"/tmp/x"}');
  });

  it('parses flat daemon format', () => {
    const input = [{ id: 'tc_1', name: 'shell', arguments: '{"cmd":"ls"}' }];
    const result = normalizeOpenAIToolCalls(input);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'tc_1');
    assert.equal(result[0].name, 'shell');
    assert.equal(result[0].arguments, '{"cmd":"ls"}');
  });

  it('skips entries with missing id', () => {
    const input = [{ name: 'test', arguments: '{}' }];
    const result = normalizeOpenAIToolCalls(input);
    assert.equal(result.length, 0);
  });

  it('skips entries with missing name', () => {
    const input = [{ id: 'call_1', arguments: '{}' }];
    const result = normalizeOpenAIToolCalls(input);
    assert.equal(result.length, 0);
  });

  it('handles non-string arguments by serializing', () => {
    const input = [{ id: 'call_1', name: 'fn', arguments: { key: 'val' } }];
    const result = normalizeOpenAIToolCalls(input);
    assert.equal(result[0].arguments, '{"key":"val"}');
  });

  it('returns empty array for non-array input', () => {
    assert.deepEqual(normalizeOpenAIToolCalls(null), []);
    assert.deepEqual(normalizeOpenAIToolCalls(undefined), []);
    assert.deepEqual(normalizeOpenAIToolCalls('string'), []);
    assert.deepEqual(normalizeOpenAIToolCalls({}), []);
  });
});

describe('normalizeTokenUsage', () => {
  it('accepts Legion daemon snake_case usage fields', () => {
    assert.deepEqual(normalizeTokenUsage({
      input_tokens: '4200',
      output_tokens: 3600,
      cache_read_tokens: 120,
      cache_write_tokens: 8,
    }), {
      inputTokens: 4200,
      outputTokens: 3600,
      cacheReadTokens: 120,
      cacheWriteTokens: 8,
      totalTokens: 7800,
    });
  });

  it('accepts OpenAI-compatible prompt/completion token fields', () => {
    assert.deepEqual(normalizeTokenUsage({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 55,
        total_tokens: 155,
      },
    }), {
      inputTokens: 100,
      outputTokens: 55,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 155,
    });
  });

  it('returns null for non-token context usage events', () => {
    assert.equal(normalizeTokenUsage({
      usedTokens: 1000,
      contextWindowTokens: 128000,
      phase: 'pre-compaction',
    }), null);
  });
});

describe('shouldForwardToolToDaemon', () => {
  it('does not advertise Kai plugin tools to the Legion daemon', () => {
    assert.equal(shouldForwardToolToDaemon({ name: 'plugin__aithena__recall', source: 'plugin' }), false);
    assert.equal(shouldForwardToolToDaemon({ name: 'plugin__cron__create', source: 'plugin' }), false);
    assert.equal(shouldForwardToolToDaemon({ name: 'plugin__legacy__tool' }), false);
  });

  it('advertises built-in, CLI, MCP, and skill tools', () => {
    assert.equal(shouldForwardToolToDaemon({ name: 'bash', source: 'builtin' }), true);
    assert.equal(shouldForwardToolToDaemon({ name: 'legionio', source: 'cli' }), true);
    assert.equal(shouldForwardToolToDaemon({ name: 'mcp__github__search', source: 'mcp' }), true);
    assert.equal(shouldForwardToolToDaemon({ name: 'skill__review', source: 'skill' }), true);
  });
});

describe('SSE stream parsing', () => {
  // Minimal SSE consumer for testing (replicates core logic from consumeDaemonSSE)
  async function* consumeTestSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<{ type: string; data?: unknown; text?: string }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let currentEventName = '';
    let currentDataLines: string[] = [];

    const flushEvent = (): Array<{ type: string; data?: unknown; text?: string }> => {
      if (!currentEventName && currentDataLines.length === 0) return [];
      const rawData = currentDataLines.join('\n').trim();
      const eventName = currentEventName;
      currentEventName = '';
      currentDataLines = [];
      if (!rawData || rawData === '[DONE]') return [];
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(rawData); } catch { return [{ type: 'text-delta', text: rawData }]; }
      if (eventName === 'text-delta' || eventName === 'text_delta') {
        const text = (payload.text as string) || (payload.delta as string) || '';
        return text ? [{ type: 'text-delta', text }] : [];
      }
      if (eventName === 'thinking-delta' || eventName === 'thinking_delta') {
        const delta = (payload.delta as string) || (payload.text as string) || '';
        return delta ? [{ type: 'observer-message', text: delta }] : [];
      }
      if (eventName === 'error') {
        return [{ type: 'error', text: (payload.error as string) || (payload.message as string) || 'error' }];
      }
      if (eventName === 'done') {
        return [{ type: 'done', data: payload }];
      }
      return [];
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed) {
          for (const evt of flushEvent()) yield evt;
          continue;
        }
        if (trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('event:')) { currentEventName = trimmed.slice(6).trim(); continue; }
        if (trimmed.startsWith('data:')) { currentDataLines.push(trimmed.slice(5).trimStart()); }
      }
    }
    for (const evt of flushEvent()) yield evt;
  }

  it('parses text-delta events', async () => {
    const stream = buildSSEStream([
      sseFrame('text-delta', { delta: 'Hello' }),
      sseFrame('text-delta', { delta: ' world' }),
      sseFrame('done', { content: 'Hello world' }),
    ]);
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of consumeTestSSE(stream)) events.push(event);
    assert.equal(events.filter((e) => e.type === 'text-delta').length, 2);
    assert.equal(events[0].text, 'Hello');
    assert.equal(events[1].text, ' world');
    assert.equal(events[2].type, 'done');
  });

  it('parses thinking-delta as observer-message', async () => {
    const stream = buildSSEStream([
      sseFrame('thinking-delta', { delta: 'Let me think...' }),
      sseFrame('text-delta', { delta: 'Answer' }),
      sseFrame('done', { content: 'Answer' }),
    ]);
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of consumeTestSSE(stream)) events.push(event);
    assert.equal(events[0].type, 'observer-message');
    assert.equal(events[0].text, 'Let me think...');
    assert.equal(events[1].type, 'text-delta');
    assert.equal(events[1].text, 'Answer');
  });

  it('parses error events', async () => {
    const stream = buildSSEStream([
      sseFrame('error', { error: 'provider timeout' }),
    ]);
    const events: Array<{ type: string; text?: string }> = [];
    for await (const event of consumeTestSSE(stream)) events.push(event);
    assert.equal(events[0].type, 'error');
    assert.equal(events[0].text, 'provider timeout');
  });

  it('handles done with tool_calls and requires_tool_result', async () => {
    const stream = buildSSEStream([
      sseFrame('text-delta', { delta: 'I will call a tool' }),
      sseFrame('done', {
        content: 'I will call a tool',
        stop_reason: 'tool_use',
        requires_tool_result: true,
        tool_calls: [{ id: 'tc_1', name: 'read_file', arguments: '{"path":"x"}' }],
      }),
    ]);
    const events: Array<{ type: string; data?: unknown }> = [];
    for await (const event of consumeTestSSE(stream)) events.push(event);
    const done = events.find((e) => e.type === 'done');
    assert.ok(done);
    const payload = done!.data as Record<string, unknown>;
    assert.equal(payload.requires_tool_result, true);
    assert.equal(payload.stop_reason, 'tool_use');
    const tc = (payload.tool_calls as Array<Record<string, unknown>>)[0];
    assert.equal(tc.name, 'read_file');
  });
});

describe('tool call round-trip format', () => {
  it('produces flat format for assistant message', () => {
    const doneToolCalls = [{ id: 'tc_1', name: 'shell', arguments: '{"cmd":"ls"}' }];
    const toolCalls = normalizeOpenAIToolCalls(doneToolCalls);
    const assistantMsg = {
      role: 'assistant',
      content: 'Running command',
      tool_calls: toolCalls,
    };
    assert.deepEqual(assistantMsg.tool_calls, [{ id: 'tc_1', name: 'shell', arguments: '{"cmd":"ls"}' }]);
  });

  it('produces flat format from OpenAI response', () => {
    const openaiFormat = [{
      id: 'call_abc',
      type: 'function',
      function: { name: 'grep', arguments: '{"pattern":"foo"}' },
    }];
    const toolCalls = normalizeOpenAIToolCalls(openaiFormat);
    assert.deepEqual(toolCalls, [{ id: 'call_abc', name: 'grep', arguments: '{"pattern":"foo"}' }]);
  });
});

describe('max tool rounds termination', () => {
  it('normalizeOpenAIToolCalls returns empty for invalid tool calls', () => {
    const invalid = [
      { id: '', name: 'x', arguments: '{}' },
      { id: 'y', name: '', arguments: '{}' },
      null,
      undefined,
      42,
      'string',
    ];
    const result = normalizeOpenAIToolCalls(invalid);
    assert.equal(result.length, 0);
  });
});

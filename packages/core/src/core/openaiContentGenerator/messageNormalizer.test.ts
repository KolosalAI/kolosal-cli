import { describe, it, expect } from 'vitest';
import type OpenAI from 'openai';
import { normalizeOpenAIMessages } from './messageNormalizer.js';

type Msg = OpenAI.Chat.ChatCompletionMessageParam;

describe('normalizeOpenAIMessages', () => {
  it('merges adjacent user messages (string)', () => {
    const input: Msg[] = [
      { role: 'user', content: 'Hello' },
      { role: 'user', content: 'World' },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('user');
    expect(out[0]).toHaveProperty('content');
    expect((out[0] as any).content).toContain('Hello');
    expect((out[0] as any).content).toContain('World');
  });

  it('merges adjacent user messages (content parts)', () => {
    const input: Msg[] = [
      { role: 'user', content: [{ type: 'text', text: 'A' }] as any },
      { role: 'user', content: [{ type: 'text', text: 'B' }] as any },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toHaveLength(2);
  });

  it('merges adjacent assistant messages without tool_calls', () => {
    const input: Msg[] = [
      { role: 'assistant', content: 'One' },
      { role: 'assistant', content: 'Two' },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(1);
    expect((out[0] as any).content).toContain('One');
    expect((out[0] as any).content).toContain('Two');
  });

  it('does not merge assistant messages when tool_calls present', () => {
    const input: Msg[] = [
      {
        role: 'assistant',
        content: null as any,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'f', arguments: '{}' },
          },
        ],
      } as any,
      { role: 'assistant', content: 'next' },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(2);
  });

  it('never merges tool messages and keeps order', () => {
    const input: Msg[] = [
      {
        role: 'assistant',
        content: null as any,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'f', arguments: '{}' },
          },
        ],
      } as any,
      { role: 'tool', tool_call_id: 'call_1', content: 'result' } as any,
      { role: 'user', content: 'follow up' },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(3);
    expect(out[1].role).toBe('tool');
  });

  it('drops empty assistant messages without tool_calls', () => {
    const input: Msg[] = [
      { role: 'assistant', content: '' },
      { role: 'user', content: 'hi' },
    ];
    const out = normalizeOpenAIMessages(input);
    expect(out).toHaveLength(1);
    expect(out[0].role).toBe('user');
  });
});

/**
 * Utility to normalize OpenAI Chat messages before sending.
 * - Merges adjacent same-role messages for user/assistant/system (when safe)
 * - Never merges tool messages
 * - Does not merge assistant messages that contain tool_calls
 * - Drops empty assistant messages without tool_calls
 */
import type OpenAI from 'openai';

type Msg = OpenAI.Chat.ChatCompletionMessageParam;

function hasToolCalls(msg: Partial<Msg>): boolean {
  const toolCalls = (msg as any).tool_calls;
  return Array.isArray(toolCalls) && toolCalls.length > 0;
}

function isEmptyAssistant(msg: Msg): boolean {
  if (msg.role !== 'assistant') return false;
  if (hasToolCalls(msg)) return false;
  const content: any = (msg as any).content;
  if (content == null) return true;
  if (typeof content === 'string') return content.trim().length === 0;
  if (Array.isArray(content)) {
    // Consider empty if no parts or all parts are empty text
    return content.length === 0 || content.every((p: any) => {
      if (!p) return true;
      if (typeof p === 'string') return String(p).trim().length === 0;
      // Common content-part shapes have p.type and a text field
      if (typeof p === 'object' && 'text' in p) {
        return String((p as any).text ?? '').trim().length === 0;
      }
      return false; // Non-text content part exists
    });
  }
  return false;
}

function mergeContent(a: any, b: any): any {
  if (a == null) return b;
  if (b == null) return a;

  const toTextPart = (s: string) => ({ type: 'text', text: s });

  const isArrA = Array.isArray(a);
  const isArrB = Array.isArray(b);

  if (typeof a === 'string' && typeof b === 'string') {
    const left = a.trim();
    const right = b.trim();
    if (!left) return b;
    if (!right) return a;
    return `${left}\n\n${right}`;
  }

  if (isArrA && isArrB) {
    return [...a, ...b];
  }

  if (isArrA && typeof b === 'string') {
    return [...a, toTextPart(b)];
  }

  if (typeof a === 'string' && isArrB) {
    return [toTextPart(a), ...b];
  }

  // Fallback: prefer b (newer content)
  return b;
}

export function normalizeOpenAIMessages(
  messages: Msg[],
): Msg[] {
  const out: Msg[] = [];

  for (const msg of messages) {
    // Drop empty assistant messages without tool calls
    if (isEmptyAssistant(msg)) {
      continue;
    }

    const last = out[out.length - 1];

    // Never merge tool messages; they must remain atomic and ordered
    if (msg.role === 'tool') {
      out.push(msg);
      continue;
    }

    // If the previous assistant had tool_calls, we shouldn't merge or reorder
    if (last?.role === 'assistant' && hasToolCalls(last)) {
      out.push(msg);
      continue;
    }

    // Merge adjacent system messages
    if (last && last.role === 'system' && msg.role === 'system') {
      out[out.length - 1] = {
        ...last,
        content: mergeContent((last as any).content, (msg as any).content) as any,
      } as Msg;
      continue;
    }

    // Merge adjacent user messages
    if (last && last.role === 'user' && msg.role === 'user') {
      out[out.length - 1] = {
        ...last,
        content: mergeContent((last as any).content, (msg as any).content) as any,
      } as Msg;
      continue;
    }

    // Merge adjacent assistant messages only if neither has tool_calls
    if (
      last &&
      last.role === 'assistant' &&
      msg.role === 'assistant' &&
      !hasToolCalls(last) &&
      !hasToolCalls(msg)
    ) {
      // Preserve the older message fields; content merged, tool_calls nonexistent
      out[out.length - 1] = {
        ...last,
        content: mergeContent((last as any).content, (msg as any).content) as any,
      } as Msg;
      continue;
    }

    out.push(msg);
  }

  return out;
}

export default normalizeOpenAIMessages;

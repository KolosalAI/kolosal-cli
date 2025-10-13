/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAIContentConverter } from './converter.js';
import type { StreamingToolCallParser } from './streamingToolCallParser.js';
import type { GenerateContentParameters } from '@google/genai';

describe('OpenAIContentConverter', () => {
  let converter: OpenAIContentConverter;

  beforeEach(() => {
    converter = new OpenAIContentConverter('test-model');
  });

  describe('resetStreamingToolCalls', () => {
    it('should clear streaming tool calls accumulator', () => {
      // Access private field for testing
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;

      // Add some test data to the parser
      parser.addChunk(0, '{"arg": "value"}', 'test-id', 'test-function');
      parser.addChunk(1, '{"arg2": "value2"}', 'test-id-2', 'test-function-2');

      // Verify data is present
      expect(parser.getBuffer(0)).toBe('{"arg": "value"}');
      expect(parser.getBuffer(1)).toBe('{"arg2": "value2"}');

      // Call reset method
      converter.resetStreamingToolCalls();

      // Verify data is cleared
      expect(parser.getBuffer(0)).toBe('');
      expect(parser.getBuffer(1)).toBe('');
    });

    it('should be safe to call multiple times', () => {
      // Call reset multiple times
      converter.resetStreamingToolCalls();
      converter.resetStreamingToolCalls();
      converter.resetStreamingToolCalls();

      // Should not throw any errors
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;
      expect(parser.getBuffer(0)).toBe('');
    });

    it('should be safe to call on empty accumulator', () => {
      // Call reset on empty accumulator
      converter.resetStreamingToolCalls();

      // Should not throw any errors
      const parser = (
        converter as unknown as {
          streamingToolCallParser: StreamingToolCallParser;
        }
      ).streamingToolCallParser;
      expect(parser.getBuffer(0)).toBe('');
    });
  });

  describe('streaming tool call text removal', () => {
    it('should buffer text content during streaming and emit clean text when complete', () => {
      // Simulate streaming chunks that contain inline tool calls
      // This simulates the user's scenario where tool call markers were leaking through
      
      // Chunk 1: Start of text + beginning of tool call
      const chunk1 = {
        choices: [{
          delta: {
            content: '✦ I\'ll create a simple snake game in Python. Let me start by planning this task.functions.todo_write:0{"todos": [{"id": "1", "content": "Create main file"'
          }
        }]
      };
      
      // Chunk 2: Middle of tool call JSON
      const chunk2 = {
        choices: [{
          delta: {
            content: ', "status": "pending"}]}I\'ll create a simple snake game in Python. Let me start by planning this task.'
          }
        }]
      };
      
      // Chunk 3: Stream completion
      const chunk3 = {
        choices: [{
          delta: {
            content: ''
          },
          finish_reason: 'stop'
        }]
      };

      // Process chunks
      const result1 = converter.convertOpenAIChunkToGemini(chunk1 as any);
      const result2 = converter.convertOpenAIChunkToGemini(chunk2 as any);
      const result3 = converter.convertOpenAIChunkToGemini(chunk3 as any);

      // During streaming (chunks 1 and 2), no text should be emitted to prevent tool call leakage
      expect(result1.candidates?.[0]?.content?.parts?.some(part => 'text' in part)).toBe(false);
      expect(result2.candidates?.[0]?.content?.parts?.some(part => 'text' in part)).toBe(false);

      // When stream completes (chunk 3), should emit cleaned text and tool calls
      const finalParts = result3.candidates?.[0]?.content?.parts || [];
      const textParts = finalParts.filter(part => 'text' in part);
      const functionCalls = finalParts.filter(part => 'functionCall' in part);

      // Should have found the tool call
      expect(functionCalls).toHaveLength(1);
      expect(functionCalls[0]).toMatchObject({
        functionCall: {
          name: 'todo_write',
          args: {
            todos: [{ id: "1", content: "Create main file", status: "pending" }]
          }
        }
      });

      // Should have cleaned text content (without tool call markers)
      expect(textParts).toHaveLength(1);
      const cleanedText = (textParts[0] as any).text;
      expect(cleanedText).toContain('✦ I\'ll create a simple snake game in Python');
      expect(cleanedText).not.toContain('functions.todo_write:0{');
      expect(cleanedText).not.toContain('{"todos":');
    });
  });

  describe('malformed array content handling', () => {
    it('should handle array of parts as content (422 error fix)', () => {
      // This tests the fix for the 422 API error where conversation history
      // contains arrays of parts instead of proper Content objects
      const request = {
        contents: [
          // Normal user message
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          },
          // Normal assistant response with tool call
          {
            role: 'model',
            parts: [
              { text: 'I will help you.' },
              {
                functionCall: {
                  id: 'call_123',
                  name: 'test_function',
                  args: { param: 'value' }
                }
              }
            ]
          },
          // Malformed function response - array instead of Content object
          // This is what causes the 422 error
          [
            {
              functionResponse: {
                id: 'call_123',
                name: 'test_function',
                response: { result: 'success' }
              }
            }
          ]
        ]
      };

      const messages = converter.convertGeminiRequestToOpenAI(request as any);

      // Should have 3 messages: user, assistant with tool call, and tool response
      expect(messages).toHaveLength(3);
      
      // First message: user
      expect(messages[0]).toMatchObject({
        role: 'user'
      });
      // Content should be either string or array with text
      const userContent = (messages[0] as any).content;
      const textContent = typeof userContent === 'string' ? userContent : 
        userContent.find((part: any) => part.type === 'text')?.text;
      expect(textContent).toBe('Hello');

      // Second message: assistant with tool call
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        content: 'I will help you.',
        tool_calls: [{
          id: 'call_123',
          type: 'function',
          function: {
            name: 'test_function',
            arguments: '{"param":"value"}'
          }
        }]
      });

      // Third message: tool response (from malformed array)
      expect(messages[2]).toMatchObject({
        role: 'tool',
        tool_call_id: 'call_123',
        content: '{"result":"success"}'
      });
    });

    it('should handle bare Part[] arrays in conversation history', () => {
      // This simulates the malformed case from the error log where a Part[] array
      // is stored directly in contents instead of being wrapped in a Content object
      const malformedRequest: GenerateContentParameters = {
        model: 'test-model',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'compare for loop speed in python and c++' }]
          },
          {
            role: 'model',
            parts: [
              { text: 'I will create a comparison.' },
              {
                functionCall: {
                  id: '0',
                  name: 'todo_write',
                  args: { todos: [{ id: '1', content: 'Create test', status: 'pending' }] }
                }
              }
            ]
          },
          [
            {
              functionResponse: {
                id: '0',
                name: 'todo_write',
                response: { output: '{"success":true}' }
              }
            }
          ] as any, // Malformed: bare Part[] instead of Content
        ]
      };

      const result = converter.convertGeminiRequestToOpenAI(malformedRequest);
      
      // Should have 3 messages: user + assistant with tool_calls + tool response
      expect(result.length).toBeGreaterThanOrEqual(3);
      
      // Find the tool message
      const toolMessage = result.find(m => m.role === 'tool');
      expect(toolMessage).toBeDefined();
      expect(toolMessage).toMatchObject({
        role: 'tool',
        tool_call_id: '0'
      });
    });

    it('should remap duplicate tool call ids to keep OpenAI payload valid', () => {
      const request: GenerateContentParameters = {
        model: 'test-model',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'compare for loop speed in python and c++' }],
          },
          {
            role: 'model',
            parts: [
              { text: 'Planning benchmarks.' },
              {
                functionCall: {
                  id: '0',
                  name: 'todo_write',
                  args: { todos: [{ id: '1', content: 'python script', status: 'pending' }] },
                },
              },
            ],
          },
          {
            role: 'user',
            parts: [
              {
                functionResponse: {
                  id: '0',
                  name: 'todo_write',
                  response: { output: '{"success":true}' },
                },
              },
            ],
          },
          {
            role: 'model',
            parts: [
              {
                functionCall: {
                  id: '0',
                  name: 'todo_write',
                  args: {
                    todos: [
                      { id: '1', content: 'python script', status: 'in_progress' },
                      { id: '2', content: 'c++ benchmark', status: 'pending' },
                    ],
                  },
                },
              },
            ],
          },
          [
            {
              functionResponse: {
                id: '0',
                name: 'todo_write',
                response: {
                  output:
                    '{"success":true,"todos":[{"id":"1","status":"in_progress"},{"id":"2","status":"pending"}]}',
                },
              },
            },
          ] as any,
        ],
      };

      const messages = converter.convertGeminiRequestToOpenAI(request);
      const assistantMessages = messages.filter((m) => m.role === 'assistant');
      const toolMessages = messages.filter((m) => m.role === 'tool');

      expect(assistantMessages).toHaveLength(2);
      expect(assistantMessages[0]).toMatchObject({
        role: 'assistant',
        tool_calls: [
          {
            id: '0',
            function: {
              name: 'todo_write',
            },
          },
        ],
      });
      expect(assistantMessages[1]).toMatchObject({
        role: 'assistant',
        tool_calls: [
          {
            id: '0__1',
            function: {
              name: 'todo_write',
            },
          },
        ],
      });

      expect(toolMessages).toHaveLength(2);
      expect(toolMessages.map((m) => (m as any).tool_call_id)).toEqual(['0', '0__1']);
    });

      it('should deduplicate sequential text segments around tool calls', () => {
        const request: GenerateContentParameters = {
          model: 'test-model',
          contents: [
            {
              role: 'model',
              parts: [
                {
                  text: 'Repeated text before call.'
                },
                {
                  functionCall: {
                    id: '123',
                    name: 'test_function',
                    args: { foo: 'bar' }
                  }
                },
                {
                  text: 'Repeated text before call.'
                }
              ]
            },
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    id: '123',
                    name: 'test_function',
                    response: { output: 'ok' }
                  }
                }
              ]
            }
          ]
        };

        const messages = converter.convertGeminiRequestToOpenAI(request);
        const assistantMessage = messages.find((m) => m.role === 'assistant');

        expect(assistantMessage).toBeDefined();
        expect(assistantMessage?.content).toBe('Repeated text before call.');
      });
  });
});



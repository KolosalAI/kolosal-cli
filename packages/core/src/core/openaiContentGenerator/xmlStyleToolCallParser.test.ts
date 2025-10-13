/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { XmlStyleToolCallParser } from './xmlStyleToolCallParser.js';

describe('XmlStyleToolCallParser', () => {
  let parser: XmlStyleToolCallParser;

  beforeEach(() => {
    parser = new XmlStyleToolCallParser();
  });

  describe('Basic functionality', () => {
    it('should initialize with empty state', () => {
      expect(parser.getCompletedToolCalls()).toEqual([]);
    });

    it('should handle complete tool call in single chunk', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "/Users/rbisri/Documents/test-kolosal-code/sentiment-classification"}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '0',
        name: 'list_directory',
        args: { path: '/Users/rbisri/Documents/test-kolosal-code/sentiment-classification' }
      });
    });

    it('should handle tool call without ID', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file<|tool_call_argument_begin|>{"filePath": "/path/to/file"}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        name: 'read_file',
        args: { filePath: '/path/to/file' }
      });
    });

    it('should handle multiple tool calls in one section', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "/path1"}<|tool_call_end|><|tool_call_begin|>functions.read_file:1<|tool_call_argument_begin|>{"filePath": "/path2"}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0]).toEqual({
        id: '0',
        name: 'list_directory',
        args: { path: '/path1' }
      });
      expect(result.toolCalls![1]).toEqual({
        id: '1',
        name: 'read_file',
        args: { filePath: '/path2' }
      });
    });
  });

  describe('Streaming functionality', () => {
    it('should accumulate chunks until complete', () => {
      let result = parser.addChunk('<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0');
      expect(result.complete).toBe(false);

      result = parser.addChunk('<|tool_call_argument_begin|>{"path": "/test"}');
      expect(result.complete).toBe(false);

      result = parser.addChunk('<|tool_call_end|><|tool_calls_section_end|>');
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '0',
        name: 'list_directory',
        args: { path: '/test' }
      });
    });

    it('should handle fragmented delimiters', () => {
      let result = parser.addChunk('<|tool_calls_section_');
      expect(result.complete).toBe(false);

      result = parser.addChunk('begin|><|tool_call_begin|>functions.test:1<|tool_call_argument_');
      expect(result.complete).toBe(false);

      result = parser.addChunk('begin|>{"key": "value"}<|tool_call_end|><|tool_calls_section_end|>');
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '1',
        name: 'test',
        args: { key: 'value' }
      });
    });

    it('should handle mixed content with tool calls', () => {
      let result = parser.addChunk('Some regular text before ');
      expect(result.complete).toBe(false);

      result = parser.addChunk('<|tool_calls_section_begin|><|tool_call_begin|>functions.my_func:2<|tool_call_argument_begin|>{}');
      expect(result.complete).toBe(false);

      result = parser.addChunk('<|tool_call_end|><|tool_calls_section_end|> and some text after');
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '2',
        name: 'my_func',
        args: {}
      });
      // Should extract and return text content that's not part of tool calls
      expect(result.textContent).toBe('Some regular text before  and some text after');
    });

    it('should extract text content from XML tool calls', () => {
      const content = 'Let me check the current directory<|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "."}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '0',
        name: 'list_directory',
        args: { path: '.' }
      });
      expect(result.textContent).toBe('Let me check the current directory');
    });

    it('should extract text content before and after tool calls', () => {
      const content = 'I need to read the file<|tool_calls_section_begin|><|tool_call_begin|>functions.read_file:1<|tool_call_argument_begin|>{"filePath": "/path/file.txt"}<|tool_call_end|><|tool_calls_section_end|>to understand the issue better.';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: '1',
        name: 'read_file',
        args: { filePath: '/path/file.txt' }
      });
      expect(result.textContent).toBe('I need to read the fileto understand the issue better.');
    });
  });

  describe('Error handling', () => {
    it('should handle invalid JSON in arguments', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.test:0<|tool_call_argument_begin|>{invalid json<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!).toContain('Failed to parse tool call arguments');
    });

    it('should handle missing function name', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>:0<|tool_call_argument_begin|>{"key": "value"}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error!).toContain('Tool call missing function name');
    });
  });

  describe('Function name parsing', () => {
    it('should extract function name from path', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.my_tool_name:0<|tool_call_argument_begin|>{}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls![0].name).toBe('my_tool_name');
    });

    it('should handle nested namespaces', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>system.functions.nested.tool:0<|tool_call_argument_begin|>{}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls![0].name).toBe('tool');
    });

    it('should handle simple function name without namespace', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>simple_func:0<|tool_call_argument_begin|>{}<|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls![0].name).toBe('simple_func');
    });
  });

  describe('Reset functionality', () => {
    it('should reset parser state', () => {
      parser.addChunk('<|tool_calls_section_begin|><|tool_call_begin|>functions.test:0<|tool_call_argument_begin|>{"key": "value"}');
      
      parser.reset();
      
      expect(parser.getCompletedToolCalls()).toEqual([]);
      
      const result = parser.addChunk('<|tool_calls_section_begin|><|tool_call_begin|>functions.other:1<|tool_call_argument_begin|>{"other": "data"}<|tool_call_end|><|tool_calls_section_end|>');
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('other');
    });
  });

  describe('Static utility methods', () => {
    it('should detect XML tool call markers', () => {
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('<|tool_calls_section_begin|>')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('<|tool_call_begin|>')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('regular text')).toBe(false);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('some <|tool_calls_section_begin|> content')).toBe(true);
    });

    it('should detect basic tool call patterns without XML markers', () => {
      // Test the basic pattern detection
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('functions.todo_write:0{"todos": []}')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('simple_function:123{"arg": "value"}')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('functions.complex_name:0{"complex": {"nested": "data"}}')).toBe(true);
      
      // Test embedded patterns (tool calls within text)
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('Some text before:functions.test:1{"arg": "value"}')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('Let me create a file:functions.write_file:0{"path": "/test"}')).toBe(true);
      
      // Should not match invalid patterns
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('not_a_function {"arg": "value"}')).toBe(false);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('functions.name:id without json')).toBe(false);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('just some regular text')).toBe(false);
    });

    it('should detect markdown-style tool call patterns', () => {
      // Test markdown-style tool call detection
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('[tool_call: read_file]')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('[tool_call: write_file]')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('Some text [tool_call: test_function]')).toBe(true);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('Content with <｜tool▁call▁end｜> marker')).toBe(true);
      
      // Should not match invalid markdown patterns
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('[not_tool_call: something]')).toBe(false);
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers('[tool_call without closing bracket')).toBe(false);
    });
  });

  describe('Complex scenarios', () => {
    it('should handle empty tool calls section', () => {
      const content = '<|tool_calls_section_begin|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(false); // No tool calls found
    });

    it('should handle tool call with empty arguments', () => {
      const content = '<|tool_calls_section_begin|><|tool_call_begin|>functions.no_args:0<|tool_call_argument_begin|><|tool_call_end|><|tool_calls_section_end|>';
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(false); // Invalid JSON (empty)
      expect(result.error).toBeDefined();
    });

    it('should handle complex JSON arguments', () => {
      const complexArgs = {
        path: '/complex/path',
        options: {
          recursive: true,
          includeHidden: false,
          filters: ['*.js', '*.ts']
        },
        metadata: null
      };
      
      const content = `<|tool_calls_section_begin|><|tool_call_begin|>functions.complex_tool:0<|tool_call_argument_begin|>${JSON.stringify(complexArgs)}<|tool_call_end|><|tool_calls_section_end|>`;
      
      const result = parser.addChunk(content);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls![0].args).toEqual(complexArgs);
    });

    it('should continue processing after completed tool calls', () => {
      const parser = new XmlStyleToolCallParser();
      
      // First, add a complete tool call
      const firstChunk = '<|tool_calls_section_begin|><|tool_call_begin|>functions.first:1<|tool_call_argument_begin|>{"arg": "value"}<|tool_call_end|><|tool_calls_section_end|>';
      const result1 = parser.addChunk(firstChunk);
      
      expect(result1.complete).toBe(true);
      expect(result1.toolCalls).toHaveLength(1);
      expect(result1.toolCalls![0].name).toBe('first');
      
      // Then add another complete tool call - parser should handle this
      const secondChunk = '<|tool_calls_section_begin|><|tool_call_begin|>functions.second:2<|tool_call_argument_begin|>{"arg2": "value2"}<|tool_call_end|><|tool_calls_section_end|>';
      const result2 = parser.addChunk(secondChunk);
      
      expect(result2.complete).toBe(true);
      expect(result2.toolCalls).toHaveLength(1);
      expect(result2.toolCalls![0].name).toBe('second');
    });

    it('should handle tool calls that end abruptly with malformed JSON', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Add a tool call with malformed JSON (extra closing brace like in user's example)
      const chunk = '<|tool_calls_section_begin|><|tool_call_begin|>functions.test:1<|tool_call_argument_begin|>{"status": "completed"}}<|tool_call_end|><|tool_calls_section_end|>';
      const result = parser.addChunk(chunk);
      
      // Should now successfully parse after fixing the extra closing brace
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('test');
      expect(result.toolCalls![0].args).toEqual({ status: 'completed' });
    });

    it('should handle tool calls with multiple extra closing braces', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test with multiple extra closing braces
      const chunk = '<|tool_calls_section_begin|><|tool_call_begin|>functions.test:1<|tool_call_argument_begin|>{"data": {"nested": "value"}}}<|tool_call_end|><|tool_calls_section_end|>';
      const result = parser.addChunk(chunk);
      
      // Should successfully parse after removing extra brace
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].args).toEqual({ data: { nested: 'value' } });
    });

    it('should recover incomplete XML structures missing opening markers', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test the user's example - missing <|tool_calls_section_begin|> and <|tool_call_begin|>
      const incompleteChunk = 'functions.todo_write:3<|tool_call_argument_begin|>{"todos": [{"id": "1", "content": "Create the main snake game file with basic game structure", "status": "completed"}]}<|tool_call_end|><|tool_calls_section_end|>';
      const result = parser.addChunk(incompleteChunk);
      
      // Should now parse successfully using fragment recovery
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('todo_write');
      expect(result.toolCalls![0].id).toBe('3');
      expect(result.toolCalls![0].args).toEqual({
        todos: [{"id": "1", "content": "Create the main snake game file with basic game structure", "status": "completed"}]
      });
      
      // Should now be detected as containing XML markers
      expect(XmlStyleToolCallParser.containsXmlToolCallMarkers(incompleteChunk)).toBe(true);
    });

    it('should recover complex incomplete XML structures like the user example', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test the actual user's complete example with multiple todos
      const complexIncompleteChunk = 'functions.todo_write:3<|tool_call_argument_begin|>{"todos": [{"id": "1", "content": "Create the main snake game file with basic game structure", "status": "completed"}, {"id": "2", "content": "Implement snake movement and controls", "status": "completed"}, {"id": "3", "content": "Add food generation and collision detection", "status": "completed"}, {"id": "4", "content": "Implement scoring system and game over conditions", "status": "completed"}, {"id": "5", "content": "Test the game and ensure it runs properly", "status": "in_progress"}]}<|tool_call_end|><|tool_calls_section_end|>';
      const result = parser.addChunk(complexIncompleteChunk);
      
      // Should parse successfully
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('todo_write');
      expect(result.toolCalls![0].id).toBe('3');
      expect(result.toolCalls![0].args['todos']).toHaveLength(5);
      expect((result.toolCalls![0].args['todos'] as any[])[4]).toEqual({
        id: "5",
        content: "Test the game and ensure it runs properly",
        status: "in_progress"
      });
    });

    it('should recover basic tool calls with just function name and JSON (newest user example)', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test the newest user example - just functions.name:id{"json"}
      const basicChunk = 'functions.todo_write:0{"todos": [{"id": "1", "content": "Create the main snake game file with basic game structure", "status": "pending"}, {"id": "2", "content": "Implement snake movement and controls", "status": "pending"}]}';
      const result = parser.addChunk(basicChunk);
      
      // Should parse successfully using basic pattern recovery
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('todo_write');
      expect(result.toolCalls![0].id).toBe('0');
      expect(result.toolCalls![0].args['todos']).toHaveLength(2);
      expect((result.toolCalls![0].args['todos'] as any[])[0]).toEqual({
        id: "1",
        content: "Create the main snake game file with basic game structure",
        status: "pending"
      });
    });

    it('should recover tool calls embedded in text content', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test tool call embedded in text (like the latest user example)
      const embeddedChunk = 'The curses library has some issues. Let me create a simpler version:functions.write_file:5{"file_path": "/Users/test/simple_snake.py", "content": "#!/usr/bin/env python3\\nSimple Snake Game"}';
      const result = parser.addChunk(embeddedChunk);
      
      // Should parse successfully and separate text from tool call
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('write_file');
      expect(result.toolCalls![0].id).toBe('5');
      expect(result.toolCalls![0].args['file_path']).toBe('/Users/test/simple_snake.py');
      expect(result.toolCalls![0].args['content']).toContain('Simple Snake Game');
      
      // Should also return the text content before the tool call
      expect(result.textContent).toBe('The curses library has some issues. Let me create a simpler version:');
    });

    it('should handle complex multiline JSON in embedded tool calls', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test with complex JSON similar to user's failing example
      const complexEmbeddedChunk = 'Let me create a file:functions.write_file:5{"file_path": "/Users/test/game.py", "content": "#!/usr/bin/env python3\\n\\\"\\\"\\\"\\nGame Description\\n\\\"\\\"\\\"\\n\\nclass Game:\\n    def __init__(self):\\n        self.running = True"}';
      const result = parser.addChunk(complexEmbeddedChunk);
      
      // Should parse successfully despite complex JSON with escaped quotes and newlines
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('write_file');
      expect(result.toolCalls![0].id).toBe('5');
      expect(result.toolCalls![0].args['file_path']).toBe('/Users/test/game.py');
      expect(result.toolCalls![0].args['content']).toContain('Game Description');
      expect(result.toolCalls![0].args['content']).toContain('class Game:');
      
      // Should return text before the tool call
      expect(result.textContent).toBe('Let me create a file:');
    });

    it('should parse markdown-style tool calls with direct JSON', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test simple markdown-style tool call (like user's read_file example)
      const markdownChunk = 'I\'ll check the dependencies.\n\n[tool_call: read_file]\n\n{"absolute_path": "/Users/test/package.json"}';
      const result = parser.addChunk(markdownChunk);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('read_file');
      expect(result.toolCalls![0].args['absolute_path']).toBe('/Users/test/package.json');
      expect(result.textContent).toBe('I\'ll check the dependencies.');
    });

    it('should parse markdown-style tool calls with json language marker', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test markdown-style tool call with "json" language marker (like user's write_file example)
      const markdownWithLangChunk = 'Let me write the script:\n\n[tool_call: write_file]\njson\n{"content": "print(\\"Hello World\\")", "file_path": "/Users/test/hello.py"}';
      const result = parser.addChunk(markdownWithLangChunk);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('write_file');
      expect(result.toolCalls![0].args['content']).toBe('print("Hello World")');
      expect(result.toolCalls![0].args['file_path']).toBe('/Users/test/hello.py');
      expect(result.textContent).toBe('Let me write the script:');
    });

    it('should parse complex markdown-style tool calls with multiline JSON', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test complex markdown tool call similar to user's write_file example with long content
      const complexMarkdownChunk = 'I\'ll create a Snake game:\n\n[tool_call: write_file]\njson\n{"content": "import pygame\\nimport sys\\n\\nclass SnakeGame:\\n    def __init__(self):\\n        self.running = True\\n        self.score = 0", "file_path": "/Users/test/snake.py"}';
      const result = parser.addChunk(complexMarkdownChunk);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('write_file');
      expect(result.toolCalls![0].args['content']).toContain('import pygame');
      expect(result.toolCalls![0].args['content']).toContain('class SnakeGame');
      expect(result.toolCalls![0].args['file_path']).toBe('/Users/test/snake.py');
      expect(result.textContent).toBe('I\'ll create a Snake game:');
    });

    it('should recover orphaned JSON blocks and infer function names', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test orphaned JSON that follows the pattern: text content + json\n{...}
      const orphanedJsonChunk = 'I\'ll create a comprehensive todo list:\n\njson\n{"operation": "write", "todoList": [{"id": 1, "title": "First task", "status": "not-started"}, {"id": 2, "title": "Second task", "status": "completed"}]}';
      const result = parser.addChunk(orphanedJsonChunk);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('manage_todo_list');
      expect(result.toolCalls![0].args).toEqual({
        operation: 'write',
        todoList: [
          { id: 1, title: 'First task', status: 'not-started' },
          { id: 2, title: 'Second task', status: 'completed' }
        ]
      });
      expect(result.textContent).toBe('I\'ll create a comprehensive todo list:');
    });

    it('should recover orphaned JSON with file operations', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test orphaned JSON with file path indication
      const fileJsonChunk = 'I\'ll write the file:\n\njson\n{"filePath": "/path/to/file.py", "content": "print(\\"hello\\")"}';
      const result = parser.addChunk(fileJsonChunk);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('create_file');
      expect(result.toolCalls![0].args).toEqual({
        filePath: '/path/to/file.py',
        content: 'print("hello")'
      });
      expect(result.textContent).toBe('I\'ll write the file:');
    });

    it('should remove inline tool calls from text content like user scenario', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test the user's specific scenario with inline tool calls
      const userScenario = '✦ I\'ll create a simple snake game in Python. Let me start by planning this task.functions.todo_write:0{"todos": [{"id": "1", "content": "Create the main snake game file with basic game structure", "status": "pending"}, {"id": "2", "content": "Implement snake movement and controls", "status": "pending"}, {"id": "3", "content": "Add food generation and collision detection", "status": "pending"}, {"id": "4", "content": "Implement game over conditions and scoring", "status": "pending"}, {"id": "5", "content": "Test the game to ensure it works properly", "status": "pending"}]}I\'ll create a simple snake game in Python. Let me start by planning this task.';
      
      const result = parser.addChunk(userScenario);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].name).toBe('todo_write');
      expect(result.toolCalls![0].id).toBe('0');
      expect(result.toolCalls![0].args).toEqual({
        todos: [
          {"id": "1", "content": "Create the main snake game file with basic game structure", "status": "pending"},
          {"id": "2", "content": "Implement snake movement and controls", "status": "pending"},
          {"id": "3", "content": "Add food generation and collision detection", "status": "pending"},
          {"id": "4", "content": "Implement game over conditions and scoring", "status": "pending"},
          {"id": "5", "content": "Test the game to ensure it works properly", "status": "pending"}
        ]
      });
      
      // The key test: text content should NOT contain the inline tool call
      expect(result.textContent).toBe('✦ I\'ll create a simple snake game in Python. Let me start by planning this task. I\'ll create a simple snake game in Python. Let me start by planning this task.');
    });

    it('should handle simple inline tool call without functions prefix', () => {
      const parser = new XmlStyleToolCallParser();
      
      // Test tool call without "functions." prefix
      const simpleToolCall = 'Creating file: create_file:1{"path":"test.py","content":"# Hello World"}Done!';
      
      const result = parser.addChunk(simpleToolCall);
      
      expect(result.complete).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      
      expect(result.toolCalls![0]).toEqual({
        name: 'create_file',
        id: '1',
        args: { path: 'test.py', content: '# Hello World' }
      });
      
      // Text should have the tool call removed
      expect(result.textContent).toBe('Creating file: Done!');
    });
  });
});
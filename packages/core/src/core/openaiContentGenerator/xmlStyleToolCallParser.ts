/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Type definition for the result of parsing tool calls in XML format
 */
export interface XmlToolCallParseResult {
  /** Whether the tool call section is complete */
  complete: boolean;
  /** Array of parsed tool calls (only present when complete is true) */
  toolCalls?: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Text content that's not part of tool calls */
  textContent?: string;
  /** Error information if parsing failed */
  error?: string;
}

/**
 * XmlStyleToolCallParser - Handles streaming tool calls in XML format
 *
 * Format example:
 * <|tool_calls_section_begin|><|tool_call_begin|>functions.list_directory:0<|tool_call_argument_begin|>{"path": "/path"}<|tool_call_end|><|tool_calls_section_end|>
 *
 * Problems this parser addresses:
 * - Tool calls arrive in XML-style format with custom delimiters
 * - Tool calls can be fragmented across multiple chunks
 * - Need to extract function name, ID, and JSON arguments
 * - Handle multiple tool calls within a single section
 */
export class XmlStyleToolCallParser {
  /** Accumulated buffer containing all received chunks */
  private buffer = '';
  /** Whether we're currently inside a tool calls section */
  private inToolCallsSection = false;
  /** Whether we're currently inside a tool call */
  private inToolCall = false;
  /** Whether we're currently inside tool call arguments */
  private inArguments = false;
  /** Current tool call being parsed */
  private currentToolCall: {
    id?: string;
    name?: string;
    args?: string;
  } = {};
  /** Completed tool calls ready to be emitted */
  private completedToolCalls: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }> = [];
  /** Original buffer to track complete content for text extraction */
  private originalBuffer = '';

  // XML-style delimiters
  private static readonly SECTION_BEGIN = '<|tool_calls_section_begin|>';
  private static readonly SECTION_END = '<|tool_calls_section_end|>';
  private static readonly TOOL_CALL_BEGIN = '<|tool_call_begin|>';
  private static readonly TOOL_CALL_END = '<|tool_call_end|>';
  private static readonly ARGUMENT_BEGIN = '<|tool_call_argument_begin|>';

  /**
   * Add a chunk of content to the parser
   * @param chunk The content chunk to parse
   * @returns Result indicating if parsing is complete and any completed tool calls
   */
  addChunk(chunk: string): {
    complete: boolean;
    toolCalls?: Array<{
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }>;
    textContent?: string;
    error?: string;
  } {
    this.buffer += chunk;
    this.originalBuffer += chunk;
    
    try {
      const result = this.parseBuffer();
      
      // If parsing indicated completion, return the result
      if (result) {
        return result;
      }
      
      // Try to recover partial tool calls if we detect middle/end markers without beginning
      const recoveryResult = this.attemptFragmentRecovery();
      if (recoveryResult) {
        return recoveryResult;
      }
      
      return { complete: false };
    } catch (error) {
      return {
        complete: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Parse the accumulated buffer for XML-style tool calls
   * @returns XmlToolCallParseResult if section is complete, null otherwise
   */
  private parseBuffer(): XmlToolCallParseResult | null {
    let lastProcessedPosition = 0;
    let position = 0;
    
    while (position < this.buffer.length) {
      const originalPosition = position;
      
      if (!this.inToolCallsSection) {
        // Look for tool calls section begin
        const sectionBeginIndex = this.buffer.indexOf(XmlStyleToolCallParser.SECTION_BEGIN, position);
        if (sectionBeginIndex !== -1) {
          this.inToolCallsSection = true;
          position = sectionBeginIndex + XmlStyleToolCallParser.SECTION_BEGIN.length;
          lastProcessedPosition = position;
          continue;
        } else {
          // No section found, we're done parsing for now
          break;
        }
      }

      if (this.inToolCallsSection && !this.inToolCall) {
        // Look for tool call begin
        const toolCallBeginIndex = this.buffer.indexOf(XmlStyleToolCallParser.TOOL_CALL_BEGIN, position);
        const sectionEndIndex = this.buffer.indexOf(XmlStyleToolCallParser.SECTION_END, position);
        
        if (toolCallBeginIndex !== -1 && (sectionEndIndex === -1 || toolCallBeginIndex < sectionEndIndex)) {
          this.inToolCall = true;
          this.currentToolCall = {};
          position = toolCallBeginIndex + XmlStyleToolCallParser.TOOL_CALL_BEGIN.length;
          lastProcessedPosition = position;
          continue;
        }
        
        // Check if section ends without more tool calls
        if (sectionEndIndex !== -1) {
          this.inToolCallsSection = false;
          position = sectionEndIndex + XmlStyleToolCallParser.SECTION_END.length;
          lastProcessedPosition = position;
          
          // Section complete - return tool calls if any
          if (this.completedToolCalls.length > 0) {
            const toolCalls = [...this.completedToolCalls];
            
            // Only reset state, keep buffer for potential remaining content
            this.inToolCallsSection = false;
            this.inToolCall = false;
            this.inArguments = false;
            this.currentToolCall = {};
            this.completedToolCalls = [];
            
            // Extract text content from the original buffer by removing XML tool call markers
            const textContent = this.extractTextContentFromBuffer();
            
            // Remove processed content from buffer and reset original buffer
            this.buffer = this.buffer.substring(position);
            this.originalBuffer = '';
            
            return { 
              complete: true, 
              toolCalls,
              textContent: textContent || undefined
            };
          }
          continue;
        }
        
        // No tool call or section end found yet
        break;
      }

      if (this.inToolCall && !this.inArguments) {
        // Parse function name and ID (format: functions.name:id)
        const argumentBeginIndex = this.buffer.indexOf(XmlStyleToolCallParser.ARGUMENT_BEGIN, position);
        if (argumentBeginIndex !== -1) {
          const functionSpec = this.buffer.substring(position, argumentBeginIndex).trim();
          this.parseFunctionSpec(functionSpec);
          this.inArguments = true;
          position = argumentBeginIndex + XmlStyleToolCallParser.ARGUMENT_BEGIN.length;
          lastProcessedPosition = position;
          continue;
        }
        
        // No argument begin found yet
        break;
      }

      if (this.inArguments) {
        // Look for tool call end to get the arguments
        const toolCallEndIndex = this.buffer.indexOf(XmlStyleToolCallParser.TOOL_CALL_END, position);
        if (toolCallEndIndex !== -1) {
          const argsJson = this.buffer.substring(position, toolCallEndIndex).trim();
          this.currentToolCall.args = argsJson;
          
          // Complete the current tool call
          this.completeCurrentToolCall();
          
          this.inToolCall = false;
          this.inArguments = false;
          position = toolCallEndIndex + XmlStyleToolCallParser.TOOL_CALL_END.length;
          lastProcessedPosition = position;
          continue;
        }
        
        // No tool call end found yet
        break;
      }
      
      // If we reach here without making progress, break to avoid infinite loop
      if (position === originalPosition) {
        break;
      }
    }
    
    // Only clean up buffer if we've made progress
    if (lastProcessedPosition > 0) {
      this.buffer = this.buffer.substring(lastProcessedPosition);
    }
    
    return null; // Not complete yet
  }

  /**
   * Parse function specification (format: functions.name:id)
   */
  private parseFunctionSpec(spec: string): void {
    const parts = spec.split(':');
    const functionPath = parts[0]?.trim();
    const id = parts[1]?.trim();
    
    if (functionPath) {
      // Extract function name from path (e.g., "functions.list_directory" -> "list_directory")
      const nameParts = functionPath.split('.');
      this.currentToolCall.name = nameParts[nameParts.length - 1] || functionPath;
    }
    
    if (id) {
      this.currentToolCall.id = id;
    }
  }

  /**
   * Extract text content from the original buffer by removing XML tool call markers
   */
  private extractTextContentFromBuffer(): string {
    let content = this.originalBuffer;
    
    // Escape special regex characters in the delimiters
    const escapedSectionBegin = XmlStyleToolCallParser.SECTION_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedSectionEnd = XmlStyleToolCallParser.SECTION_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Remove all XML tool call sections
    content = content.replace(
      new RegExp(escapedSectionBegin + '.*?' + escapedSectionEnd, 'gs'), 
      ''
    );
    
    // Remove basic pattern tool calls: functions.name:id{...} or name:id{...}
    // Use the same logic as attemptFragmentRecovery for consistent JSON boundary detection
    content = this.removeBasicToolCallsFromText(content);
    
    return content.trim();
  }

  /**
   * Remove basic pattern tool calls from text using proper JSON boundary detection
   */
  private removeBasicToolCallsFromText(text: string): string {
    // Pattern to match: (optional functions.)name:id{json}
    const basicToolCallPattern = /(functions\.)?([a-zA-Z_][a-zA-Z0-9_]*):(\d+)(\{)/g;
    let result = text;
    let match;
    
    // Process each match from end to start to avoid index issues
    const matches: Array<{start: number, end: number}> = [];
    
    while ((match = basicToolCallPattern.exec(text)) !== null) {
      const matchStart = match.index;
      const jsonStart = matchStart + match[0].length - 1; // Position of opening brace
      
      // Find the end of the JSON object using brace counting
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      let jsonEnd = -1;
      
      for (let i = jsonStart; i < text.length; i++) {
        const char = text[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEnd = i + 1; // Include the closing brace
              break;
            }
          }
        }
      }
      
      if (jsonEnd !== -1) {
        matches.push({start: matchStart, end: jsonEnd});
      }
    }
    
    // Remove matches from end to start
    matches.sort((a, b) => b.start - a.start);
    for (const {start, end} of matches) {
      result = result.substring(0, start) + result.substring(end);
    }
    
    return result;
  }

  /**
   * Complete the current tool call by parsing arguments and adding to completed list
   */
  private completeCurrentToolCall(): void {
    if (!this.currentToolCall.name) {
      throw new Error('Tool call missing function name');
    }
    
    let parsedArgs: Record<string, unknown> = {};
    if (this.currentToolCall.args !== undefined) {
      const argsString = this.currentToolCall.args.trim();
      if (argsString === '') {
        // Empty arguments string should result in error
        throw new Error('Tool call arguments cannot be empty');
      }
      try {
        parsedArgs = JSON.parse(argsString);
      } catch (error) {
        // Try to fix common JSON issues before giving up
        let fixedArgsString = argsString;
        
        // Fix common issue: extra closing braces (like in the user's example)
        if (argsString.includes('}}')) {
          // Count opening and closing braces
          const openBraces = (argsString.match(/{/g) || []).length;
          const closeBraces = (argsString.match(/}/g) || []).length;
          
          if (closeBraces > openBraces) {
            // Remove extra closing braces from the end
            const extraBraces = closeBraces - openBraces;
            fixedArgsString = argsString.slice(0, -extraBraces);
          }
        }
        
        // Try parsing the fixed string
        try {
          parsedArgs = JSON.parse(fixedArgsString);
        } catch (secondError) {
          throw new Error(`Failed to parse tool call arguments: ${error}`);
        }
      }
    }
    
    this.completedToolCalls.push({
      id: this.currentToolCall.id,
      name: this.currentToolCall.name,
      args: parsedArgs
    });
    
    this.currentToolCall = {};
  }



  /**
   * Gets all completed tool calls
   */
  getCompletedToolCalls(): Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }> {
    return [...this.completedToolCalls];
  }

  /**
   * Attempt to recover a tool call from a fragment that may be missing opening markers
   */
  private attemptFragmentRecovery(): XmlToolCallParseResult | null {
    // Strategy 1: Look for patterns with some XML markers present
    const argBeginIndex = this.buffer.indexOf(XmlStyleToolCallParser.ARGUMENT_BEGIN);
    const toolEndIndex = this.buffer.indexOf(XmlStyleToolCallParser.TOOL_CALL_END);
    const sectionEndIndex = this.buffer.indexOf(XmlStyleToolCallParser.SECTION_END);
    
    // Check if we have argument markers and end markers (suggesting a partial tool call)
    if (argBeginIndex !== -1 && toolEndIndex !== -1 && sectionEndIndex !== -1) {
      // Try to extract function name from the beginning of the buffer
      const beforeArgs = this.buffer.substring(0, argBeginIndex).trim();
      
      // Check if it looks like a function spec (functions.name:id or just name)
      if (beforeArgs.length > 0 && (beforeArgs.includes('functions.') || beforeArgs.match(/^[a-zA-Z_][a-zA-Z0-9_]*:/))) {
        // Attempt to parse this as a complete tool call by adding missing markers
        const reconstructed = `${XmlStyleToolCallParser.SECTION_BEGIN}${XmlStyleToolCallParser.TOOL_CALL_BEGIN}${this.buffer}`;
        
        // Create a temporary parser to try parsing the reconstructed content
        const tempParser = new XmlStyleToolCallParser();
        const result = tempParser.addChunk(reconstructed);
        
        if (result.complete && result.toolCalls && result.toolCalls.length > 0) {
          // Recovery successful - update our state and return the result
          this.completedToolCalls.push(...result.toolCalls);
          this.buffer = ''; // Clear buffer since we processed everything
          
          return {
            complete: true,
            toolCalls: [...result.toolCalls]
          };
        }
      }
    }
    
    // Strategy 2: Look for even more basic patterns - function name followed by JSON anywhere in content
    // Pattern: functions.name:id{"json": "data"} or name:id{"json": "data"}
    const basicPattern = /(functions\.)?([a-zA-Z_][a-zA-Z0-9_]*):(\d+)(\{.*)/s;
    const match = this.buffer.match(basicPattern);
    
    if (match) {
      const [, , functionName, id, jsonAndRest] = match;
      const matchStartIndex = this.buffer.indexOf(match[0]);
      
      // Try to find where the JSON ends by parsing incrementally
      let jsonEndIndex = -1;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonAndRest.length; i++) {
        const char = jsonAndRest[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              jsonEndIndex = i + 1; // Include the closing brace
              break;
            }
          }
        }
      }
      
      if (jsonEndIndex !== -1) {
        const jsonArgs = jsonAndRest.substring(0, jsonEndIndex);
        const textAfter = jsonAndRest.substring(jsonEndIndex);
        
        try {
          // Try to parse the JSON arguments
          const parsedArgs = JSON.parse(jsonArgs);
          
          // Successfully parsed - create a tool call result
          const toolCall = {
            id,
            name: functionName,
            args: parsedArgs
          };
          
          // Extract text before the tool call
          const textBefore = this.buffer.substring(0, matchStartIndex);
          
          // Combine text content, removing the tool call
          const combinedText = [textBefore.trim(), textAfter.trim()].filter(Boolean).join(' ').trim();
          
          // Clear the buffer since we processed everything
          this.buffer = '';
          
          return {
            complete: true,
            toolCalls: [toolCall],
            textContent: combinedText || undefined
          };
        } catch (jsonError) {
          // JSON parsing failed - not a valid tool call
          return null;
        }
      }
    }
    
    // Strategy 3: Look for markdown-style tool calls
    // Pattern: [tool_call: function_name] followed by JSON (with optional "json" language marker)
    const markdownResult = this.attemptMarkdownToolCallRecovery();
    if (markdownResult) {
      return markdownResult;
    }
    
    // Strategy 4: Look for orphaned JSON blocks with "json" language marker
    // Pattern: "json" followed by JSON object (likely a malformed tool call)
    const orphanedJsonResult = this.attemptOrphanedJsonRecovery();
    if (orphanedJsonResult) {
      return orphanedJsonResult;
    }
    
    return null;
  }

  /**
   * Attempt to recover a markdown-style tool call
   * Format: [tool_call: function_name] followed by JSON (optionally with "json" language marker)
   */
  private attemptMarkdownToolCallRecovery(): XmlToolCallParseResult | null {
    // Pattern: [tool_call: function_name] with optional content after
    const toolCallHeaderPattern = /\[tool_call:\s*([a-zA-Z_][a-zA-Z0-9_]*)\]/;
    const headerMatch = this.buffer.match(toolCallHeaderPattern);
    
    if (!headerMatch) {
      return null;
    }
    
    const functionName = headerMatch[1];
    const headerEndIndex = headerMatch.index! + headerMatch[0].length;
    
    // Look for JSON content after the header
    const afterHeader = this.buffer.substring(headerEndIndex);
    
    // Handle potential "json" language marker
    let jsonContent = afterHeader.trim();
    
    // Remove optional language marker if present
    if (jsonContent.startsWith('json\n') || jsonContent.startsWith('json\r\n')) {
      jsonContent = jsonContent.replace(/^json\r?\n/, '');
    }
    
    // Try to find complete JSON object/array
    let jsonStartIndex = -1;
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < jsonContent.length; i++) {
      const char = jsonContent[i];
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }
      
      if (!inString) {
        if (char === '{') {
          if (jsonStartIndex === -1) {
            jsonStartIndex = i;
          }
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0 && jsonStartIndex !== -1) {
            // Found complete JSON object
            const jsonString = jsonContent.substring(jsonStartIndex, i + 1);
            
            try {
              const parsedArgs = JSON.parse(jsonString);
              
              // Extract text content before the tool call
              const textContent = this.buffer.substring(0, headerMatch.index!).trim();
              
              // Clear the buffer
              this.buffer = '';
              
              return {
                complete: true,
                toolCalls: [{
                  name: functionName,
                  args: parsedArgs
                }],
                textContent: textContent || undefined
              };
            } catch (jsonError) {
              // JSON parsing failed, continue looking
              continue;
            }
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Attempt to recover orphaned JSON blocks with "json" language marker
   * Format: "json" followed by JSON object (likely a malformed tool call)
   */
  private attemptOrphanedJsonRecovery(): XmlToolCallParseResult | null {
    // Look for pattern: potentially some text, then "json" on its own line, then JSON
    const orphanedJsonPattern = /^(.*?)(?:^|\n)\s*json\s*\n(\{.*\})$/ms;
    const match = this.buffer.match(orphanedJsonPattern);
    
    if (!match) {
      return null;
    }
    
    const [, textBefore, jsonContent] = match;
    
    try {
      // Try to parse the JSON
      const parsedArgs = JSON.parse(jsonContent);
      
      // Try to infer the function name from the JSON content
      let functionName = 'unknown_function';
      
      // Common patterns to infer function names
      if (parsedArgs.todoList || parsedArgs.todos) {
        functionName = 'manage_todo_list';
      } else if (parsedArgs.operation === 'write' && parsedArgs.todoList) {
        functionName = 'manage_todo_list';
      } else if (parsedArgs.filePath || parsedArgs.file_path || parsedArgs.absolute_path) {
        functionName = 'create_file';
      } else if (parsedArgs.content && !parsedArgs.filePath && !parsedArgs.file_path) {
        functionName = 'write_file';
      } else if (parsedArgs.command) {
        functionName = 'run_shell_command';
      } else if (parsedArgs.path) {
        functionName = 'read_file';
      }
      
      // Clear the buffer
      this.buffer = '';
      
      return {
        complete: true,
        toolCalls: [{
          name: functionName,
          args: parsedArgs
        }],
        textContent: textBefore.trim() || undefined
      };
    } catch (jsonError) {
      // JSON parsing failed
      return null;
    }
  }

  /**
   * Reset the parser state for processing a new stream
   */
  reset(): void {
    this.buffer = '';
    this.originalBuffer = '';
    this.inToolCallsSection = false;
    this.inToolCall = false;
    this.inArguments = false;
    this.currentToolCall = {};
    this.completedToolCalls = [];
  }

  /**
   * Check if the content contains XML-style tool call markers
   */
  static containsXmlToolCallMarkers(content: string): boolean {
    // Check for explicit XML markers first
    if (content.includes(XmlStyleToolCallParser.SECTION_BEGIN) ||
        content.includes(XmlStyleToolCallParser.TOOL_CALL_BEGIN) ||
        content.includes(XmlStyleToolCallParser.ARGUMENT_BEGIN) ||
        content.includes(XmlStyleToolCallParser.TOOL_CALL_END) ||
        content.includes(XmlStyleToolCallParser.SECTION_END)) {
      return true;
    }
    
    // Check for markdown-style tool calls: [tool_call: function_name]
    if (content.includes('[tool_call:') || content.includes('<｜tool▁call▁end｜>')) {
      return true;
    }
    
    // Also check for basic pattern: functions.name:id{"json"} or name:id{"json"} anywhere in content
    // For streaming detection, we also check for incomplete patterns (just the start of a tool call)
    const basicPattern = /(functions\.)?([a-zA-Z_][a-zA-Z0-9_]*):(\d+)(\{.*?\})/s;
    const incompletePattern = /(functions\.)?([a-zA-Z_][a-zA-Z0-9_]*):(\d+)\{/;
    return basicPattern.test(content) || incompletePattern.test(content);
  }
}
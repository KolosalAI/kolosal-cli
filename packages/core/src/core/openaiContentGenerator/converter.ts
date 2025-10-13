/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentParameters,
  Part,
  Content,
  Tool,
  ToolListUnion,
  CallableTool,
  FunctionCall,
  FunctionResponse,
  ContentListUnion,
  ContentUnion,
  PartUnion,
  Candidate,
} from '@google/genai';
import { GenerateContentResponse, FinishReason } from '@google/genai';
import type OpenAI from 'openai';
import { safeJsonParse } from '../../utils/safeJsonParse.js';
import { StreamingToolCallParser } from './streamingToolCallParser.js';
import { XmlStyleToolCallParser } from './xmlStyleToolCallParser.js';

/**
 * Tool call accumulator for streaming responses
 */
export interface ToolCallAccumulator {
  id?: string;
  name?: string;
  arguments: string;
}

/**
 * Parsed parts from Gemini content, categorized by type
 */
interface ParsedParts {
  textParts: string[];
  functionCalls: FunctionCall[];
  functionResponses: FunctionResponse[];
  mediaParts: Array<{
    type: 'image' | 'audio' | 'file';
    data: string;
    mimeType: string;
    fileUri?: string;
  }>;
}

/**
 * Converter class for transforming data between Gemini and OpenAI formats
 */
export class OpenAIContentConverter {
  private model: string;
  private streamingToolCallParser: StreamingToolCallParser =
    new StreamingToolCallParser();
  private xmlStyleToolCallParser: XmlStyleToolCallParser =
    new XmlStyleToolCallParser();
  /** Buffer for text content during streaming to handle cross-chunk tool calls */
  private streamingTextBuffer: string = '';
  /** Buffer for text content that has already been emitted during streaming */
  private streamingEmittedTextBuffer: string = '';
  /** Buffer for completed XML tool calls during streaming - only emit at finish_reason */
  private streamingXmlToolCalls: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }> = [];
  /** Buffer for cleaned text content from XML parsing during streaming */
  private streamingXmlTextContent: string = '';
  /** Queue of normalized tool call IDs grouped by original identifier for pairing with responses */
  private toolCallIdQueues: Map<string, string[]> = new Map();
  /** Tracks suffix counters for generated tool call IDs to guarantee uniqueness */
  private toolCallIdSuffixCounters: Map<string, number> = new Map();
  /** Set of tool call IDs that have already been assigned in the current conversion */
  private usedToolCallIds: Set<string> = new Set();
  /** Sequencer for auto-generated tool call bases when the source ID is missing */
  private autoToolCallIdCounter = 0;

  constructor(model: string) {
    this.model = model;
  }

  /**
   * Reset streaming tool calls parser for new stream processing
   * This should be called at the beginning of each stream to prevent
   * data pollution from previous incomplete streams
   */
  resetStreamingToolCalls(): void {
    this.streamingToolCallParser.reset();
    this.xmlStyleToolCallParser.reset();
    this.streamingTextBuffer = '';
    this.streamingEmittedTextBuffer = '';
    this.streamingXmlToolCalls = [];
    this.streamingXmlTextContent = '';
    this.resetToolCallIdState();
  }

  private resetToolCallIdState(): void {
    this.toolCallIdQueues.clear();
    this.toolCallIdSuffixCounters.clear();
    this.usedToolCallIds.clear();
    this.autoToolCallIdCounter = 0;
  }

  /**
   * Convert Gemini tool parameters to OpenAI JSON Schema format
   */
  convertGeminiToolParametersToOpenAI(
    parameters: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!parameters || typeof parameters !== 'object') {
      return parameters;
    }

    const converted = JSON.parse(JSON.stringify(parameters));

    const convertTypes = (obj: unknown): unknown => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(convertTypes);
      }

      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (key === 'type' && typeof value === 'string') {
          // Convert Gemini types to OpenAI JSON Schema types
          const lowerValue = value.toLowerCase();
          if (lowerValue === 'integer') {
            result[key] = 'integer';
          } else if (lowerValue === 'number') {
            result[key] = 'number';
          } else {
            result[key] = lowerValue;
          }
        } else if (
          key === 'minimum' ||
          key === 'maximum' ||
          key === 'multipleOf'
        ) {
          // Ensure numeric constraints are actual numbers, not strings
          if (typeof value === 'string' && !isNaN(Number(value))) {
            result[key] = Number(value);
          } else {
            result[key] = value;
          }
        } else if (
          key === 'minLength' ||
          key === 'maxLength' ||
          key === 'minItems' ||
          key === 'maxItems'
        ) {
          // Ensure length constraints are integers, not strings
          if (typeof value === 'string' && !isNaN(Number(value))) {
            result[key] = parseInt(value, 10);
          } else {
            result[key] = value;
          }
        } else if (typeof value === 'object') {
          result[key] = convertTypes(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };

    return convertTypes(converted) as Record<string, unknown> | undefined;
  }

  /**
   * Convert Gemini tools to OpenAI format for API compatibility.
   * Handles both Gemini tools (using 'parameters' field) and MCP tools (using 'parametersJsonSchema' field).
   */
  async convertGeminiToolsToOpenAI(
    geminiTools: ToolListUnion,
  ): Promise<OpenAI.Chat.ChatCompletionTool[]> {
    const openAITools: OpenAI.Chat.ChatCompletionTool[] = [];

    for (const tool of geminiTools) {
      let actualTool: Tool;

      // Handle CallableTool vs Tool
      if ('tool' in tool) {
        // This is a CallableTool
        actualTool = await (tool as CallableTool).tool();
      } else {
        // This is already a Tool
        actualTool = tool as Tool;
      }

      if (actualTool.functionDeclarations) {
        for (const func of actualTool.functionDeclarations) {
          if (func.name && func.description) {
            let parameters: Record<string, unknown> | undefined;

            // Handle both Gemini tools (parameters) and MCP tools (parametersJsonSchema)
            if (func.parametersJsonSchema) {
              // MCP tool format - use parametersJsonSchema directly
              if (func.parametersJsonSchema) {
                // Create a shallow copy to avoid mutating the original object
                const paramsCopy = {
                  ...(func.parametersJsonSchema as Record<string, unknown>),
                };
                parameters = paramsCopy;
              }
            } else if (func.parameters) {
              // Gemini tool format - convert parameters to OpenAI format
              parameters = this.convertGeminiToolParametersToOpenAI(
                func.parameters as Record<string, unknown>,
              );
            }

            openAITools.push({
              type: 'function',
              function: {
                name: func.name,
                description: func.description,
                parameters,
              },
            });
          }
        }
      }
    }

    return openAITools;
  }

  /**
   * Convert Gemini request to OpenAI message format
   */
  convertGeminiRequestToOpenAI(
    request: GenerateContentParameters,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    this.resetToolCallIdState();

    // Handle system instruction from config
    this.addSystemInstructionMessage(request, messages);

    // Handle contents
    this.processContents(request.contents, messages);

    // Clean up orphaned tool calls and merge consecutive assistant messages
    const cleanedMessages = this.cleanOrphanedToolCalls(messages);
    const mergedMessages =
      this.mergeConsecutiveAssistantMessages(cleanedMessages);

    return mergedMessages;
  }

  /**
   * Extract and add system instruction message from request config
   */
  private addSystemInstructionMessage(
    request: GenerateContentParameters,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (!request.config?.systemInstruction) return;

    const systemText = this.extractTextFromContentUnion(
      request.config.systemInstruction,
    );

    if (systemText) {
      messages.push({
        role: 'system' as const,
        content: systemText,
      });
    }
  }

  /**
   * Process contents and convert to OpenAI messages
   */
  private processContents(
    contents: ContentListUnion,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (Array.isArray(contents)) {
      for (const content of contents) {
        // Defensive check: if content is a bare array of Parts without role, 
        // it's malformed - this is likely tool responses that should have been wrapped properly
        if (Array.isArray(content)) {
          console.warn('[OpenAIContentConverter] Detected bare Part[] array in conversation history - processing as parts without role wrapper');
          // Check if these are function responses (tool results)
          const hasFunctionResponse = content.some(part => 
            typeof part === 'object' && part !== null && 'functionResponse' in part
          );
          
          if (hasFunctionResponse) {
            // Process as a temporary user content to extract tool messages
            this.processContent({
              role: 'user',
              parts: content
            } as Content, messages);
          } else {
            // For other types of parts, wrap as user message
            this.processContent({
              role: 'user',
              parts: content
            } as Content, messages);
          }
        } else {
          this.processContent(content, messages);
        }
      }
    } else if (contents) {
      this.processContent(contents, messages);
    }
  }

  /**
   * Process a single content item and convert to OpenAI message(s)
   */
  private processContent(
    content: ContentUnion | PartUnion,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): void {
    if (typeof content === 'string') {
      messages.push({ role: 'user' as const, content });
      return;
    }

    // Handle case where content is an array of Parts (malformed conversation history)
    if (Array.isArray(content)) {
      // Convert PartUnion[] to Part[] by filtering out strings and handling them
      const parts: Part[] = [];
      for (const part of content) {
        if (typeof part === 'string') {
          parts.push({ text: part });
        } else {
          parts.push(part);
        }
      }
      
      const parsedParts = this.parseParts(parts);
      
      // Handle function responses (tool results) first
      if (parsedParts.functionResponses.length > 0) {
        for (const funcResponse of parsedParts.functionResponses) {
          messages.push({
            role: 'tool' as const,
            tool_call_id: this.consumeToolCallId(funcResponse.id),
            content:
              typeof funcResponse.response === 'string'
                ? funcResponse.response
                : JSON.stringify(funcResponse.response),
          });
        }
      }
      return;
    }

    if (!this.isContentObject(content)) return;

    const parsedParts = this.parseParts(content.parts || []);

    // Handle function responses (tool results) first
    if (parsedParts.functionResponses.length > 0) {
      for (const funcResponse of parsedParts.functionResponses) {
        messages.push({
          role: 'tool' as const,
          tool_call_id: this.consumeToolCallId(funcResponse.id),
          content:
            typeof funcResponse.response === 'string'
              ? funcResponse.response
              : JSON.stringify(funcResponse.response),
        });
      }
      return;
    }

    // Handle model messages with function calls
    if (content.role === 'model' && parsedParts.functionCalls.length > 0) {
      const toolCalls = parsedParts.functionCalls.map((fc, index) => ({
        id: this.assignToolCallId(fc.id),
        type: 'function' as const,
        function: {
          name: fc.name || '',
          arguments: JSON.stringify(fc.args || {}),
        },
      }));

      const dedupedTextParts = this.deduplicateSequentialStrings(
        parsedParts.textParts,
      );

      // For OpenAI-compatible APIs that don't support null content with tool calls,
      // use empty string instead of null when there are tool calls present
      const contentText = dedupedTextParts.join('');
      
      messages.push({
        role: 'assistant' as const,
        content: contentText || '',
        tool_calls: toolCalls,
      });
      return;
    }

    // Handle regular messages with multimodal content
    const role = content.role === 'model' ? 'assistant' : 'user';
    const openAIMessage = this.createMultimodalMessage(role, parsedParts);

    if (openAIMessage) {
      messages.push(openAIMessage);
    }
  }

  /**
   * Parse Gemini parts into categorized components
   */
  private parseParts(parts: Part[]): ParsedParts {
    const textParts: string[] = [];
    const functionCalls: FunctionCall[] = [];
    const functionResponses: FunctionResponse[] = [];
    const mediaParts: Array<{
      type: 'image' | 'audio' | 'file';
      data: string;
      mimeType: string;
      fileUri?: string;
    }> = [];

    for (const part of parts) {
      if (typeof part === 'string') {
        textParts.push(part);
      } else if ('text' in part && part.text) {
        textParts.push(part.text);
      } else if ('functionCall' in part && part.functionCall) {
        functionCalls.push(part.functionCall);
      } else if ('functionResponse' in part && part.functionResponse) {
        functionResponses.push(part.functionResponse);
      } else if ('inlineData' in part && part.inlineData) {
        const { data, mimeType } = part.inlineData;
        if (data && mimeType) {
          const mediaType = this.getMediaType(mimeType);
          mediaParts.push({ type: mediaType, data, mimeType });
        }
      } else if ('fileData' in part && part.fileData) {
        const { fileUri, mimeType } = part.fileData;
        if (fileUri && mimeType) {
          const mediaType = this.getMediaType(mimeType);
          mediaParts.push({
            type: mediaType,
            data: '',
            mimeType,
            fileUri,
          });
        }
      }
    }

    return { textParts, functionCalls, functionResponses, mediaParts };
  }

  /**
   * Determine media type from MIME type
   */
  private getMediaType(mimeType: string): 'image' | 'audio' | 'file' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'file';
  }

  /**
   * Create multimodal OpenAI message from parsed parts
   */
  private createMultimodalMessage(
    role: 'user' | 'assistant',
    parsedParts: Pick<ParsedParts, 'textParts' | 'mediaParts'>,
  ): OpenAI.Chat.ChatCompletionMessageParam | null {
    const { textParts, mediaParts } = parsedParts;
    const content = textParts.map((text) => ({ type: 'text' as const, text }));

    // If no media parts, return simple text message
    if (mediaParts.length === 0) {
      return content.length > 0 ? { role, content } : null;
    }

    // For assistant messages with media, convert to text only
    // since OpenAI assistant messages don't support media content arrays
    if (role === 'assistant') {
      return content.length > 0
        ? { role: 'assistant' as const, content }
        : null;
    }

    const contentArray: OpenAI.Chat.ChatCompletionContentPart[] = [...content];

    // Add media content
    for (const mediaPart of mediaParts) {
      if (mediaPart.type === 'image') {
        if (mediaPart.fileUri) {
          // For file URIs, use the URI directly
          contentArray.push({
            type: 'image_url' as const,
            image_url: { url: mediaPart.fileUri },
          });
        } else if (mediaPart.data) {
          // For inline data, create data URL
          const dataUrl = `data:${mediaPart.mimeType};base64,${mediaPart.data}`;
          contentArray.push({
            type: 'image_url' as const,
            image_url: { url: dataUrl },
          });
        }
      } else if (mediaPart.type === 'audio' && mediaPart.data) {
        // Convert audio format from MIME type
        const format = this.getAudioFormat(mediaPart.mimeType);
        if (format) {
          contentArray.push({
            type: 'input_audio' as const,
            input_audio: {
              data: mediaPart.data,
              format: format as 'wav' | 'mp3',
            },
          });
        }
      }
      // Note: File type is not directly supported in OpenAI's current API
      // Could be extended in the future or handled as text description
    }

    return contentArray.length > 0
      ? { role: 'user' as const, content: contentArray }
      : null;
  }

  private assignToolCallId(originalId?: string | null): string {
    const normalizedOriginal = this.normalizeToolCallId(originalId);
    const base = normalizedOriginal ?? this.generateAutoToolCallBase();
    const candidate = this.getUniqueToolCallId(base);
    const queueKey = this.getToolCallTrackingKey(originalId);
    const queue = this.toolCallIdQueues.get(queueKey) ?? [];
    queue.push(candidate);
    this.toolCallIdQueues.set(queueKey, queue);
    return candidate;
  }

  private consumeToolCallId(originalId?: string | null): string {
    const queueKey = this.getToolCallTrackingKey(originalId);
    const queue = this.toolCallIdQueues.get(queueKey);

    if (queue && queue.length > 0) {
      const id = queue.shift()!;
      if (queue.length === 0) {
        this.toolCallIdQueues.delete(queueKey);
      } else {
        this.toolCallIdQueues.set(queueKey, queue);
      }
      return id;
    }

    const normalizedOriginal = this.normalizeToolCallId(originalId);
    if (normalizedOriginal) {
      return this.getUniqueToolCallId(normalizedOriginal);
    }

    return this.getUniqueToolCallId('unmatched_tool_response');
  }

  private getUniqueToolCallId(base: string): string {
    let suffix = this.toolCallIdSuffixCounters.get(base) ?? 0;
    let candidate = suffix === 0 ? base : `${base}__${suffix}`;

    while (this.usedToolCallIds.has(candidate)) {
      suffix += 1;
      candidate = `${base}__${suffix}`;
    }

    this.toolCallIdSuffixCounters.set(base, suffix + 1);
    this.usedToolCallIds.add(candidate);
    return candidate;
  }

  private getToolCallTrackingKey(originalId?: string | null): string {
    const normalized = this.normalizeToolCallId(originalId);
    return normalized ?? '__undefined__';
  }

  private normalizeToolCallId(originalId?: string | null): string | undefined {
    if (originalId === undefined || originalId === null) {
      return undefined;
    }
    const trimmed = `${originalId}`.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private generateAutoToolCallBase(): string {
    const base = `auto_tool_call_${this.autoToolCallIdCounter}`;
    this.autoToolCallIdCounter += 1;
    return base;
  }

  /**
   * Remove exact duplicate strings that appear sequentially in an array while preserving order
   */
  private deduplicateSequentialStrings(values: string[]): string[] {
    const deduped: string[] = [];
    for (const value of values) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== value) {
        deduped.push(value);
      }
    }
    return deduped;
  }

  /**
   * Convert MIME type to OpenAI audio format
   */
  private getAudioFormat(mimeType: string): 'wav' | 'mp3' | null {
    if (mimeType.includes('wav')) return 'wav';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
    return null;
  }

  /**
   * Type guard to check if content is a valid Content object
   */
  private isContentObject(
    content: unknown,
  ): content is { role: string; parts: Part[] } {
    return (
      typeof content === 'object' &&
      content !== null &&
      'role' in content &&
      'parts' in content &&
      Array.isArray((content as Record<string, unknown>)['parts'])
    );
  }

  /**
   * Extract text content from various Gemini content union types
   */
  private extractTextFromContentUnion(contentUnion: unknown): string {
    if (typeof contentUnion === 'string') {
      return contentUnion;
    }

    if (Array.isArray(contentUnion)) {
      return contentUnion
        .map((item) => this.extractTextFromContentUnion(item))
        .filter(Boolean)
        .join('\n');
    }

    if (typeof contentUnion === 'object' && contentUnion !== null) {
      if ('parts' in contentUnion) {
        const content = contentUnion as Content;
        return (
          content.parts
            ?.map((part: Part) => {
              if (typeof part === 'string') return part;
              if ('text' in part) return part.text || '';
              return '';
            })
            .filter(Boolean)
            .join('\n') || ''
        );
      }
    }

    return '';
  }

  /**
   * Convert OpenAI response to Gemini format
   */
  convertOpenAIResponseToGemini(
    openaiResponse: OpenAI.Chat.ChatCompletion,
  ): GenerateContentResponse {
    const choice = openaiResponse.choices[0];
    const response = new GenerateContentResponse();

    const parts: Part[] = [];

    // Handle text content
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Handle tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.function) {
          let args: Record<string, unknown> = {};
          if (toolCall.function.arguments) {
            args = safeJsonParse(toolCall.function.arguments, {});
          }

          parts.push({
            functionCall: {
              id: toolCall.id,
              name: toolCall.function.name,
              args,
            },
          });
        }
      }
    }

    response.responseId = openaiResponse.id;
    response.createTime = openaiResponse.created
      ? openaiResponse.created.toString()
      : new Date().getTime().toString();

    response.candidates = [
      {
        content: {
          parts,
          role: 'model' as const,
        },
        finishReason: this.mapOpenAIFinishReasonToGemini(
          choice.finish_reason || 'stop',
        ),
        index: 0,
        safetyRatings: [],
      },
    ];

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // Add usage metadata if available
    if (openaiResponse.usage) {
      const usage = openaiResponse.usage;

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;

      // If we only have total tokens but no breakdown, estimate the split
      // Typically input is ~70% and output is ~30% for most conversations
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // Estimate: assume 70% input, 30% output
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
        cachedContentTokenCount: cachedTokens,
      };
    }

    return response;
  }

  /**
   * Convert OpenAI stream chunk to Gemini format
   */
  convertOpenAIChunkToGemini(
    chunk: OpenAI.Chat.ChatCompletionChunk,
  ): GenerateContentResponse {
    const choice = chunk.choices?.[0];
    const response = new GenerateContentResponse();

    if (choice) {
      const parts: Part[] = [];

      // Handle text content with buffering to prevent tool call leakage
      if (choice.delta?.content) {
        if (typeof choice.delta.content === 'string') {
          // Add content to buffer for later processing
          this.streamingTextBuffer += choice.delta.content;
          
          // Try to process content through XML parser to handle streaming
          const xmlResult = this.xmlStyleToolCallParser.addChunk(choice.delta.content);
          
          if (xmlResult.complete && xmlResult.toolCalls) {
            // XML tool call is complete, buffer it until finish_reason
            this.streamingXmlToolCalls.push(...xmlResult.toolCalls);
            if (xmlResult.textContent) {
              this.streamingXmlTextContent += xmlResult.textContent;
            }
            // Clear the buffer since we've processed and buffered the content
            this.streamingTextBuffer = '';
          } else if (xmlResult.error) {
            // Log XML parsing error for debugging but continue processing
            console.warn('XML tool call parsing error:', xmlResult.error);
            
            // Reset the XML parser to clear any corrupted state
            this.xmlStyleToolCallParser.reset();
            
            // Check if buffered content contains tool call markers (possible cross-chunk)
            if (XmlStyleToolCallParser.containsXmlToolCallMarkers(this.streamingTextBuffer)) {
              // Don't emit buffered text since it likely contains tool call markers
              // Keep buffering until stream completes
            } else {
              // Safe to emit the current content
              parts.push({ text: choice.delta.content });
              this.streamingEmittedTextBuffer += choice.delta.content;
            }
          } else {
            // XML parsing not complete yet
            // Be conservative: if we ever detect tool call markers in the buffer, 
            // don't emit any text until the stream completes to prevent cross-chunk leakage
            if (XmlStyleToolCallParser.containsXmlToolCallMarkers(this.streamingTextBuffer)) {
              // Buffer contains tool call markers - suppress all text emission until stream completes
              // This prevents the cross-chunk tool call leakage issue
              // Don't add text to parts - keep buffering until stream completes
            } else {
              // No tool call markers detected anywhere, safe to stream this chunk
              parts.push({ text: choice.delta.content });
              this.streamingEmittedTextBuffer += choice.delta.content;
            }
          }
        }
      }

      // Handle tool calls using the streaming parser
      if (choice.delta?.tool_calls) {
        for (const toolCall of choice.delta.tool_calls) {
          const index = toolCall.index ?? 0;

          // Process the tool call chunk through the streaming parser
          if (toolCall.function?.arguments) {
            this.streamingToolCallParser.addChunk(
              index,
              toolCall.function.arguments,
              toolCall.id,
              toolCall.function.name,
            );
          } else {
            // Handle metadata-only chunks (id and/or name without arguments)
            this.streamingToolCallParser.addChunk(
              index,
              '', // Empty chunk for metadata-only updates
              toolCall.id,
              toolCall.function?.name,
            );
          }
        }
      }

      // Only emit function calls when streaming is complete (finish_reason is present)
      if (choice.finish_reason) {
        // Handle JSON-style tool calls (OpenAI format)
        const completedToolCalls =
          this.streamingToolCallParser.getCompletedToolCalls();

        for (const toolCall of completedToolCalls) {
          if (toolCall.name) {
            parts.push({
              functionCall: {
                id:
                  toolCall.id ||
                  `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                name: toolCall.name,
                args: toolCall.args,
              },
            });
          }
        }

        // Handle buffered XML-style tool calls (completed during streaming)
        for (const toolCall of this.streamingXmlToolCalls) {
          parts.push({
            functionCall: {
              id: toolCall.id || `xml_call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: toolCall.name,
              args: toolCall.args,
            },
          });
        }

        // Handle XML-style tool calls (if any remaining in parser)
        const xmlCompletedToolCalls = this.xmlStyleToolCallParser.getCompletedToolCalls();
        for (const toolCall of xmlCompletedToolCalls) {
          parts.push({
            functionCall: {
              id: toolCall.id || `xml_call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: toolCall.name,
              args: toolCall.args,
            },
          });
        }

        // BUGFIX: Add buffered XML text content (already cleaned by parser to remove tool call markers)
        // The parser extracts ALL text from chunks it processed, including text that may have been
        // emitted before tool call markers were detected. To avoid duplication, only emit the
        // additional text that wasn't already streamed.
        if (this.streamingXmlTextContent.trim()) {
          // If some text was already emitted before tool markers appeared, XML text includes it
          // Only emit if we haven't already emitted this text or if there's additional text
          if (this.streamingEmittedTextBuffer.length === 0) {
            // No text was emitted yet, emit all XML text
            parts.push({ text: this.streamingXmlTextContent });
          } else if (this.streamingXmlTextContent.startsWith(this.streamingEmittedTextBuffer)) {
            // XML text includes the already-emitted text, only emit the additional part
            const additionalText = this.streamingXmlTextContent.slice(this.streamingEmittedTextBuffer.length);
            if (additionalText.trim()) {
              parts.push({ text: additionalText });
            }
          } else {
            // XML text is completely different (shouldn't happen, but handle it)
            parts.push({ text: this.streamingXmlTextContent });
          }
        }

        // Process any remaining buffered text content that hasn't been emitted yet
        // This handles cases where text contains tool call markers but XML parsing didn't complete
        const unemittedTextBuffer = this.streamingTextBuffer.slice(this.streamingEmittedTextBuffer.length);
        if (unemittedTextBuffer.trim()) {
          // Try one final processing of the unemitted buffered content
          const tempParser = new XmlStyleToolCallParser();
          const finalResult = tempParser.addChunk(unemittedTextBuffer);
          
          if (finalResult.complete && finalResult.textContent) {
            // Use the cleaned text content with tool calls removed
            parts.push({ text: finalResult.textContent });
          } else if (finalResult.toolCalls && finalResult.toolCalls.length > 0) {
            // Found additional tool calls in the buffer
            for (const toolCall of finalResult.toolCalls) {
              parts.push({
                functionCall: {
                  id: toolCall.id || `final_xml_call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                  name: toolCall.name,
                  args: toolCall.args,
                },
              });
            }
            // Add cleaned text if available
            if (finalResult.textContent) {
              parts.push({ text: finalResult.textContent });
            }
          } else if (!XmlStyleToolCallParser.containsXmlToolCallMarkers(unemittedTextBuffer)) {
            // No tool call markers found, safe to emit as regular text
            parts.push({ text: unemittedTextBuffer });
          }
          // If buffer contains tool call markers but parsing failed, we don't emit it
        }

        // Clear both parsers and buffers for the next stream
        this.streamingToolCallParser.reset();
        this.xmlStyleToolCallParser.reset();
        this.streamingTextBuffer = '';
        this.streamingEmittedTextBuffer = '';
        this.streamingXmlToolCalls = [];
        this.streamingXmlTextContent = '';
      }

      // Only include finishReason key if finish_reason is present
      const candidate: Candidate = {
        content: {
          parts,
          role: 'model' as const,
        },
        index: 0,
        safetyRatings: [],
      };
      if (choice.finish_reason) {
        candidate.finishReason = this.mapOpenAIFinishReasonToGemini(
          choice.finish_reason,
        );
      }
      response.candidates = [candidate];
    } else {
      response.candidates = [];
    }

    response.responseId = chunk.id;
    response.createTime = chunk.created
      ? chunk.created.toString()
      : new Date().getTime().toString();

    response.modelVersion = this.model;
    response.promptFeedback = { safetyRatings: [] };

    // Add usage metadata if available in the chunk
    if (chunk.usage) {
      const usage = chunk.usage;

      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || 0;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;

      // If we only have total tokens but no breakdown, estimate the split
      // Typically input is ~70% and output is ~30% for most conversations
      let finalPromptTokens = promptTokens;
      let finalCompletionTokens = completionTokens;

      if (totalTokens > 0 && promptTokens === 0 && completionTokens === 0) {
        // Estimate: assume 70% input, 30% output
        finalPromptTokens = Math.round(totalTokens * 0.7);
        finalCompletionTokens = Math.round(totalTokens * 0.3);
      }

      response.usageMetadata = {
        promptTokenCount: finalPromptTokens,
        candidatesTokenCount: finalCompletionTokens,
        totalTokenCount: totalTokens,
        cachedContentTokenCount: cachedTokens,
      };
    }

    return response;
  }

  /**
   * Convert Gemini response format to OpenAI chat completion format for logging
   */
  convertGeminiResponseToOpenAI(
    response: GenerateContentResponse,
  ): OpenAI.Chat.ChatCompletion {
    const candidate = response.candidates?.[0];
    const content = candidate?.content;

    let messageContent: string | null = null;
    const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];

    if (content?.parts) {
      const textParts: string[] = [];

      for (const part of content.parts) {
        if ('text' in part && part.text) {
          textParts.push(part.text);
        } else if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: part.functionCall.id || `call_${toolCalls.length}`,
            type: 'function' as const,
            function: {
              name: part.functionCall.name || '',
              arguments: JSON.stringify(part.functionCall.args || {}),
            },
          });
        }
      }

      messageContent = textParts.join('').trimEnd();
    }

    const choice: OpenAI.Chat.ChatCompletion.Choice = {
      index: 0,
      message: {
        role: 'assistant',
        content: messageContent,
        refusal: null,
      },
      finish_reason: this.mapGeminiFinishReasonToOpenAI(
        candidate?.finishReason,
      ) as OpenAI.Chat.ChatCompletion.Choice['finish_reason'],
      logprobs: null,
    };

    if (toolCalls.length > 0) {
      choice.message.tool_calls = toolCalls;
    }

    const openaiResponse: OpenAI.Chat.ChatCompletion = {
      id: response.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: response.createTime
        ? Number(response.createTime)
        : Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [choice],
    };

    // Add usage metadata if available
    if (response.usageMetadata) {
      openaiResponse.usage = {
        prompt_tokens: response.usageMetadata.promptTokenCount || 0,
        completion_tokens: response.usageMetadata.candidatesTokenCount || 0,
        total_tokens: response.usageMetadata.totalTokenCount || 0,
      };

      if (response.usageMetadata.cachedContentTokenCount) {
        openaiResponse.usage.prompt_tokens_details = {
          cached_tokens: response.usageMetadata.cachedContentTokenCount,
        };
      }
    }

    return openaiResponse;
  }

  /**
   * Map OpenAI finish reasons to Gemini finish reasons
   */
  private mapOpenAIFinishReasonToGemini(
    openaiReason: string | null,
  ): FinishReason {
    if (!openaiReason) return FinishReason.FINISH_REASON_UNSPECIFIED;
    const mapping: Record<string, FinishReason> = {
      stop: FinishReason.STOP,
      length: FinishReason.MAX_TOKENS,
      content_filter: FinishReason.SAFETY,
      function_call: FinishReason.STOP,
      tool_calls: FinishReason.STOP,
    };
    return mapping[openaiReason] || FinishReason.FINISH_REASON_UNSPECIFIED;
  }

  /**
   * Map Gemini finish reasons to OpenAI finish reasons
   */
  private mapGeminiFinishReasonToOpenAI(geminiReason?: unknown): string {
    if (!geminiReason) return 'stop';

    switch (geminiReason) {
      case 'STOP':
      case 1: // FinishReason.STOP
        return 'stop';
      case 'MAX_TOKENS':
      case 2: // FinishReason.MAX_TOKENS
        return 'length';
      case 'SAFETY':
      case 3: // FinishReason.SAFETY
        return 'content_filter';
      case 'RECITATION':
      case 4: // FinishReason.RECITATION
        return 'content_filter';
      case 'OTHER':
      case 5: // FinishReason.OTHER
        return 'stop';
      default:
        return 'stop';
    }
  }

  /**
   * Clean up orphaned tool calls from message history to prevent OpenAI API errors
   */
  private cleanOrphanedToolCalls(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const cleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const toolCallIds = new Set<string>();
    const toolResponseIds = new Set<string>();

    // First pass: collect all tool call IDs and tool response IDs
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            toolCallIds.add(toolCall.id);
          }
        }
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        toolResponseIds.add(message.tool_call_id);
      }
    }

    // Second pass: filter out orphaned messages
    for (const message of messages) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        // Filter out tool calls that don't have corresponding responses
        const validToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && toolResponseIds.has(toolCall.id),
        );

        if (validToolCalls.length > 0) {
          // Keep the message but only with valid tool calls
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = validToolCalls;
          cleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          // Keep the message if it has text content, but remove tool calls
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          cleaned.push(cleanedMessage);
        }
        // If no valid tool calls and no content, skip the message entirely
      } else if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        // Only keep tool responses that have corresponding tool calls
        if (toolCallIds.has(message.tool_call_id)) {
          cleaned.push(message);
        }
      } else {
        // Keep all other messages as-is
        cleaned.push(message);
      }
    }

    // Final validation: ensure every assistant message with tool_calls has corresponding tool responses
    const finalCleaned: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const finalToolCallIds = new Set<string>();

    // Collect all remaining tool call IDs
    for (const message of cleaned) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.id) {
            finalToolCallIds.add(toolCall.id);
          }
        }
      }
    }

    // Verify all tool calls have responses
    const finalToolResponseIds = new Set<string>();
    for (const message of cleaned) {
      if (
        message.role === 'tool' &&
        'tool_call_id' in message &&
        message.tool_call_id
      ) {
        finalToolResponseIds.add(message.tool_call_id);
      }
    }

    // Remove any remaining orphaned tool calls
    for (const message of cleaned) {
      if (
        message.role === 'assistant' &&
        'tool_calls' in message &&
        message.tool_calls
      ) {
        const finalValidToolCalls = message.tool_calls.filter(
          (toolCall) => toolCall.id && finalToolResponseIds.has(toolCall.id),
        );

        if (finalValidToolCalls.length > 0) {
          const cleanedMessage = { ...message };
          (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls = finalValidToolCalls;
          finalCleaned.push(cleanedMessage);
        } else if (
          typeof message.content === 'string' &&
          message.content.trim()
        ) {
          const cleanedMessage = { ...message };
          delete (
            cleanedMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).tool_calls;
          finalCleaned.push(cleanedMessage);
        }
      } else {
        finalCleaned.push(message);
      }
    }

    return finalCleaned;
  }

  /**
   * Merge consecutive assistant messages to combine split text and tool calls
   */
  private mergeConsecutiveAssistantMessages(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const merged: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    for (const message of messages) {
      if (message.role === 'assistant' && merged.length > 0) {
        const lastMessage = merged[merged.length - 1];

        // If the last message is also an assistant message, merge them
        if (lastMessage.role === 'assistant') {
          // Combine content
          const combinedContent = [
            typeof lastMessage.content === 'string' ? lastMessage.content : '',
            typeof message.content === 'string' ? message.content : '',
          ]
            .filter(Boolean)
            .join('');

          // Combine tool calls
          const lastToolCalls =
            'tool_calls' in lastMessage ? lastMessage.tool_calls || [] : [];
          const currentToolCalls =
            'tool_calls' in message ? message.tool_calls || [] : [];
          const combinedToolCalls = [...lastToolCalls, ...currentToolCalls];

          // Update the last message with combined data
          (
            lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
              content: string | null;
              tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
            }
          ).content = combinedContent || null;
          if (combinedToolCalls.length > 0) {
            (
              lastMessage as OpenAI.Chat.ChatCompletionMessageParam & {
                content: string | null;
                tool_calls?: OpenAI.Chat.ChatCompletionMessageToolCall[];
              }
            ).tool_calls = combinedToolCalls;
          }

          continue; // Skip adding the current message since it's been merged
        }
      }

      // Add the message as-is if no merging is needed
      merged.push(message);
    }

    return merged;
  }
}

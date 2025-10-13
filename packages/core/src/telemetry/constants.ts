/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export const SERVICE_NAME = 'kolosal-ai';

export const EVENT_USER_PROMPT = 'kolosal-ai.user_prompt';
export const EVENT_TOOL_CALL = 'kolosal-ai.tool_call';
export const EVENT_API_REQUEST = 'kolosal-ai.api_request';
export const EVENT_API_ERROR = 'kolosal-ai.api_error';
export const EVENT_API_RESPONSE = 'kolosal-ai.api_response';
export const EVENT_CLI_CONFIG = 'kolosal-ai.config';
export const EVENT_FLASH_FALLBACK = 'kolosal-ai.flash_fallback';
export const EVENT_NEXT_SPEAKER_CHECK = 'kolosal-ai.next_speaker_check';
export const EVENT_SLASH_COMMAND = 'kolosal-ai.slash_command';
export const EVENT_IDE_CONNECTION = 'kolosal-ai.ide_connection';
export const EVENT_CHAT_COMPRESSION = 'kolosal-ai.chat_compression';
export const EVENT_INVALID_CHUNK = 'kolosal-ai.chat.invalid_chunk';
export const EVENT_CONTENT_RETRY = 'kolosal-ai.chat.content_retry';
export const EVENT_CONTENT_RETRY_FAILURE =
  'kolosal-ai.chat.content_retry_failure';
export const EVENT_CONVERSATION_FINISHED = 'kolosal-ai.conversation_finished';
export const EVENT_MALFORMED_JSON_RESPONSE =
  'kolosal-ai.malformed_json_response';
export const EVENT_SUBAGENT_EXECUTION = 'kolosal-ai.subagent_execution';

export const METRIC_TOOL_CALL_COUNT = 'kolosal-ai.tool.call.count';
export const METRIC_TOOL_CALL_LATENCY = 'kolosal-ai.tool.call.latency';
export const METRIC_API_REQUEST_COUNT = 'kolosal-ai.api.request.count';
export const METRIC_API_REQUEST_LATENCY = 'kolosal-ai.api.request.latency';
export const METRIC_TOKEN_USAGE = 'kolosal-ai.token.usage';
export const METRIC_SESSION_COUNT = 'kolosal-ai.session.count';
export const METRIC_FILE_OPERATION_COUNT = 'kolosal-ai.file.operation.count';
export const METRIC_INVALID_CHUNK_COUNT = 'kolosal-ai.chat.invalid_chunk.count';
export const METRIC_CONTENT_RETRY_COUNT = 'kolosal-ai.chat.content_retry.count';
export const METRIC_CONTENT_RETRY_FAILURE_COUNT =
  'kolosal-ai.chat.content_retry_failure.count';
export const METRIC_SUBAGENT_EXECUTION_COUNT =
  'kolosal-ai.subagent.execution.count';

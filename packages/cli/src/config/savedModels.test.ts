/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  deriveOpenAIEnvConfig,
  findKolosalApiKey,
  getCurrentModelAuthType,
  mergeSavedModelEntries,
  upsertSavedModelEntry,
  type SavedModelEntry,
} from './savedModels.js';
import { AuthType } from '@kolosal-ai/kolosal-ai-core';

describe('savedModels helpers', () => {
  it('replaces oss-local entries irrespective of baseUrl differences', () => {
    const existing: SavedModelEntry[] = [
      {
        id: 'unsloth/Qwen3-1.7B',
        provider: 'oss-local',
        baseUrl: undefined,
      },
    ];

    const updated = upsertSavedModelEntry(existing, {
      id: 'unsloth/Qwen3-1.7B',
      provider: 'oss-local',
      baseUrl: 'http://localhost:8087/v1/',
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].baseUrl).toBe('http://localhost:8087/v1');
  });

  it('merges oss-local entries with different base URLs into one record', () => {
    const merged = mergeSavedModelEntries([
      [
        {
          id: 'unsloth/Qwen3-1.7B',
          provider: 'oss-local',
          baseUrl: undefined,
        },
      ],
      [
        {
          id: 'unsloth/Qwen3-1.7B',
          provider: 'oss-local',
          baseUrl: 'http://localhost:8087/v1/',
        },
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].baseUrl).toBe('http://localhost:8087/v1');
  });
});

describe('getCurrentModelAuthType', () => {
  it('matches runtimeModelId for Kolosal cloud models', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'kolosal-123',
        provider: 'openai-compatible',
        runtimeModelId: 'model-123',
      },
    ];

    expect(getCurrentModelAuthType('model-123', savedModels)).toBe(
      AuthType.USE_OPENAI,
    );
  });

  it('infers NO_AUTH for oss-local providers', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'meta/llama',
        provider: 'oss-local',
        runtimeModelId: 'kolosal-meta-llama',
      },
    ];

    expect(getCurrentModelAuthType('kolosal-meta-llama', savedModels)).toBe(
      AuthType.NO_AUTH,
    );
  });
});

describe('deriveOpenAIEnvConfig', () => {
  it('returns Kolosal env configuration with runtime model id', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'kolosal-abc',
        provider: 'openai-compatible',
        runtimeModelId: 'model-abc',
        baseUrl: 'https://api.kolosal.ai/v1',
        apiKey: 'kolosal-token',
      },
    ];

    expect(
      deriveOpenAIEnvConfig('model-abc', savedModels, {
        kolosalToken: 'kolosal-token',
      }),
    ).toEqual({
      apiKey: 'kolosal-token',
      baseUrl: 'https://api.kolosal.ai/v1',
      model: 'model-abc',
      isFromKolosal: true,
    });
  });

  it('falls back to defaults when entry not found', () => {
    expect(
      deriveOpenAIEnvConfig(undefined, [], {
        defaultBaseUrl: 'https://api.openai.com/v1',
        fallbackModel: 'gpt-4o-mini',
      }),
    ).toEqual({
      apiKey: undefined,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      isFromKolosal: false,
    });
  });

  it('prefers saved apiKey over Kolosal token when both exist', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'custom-model',
        provider: 'openai-compatible',
        runtimeModelId: 'custom-model',
        apiKey: 'explicit-key',
      },
    ];

    expect(
      deriveOpenAIEnvConfig('custom-model', savedModels, {
        kolosalToken: 'kolosal-token',
      }),
    ).toEqual({
      apiKey: 'explicit-key',
      baseUrl: undefined,
      model: 'custom-model',
      isFromKolosal: false,
    });
  });

  it('falls back to saved entry using fallback model name when current model undefined', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'kolosal-xyz',
        provider: 'openai-compatible',
        runtimeModelId: 'model-xyz',
        baseUrl: 'https://api.kolosal.ai/v1',
        apiKey: 'kolosal-token',
      },
    ];

    expect(
      deriveOpenAIEnvConfig(undefined, savedModels, {
        kolosalToken: 'kolosal-token',
        fallbackModel: 'model-xyz',
      }),
    ).toEqual({
      apiKey: 'kolosal-token',
      baseUrl: 'https://api.kolosal.ai/v1',
      model: 'model-xyz',
      isFromKolosal: true,
    });
  });

  it('matches saved entry by Kolosal token when names are missing', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'kolosal-aaa',
        provider: 'openai-compatible',
        baseUrl: 'https://api.kolosal.ai/v1',
        apiKey: 'kolosal-token',
      },
    ];

    expect(
      deriveOpenAIEnvConfig(undefined, savedModels, {
        kolosalToken: 'kolosal-token',
      }),
    ).toEqual({
      apiKey: 'kolosal-token',
      baseUrl: 'https://api.kolosal.ai/v1',
      model: 'kolosal-aaa',
      isFromKolosal: true,
    });
  });
});

describe('findKolosalApiKey', () => {
  const kolosalBase = 'https://api.kolosal.ai/v1';

  it('returns apiKey from saved Kolosal entry', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'kolosal-123',
        provider: 'openai-compatible',
        baseUrl: kolosalBase,
        apiKey: 'saved-key',
      },
    ];

    expect(findKolosalApiKey(savedModels, kolosalBase)).toBe('saved-key');
  });

  it('falls back to openai settings when baseUrl matches Kolosal', () => {
    expect(
      findKolosalApiKey(undefined, kolosalBase, {
        openaiApiKey: 'setting-key',
        openaiBaseUrl: `${kolosalBase}/`,
      }),
    ).toBe('setting-key');
  });

  it('falls back to environment variables when baseUrl matches Kolosal', () => {
    expect(
      findKolosalApiKey(undefined, kolosalBase, {
        envApiKey: 'env-key',
        envBaseUrl: kolosalBase,
      }),
    ).toBe('env-key');
  });

  it('returns undefined when baseUrl does not match Kolosal', () => {
    const savedModels: SavedModelEntry[] = [
      {
        id: 'other',
        provider: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'other-key',
      },
    ];

    expect(
      findKolosalApiKey(savedModels, kolosalBase, {
        openaiApiKey: 'setting-key',
        openaiBaseUrl: 'https://api.openai.com/v1',
        envApiKey: 'env-key',
        envBaseUrl: 'https://api.openai.com/v1',
      }),
    ).toBeUndefined();
  });
});

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ContentGenerator } from './contentGenerator.js';
import {
  createContentGenerator,
  AuthType,
  createContentGeneratorConfig,
} from './contentGenerator.js';
import type { Config } from '../config/config.js';

const mockConfig = {
  getCliVersion: vi.fn().mockReturnValue('1.0.0'),
} as unknown as Config;

describe('createContentGenerator', () => {
  it('should create an OpenAI content generator', async () => {
    // Mock the dynamic import
    const mockOpenAIGenerator = {} as unknown as ContentGenerator;
    const mockCreateOpenAIContentGenerator = vi.fn().mockResolvedValue(mockOpenAIGenerator);
    vi.doMock('./openaiContentGenerator/index.js', () => ({
      createOpenAIContentGenerator: mockCreateOpenAIContentGenerator,
    }));

    const generator = await createContentGenerator(
      {
        model: 'test-model',
        authType: AuthType.USE_OPENAI,
        apiKey: 'test-openai-key',
      },
      mockConfig,
    );
    
    expect(mockCreateOpenAIContentGenerator).toHaveBeenCalledWith(
      {
        model: 'test-model',
        authType: AuthType.USE_OPENAI,
        apiKey: 'test-openai-key',
      },
      mockConfig,
    );
    expect(generator).toBe(mockOpenAIGenerator);
  });
});

describe('createContentGeneratorConfig', () => {
  const mockConfig = {
    getModel: vi.fn().mockReturnValue('gpt-3.5-turbo'),
    setModel: vi.fn(),
    flashFallbackHandler: vi.fn(),
    getProxy: vi.fn().mockReturnValue(undefined),
    getEnableOpenAILogging: vi.fn().mockReturnValue(false),
    getSamplingParams: vi.fn().mockReturnValue(undefined),
    getContentGeneratorTimeout: vi.fn().mockReturnValue(undefined),
    getContentGeneratorMaxRetries: vi.fn().mockReturnValue(undefined),
    getContentGeneratorDisableCacheControl: vi.fn().mockReturnValue(undefined),
    getContentGeneratorSamplingParams: vi.fn().mockReturnValue(undefined),
    getCliVersion: vi.fn().mockReturnValue('1.0.0'),
  } as unknown as Config;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should configure model when OPENAI_MODEL is set', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'env-openai-key');
    vi.stubEnv('OPENAI_MODEL', 'gpt-4-turbo');
    const config = createContentGeneratorConfig(
      mockConfig,
      AuthType.USE_OPENAI,
    );
    expect(config.model).toBe('gpt-4-turbo');
    expect(config.apiKey).toBe('env-openai-key');
  });

  it('should throw error when OpenAI API key is missing', async () => {
    await expect(
      createContentGenerator(
        {
          model: 'test-model',
          authType: AuthType.USE_OPENAI,
          // No apiKey provided
        },
        mockConfig,
      ),
    ).rejects.toThrow('OpenAI API key is required');
  });

  it('should throw error for unsupported auth type', async () => {
    await expect(
      createContentGenerator(
        {
          model: 'test-model',
          authType: 'unsupported' as AuthType,
          apiKey: 'test-key',
        },
        mockConfig,
      ),
    ).rejects.toThrow('Error creating contentGenerator: Unsupported authType: unsupported');
  });
});

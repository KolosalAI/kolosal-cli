/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import { loadEnvironment } from './settings.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  
  if (authMethod === AuthType.USE_OPENAI) {
    if (!process.env['OPENAI_API_KEY']) {
      return 'OPENAI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!';
    }
    return null;
  }

  if (authMethod === AuthType.NO_AUTH) {
    // No validation needed for local models without authentication
    return null;
  }

  // Any other auth method is not supported
  return 'Invalid auth method selected.';
};

export const setOpenAIApiKey = (apiKey: string): void => {
  process.env['OPENAI_API_KEY'] = apiKey;
};

export const setOpenAIBaseUrl = (baseUrl: string): void => {
  process.env['OPENAI_BASE_URL'] = baseUrl;
};

export const setOpenAIModel = (model: string): void => {
  process.env['OPENAI_MODEL'] = model;
};

export const setKolosalOAuthToken = (token: string): void => {
  process.env['KOLOSAL_OAUTH_TOKEN'] = token;
};

export const getKolosalOAuthToken = (): string | undefined => {
  return process.env['KOLOSAL_OAUTH_TOKEN'];
};

export const clearKolosalOAuthToken = (): void => {
  delete process.env['KOLOSAL_OAUTH_TOKEN'];
};

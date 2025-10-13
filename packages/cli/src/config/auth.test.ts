/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import { vi } from 'vitest';
import { validateAuthMethod } from './auth.js';

vi.mock('./settings.js', () => ({
  loadEnvironment: vi.fn(),
}));

describe('validateAuthMethod', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('USE_OPENAI', () => {
    it('should return null if OPENAI_API_KEY is set', () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      expect(validateAuthMethod(AuthType.USE_OPENAI)).toBeNull();
    });

    it('should return an error message if OPENAI_API_KEY is not set', () => {
      expect(validateAuthMethod(AuthType.USE_OPENAI)).toBe(
        'OPENAI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!',
      );
    });
  });

  it('should return an error message for an invalid auth method', () => {
    expect(validateAuthMethod('invalid-method')).toBe(
      'Invalid auth method selected.',
    );
  });
});

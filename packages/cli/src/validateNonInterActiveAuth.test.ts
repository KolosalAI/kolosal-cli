/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
  type MockInstance,
} from 'vitest';
import {
  validateNonInteractiveAuth,
  type NonInteractiveConfig,
} from './validateNonInterActiveAuth.js';
import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import * as auth from './config/auth.js';

const NO_AUTH = 'no-auth' as AuthType;

describe('validateNonInterActiveAuth', () => {
  let originalEnvOpenAiApiKey: string | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: MockInstance<typeof process.exit>;
  let refreshAuthMock: MockedFunction<(authType: AuthType) => Promise<unknown>>;

  beforeEach(() => {
    originalEnvOpenAiApiKey = process.env['OPENAI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined) => {
        throw new Error(`process.exit(${String(code)}) called`);
      });
    refreshAuthMock = vi.fn().mockResolvedValue('refreshed');
  });

  afterEach(() => {
    if (originalEnvOpenAiApiKey !== undefined) {
      process.env['OPENAI_API_KEY'] = originalEnvOpenAiApiKey;
    } else {
      delete process.env['OPENAI_API_KEY'];
    }
    vi.restoreAllMocks();
  });

  it('falls back to NO_AUTH when no auth type is configured and no OPENAI_API_KEY set', async () => {
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };

    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
    );

  expect(refreshAuthMock).toHaveBeenCalledWith(NO_AUTH);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('uses USE_OPENAI if OPENAI_API_KEY is set', async () => {
    process.env['OPENAI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
    );
  expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_OPENAI);
  });

  it('uses USE_OPENAI if OPENAI_API_KEY is set', async () => {
    process.env['OPENAI_API_KEY'] = 'fake-openai-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
    );
  expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_OPENAI);
  });

  it('errors when an invalid auth type is provided (disabled)', async () => {
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    // validateAuthMethod will reject invalid auth types
    try {
      await validateNonInteractiveAuth(
        'KOLOSAL_LOCAL' as AuthType,
        undefined,
        nonInteractiveConfig,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid auth method selected.'),
    );
  });

  it('uses USE_OPENAI with environment variables (legacy test)', async () => {
    process.env['OPENAI_API_KEY'] = 'test-api-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      undefined,
      undefined,
      nonInteractiveConfig,
    );
  expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_OPENAI);
  });

  it('uses configuredAuthType if provided', async () => {
    // Set required env var for OpenAI
    process.env['OPENAI_API_KEY'] = 'fake-key';
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    await validateNonInteractiveAuth(
      AuthType.USE_OPENAI,
      undefined,
      nonInteractiveConfig,
    );
  expect(refreshAuthMock).toHaveBeenCalledWith(AuthType.USE_OPENAI);
  });

  it('exits if validateAuthMethod returns error', async () => {
    // Mock validateAuthMethod to return error
    vi.spyOn(auth, 'validateAuthMethod').mockReturnValue('Auth error!');
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };
    try {
      await validateNonInteractiveAuth(
        AuthType.USE_OPENAI,
        undefined,
        nonInteractiveConfig,
      );
      expect.fail('Should have exited');
    } catch (e) {
      expect((e as Error).message).toContain('process.exit(1) called');
    }
    expect(consoleErrorSpy).toHaveBeenCalledWith('Auth error!');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('skips validation if useExternalAuth is true', async () => {
    // Mock validateAuthMethod to return error to ensure it's not being called
    const validateAuthMethodSpy = vi
      .spyOn(auth, 'validateAuthMethod')
      .mockReturnValue('Auth error!');
    const nonInteractiveConfig: NonInteractiveConfig = {
      refreshAuth: refreshAuthMock,
    };

    // Even with an invalid auth type, it should not exit
    // because validation is skipped.
    await validateNonInteractiveAuth(
      'invalid-auth-type' as AuthType,
      true, // useExternalAuth = true
      nonInteractiveConfig,
    );

    expect(validateAuthMethodSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
    // We still expect refreshAuth to be called with the (invalid) type
    expect(refreshAuthMock).toHaveBeenCalledWith('invalid-auth-type');
  });
});

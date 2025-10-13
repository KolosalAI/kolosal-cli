/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import { validateAuthMethod } from './config/auth.js';

// Minimal surface for callers that only require refreshing auth.
export type NonInteractiveConfig = {
  refreshAuth: (authType: AuthType) => Promise<unknown>;
};

function getAuthTypeFromEnv(): AuthType {
  if (process.env['OPENAI_API_KEY']) {
    return AuthType.USE_OPENAI;
  }
  // Default to NO_AUTH if no API key is set (for local models)
  return AuthType.NO_AUTH;
}

export async function validateNonInteractiveAuth<T extends NonInteractiveConfig>(
  configuredAuthType: AuthType | undefined,
  useExternalAuth: boolean | undefined,
  nonInteractiveConfig: T,
): Promise<T> {
  const effectiveAuthType = configuredAuthType || getAuthTypeFromEnv();

  if (!useExternalAuth) {
    const err = validateAuthMethod(effectiveAuthType);
    if (err != null) {
      console.error(err);
      process.exit(1);
    }
  }

  await nonInteractiveConfig.refreshAuth(effectiveAuthType);
  return nonInteractiveConfig;
}

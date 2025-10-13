/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from '../core/contentGenerator.js';
import { AuthType } from '../core/contentGenerator.js';
import { getOauthClient } from './oauth2.js';
import { setupUser } from './setup.js';
import type { HttpOptions } from './server.js';
import { CodeAssistServer } from './server.js';
import type { Config } from '../config/config.js';

export async function createCodeAssistContentGenerator(
  httpOptions: HttpOptions,
  authType: AuthType,
  config: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  if (authType === AuthType.USE_OPENAI) {
    const authClient = await getOauthClient(authType, config);
    const userData = await setupUser(authClient);
    return new CodeAssistServer(
      authClient,
      userData.projectId,
      httpOptions,
      sessionId,
      userData.userTier,
    );
  }

  if (authType === AuthType.NO_AUTH) {
    throw new Error(
      'Code Assist requires authentication. Please use an OpenAI API key or authenticated account.',
    );
  }

  throw new Error(`Unsupported authType: ${authType}`);
}

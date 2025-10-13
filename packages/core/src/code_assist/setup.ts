/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


import type { OAuth2Client } from 'google-auth-library';
import { UserTierId } from './types.js';

export class ProjectIdRequiredError extends Error {
  constructor() {
    super(
      'This account requires project configuration. Please use OpenAI authentication instead.',
    );
  }
}

export interface UserData {
  projectId: string;
  userTier: UserTierId;
}

/**
 *
 * @param projectId the user's project id, if any
 * @returns the user's actual project id
 */
export async function setupUser(client: OAuth2Client): Promise<UserData> {
  // Google Cloud authentication is no longer supported
  throw new ProjectIdRequiredError();
}



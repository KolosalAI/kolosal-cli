/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:process';

const KOLOSAL_API_BASE = 'https://app.kolosal.ai';
const CLIENT_ID = 'kolosal-cli';

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user?: {
    id: string;
    email: string;
  };
}

export interface TokenErrorResponse {
  error: string;
  error_description: string;
}

/**
 * Request a device code from the OAuth server
 */
export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  try {
    const response = await fetch(`${KOLOSAL_API_BASE}/api/auth/device/code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID }),
    });

    if (response.status === 404) {
      throw new Error(
        'OAuth authentication is not yet available. The Kolosal Cloud authentication endpoints are currently under development. Please use "OpenAI Compatible API" option for now.',
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Failed to request device code: ${errorText || response.statusText}`);
    }

    return response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error: Unable to connect to Kolosal Cloud authentication service.');
  }
}

/**
 * Poll for the access token
 */
export async function pollForToken(
  deviceCode: string,
): Promise<TokenResponse | TokenErrorResponse> {
  try {
    const response = await fetch(`${KOLOSAL_API_BASE}/api/auth/device/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    if (!response.ok && response.status !== 400) {
      // 400 is expected for authorization_pending and other OAuth errors
      const errorText = await response.text().catch(() => response.statusText);
      return {
        error: 'server_error',
        error_description: `Server error: ${errorText || response.statusText}`,
      };
    }

    return response.json();
  } catch (error) {
    return {
      error: 'network_error',
      error_description: 'Network error: Unable to connect to Kolosal Cloud.',
    };
  }
}

/**
 * Validate an access token
 */
export async function validateToken(accessToken: string): Promise<{
  valid: boolean;
  user?: {
    id: string;
    email: string;
  };
}> {
  try {
    const response = await fetch(`${KOLOSAL_API_BASE}/api/auth/validate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      return { valid: false };
    }

    return response.json();
  } catch (error) {
    return { valid: false };
  }
}

export async function validateApiKey(apiKey: string): Promise<{
  valid: boolean;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
}> {
  try {
    const response = await fetch(`${KOLOSAL_API_BASE}/api/auth/validate-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { valid: false };
      }
      return { valid: false, error: `http-${response.status}` };
    }

    const result = await response
      .json()
      .catch(() => ({ valid: true as const }));

    if (typeof result?.valid === 'boolean') {
      return result;
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'network-error' };
  }
}

export interface KolosalCredentialValidationResult {
  valid: boolean;
  source: 'api-key' | 'token';
  user?: {
    id: string;
    email: string;
  };
  error?: string;
}

export async function validateKolosalCredential(
  credential: string,
  options: { preferApiKey?: boolean } = {},
): Promise<KolosalCredentialValidationResult> {
  const { preferApiKey = false } = options;
  const attempts: Array<'api-key' | 'token'> = preferApiKey
    ? ['api-key', 'token']
    : ['token', 'api-key'];

  let lastError: string | undefined;

  for (const source of attempts) {
    if (source === 'api-key') {
      const result = await validateApiKey(credential);
      if (result.valid) {
        return { valid: true, source, user: result.user };
      }
      if (result.error) {
        return { valid: false, source, error: result.error };
      }
      continue;
    }

    const tokenResult = await validateToken(credential);
    if (tokenResult.valid) {
      return { valid: true, source, user: tokenResult.user };
    }

    // validateToken does not currently surface error codes; remember that no
    // error was provided so we can fall back to the alternate strategy.
    lastError = undefined;
  }

  return {
    valid: false,
    source: attempts[attempts.length - 1],
    error: lastError,
  };
}

/**
 * Revoke an access token (logout)
 */
export async function revokeToken(accessToken: string): Promise<void> {
  try {
    await fetch(`${KOLOSAL_API_BASE}/api/auth/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    // Silently fail - token revocation is best-effort
  }
}

/**
 * Open a URL in the default browser
 */
export function openBrowser(url: string): void {
  try {
    const currentPlatform = platform;
    
    if (currentPlatform === 'darwin') {
      execSync(`open "${url}"`);
    } else if (currentPlatform === 'win32') {
      execSync(`start "" "${url}"`);
    } else {
      // Linux and others
      execSync(`xdg-open "${url}"`);
    }
  } catch (error) {
    // Silently fail - user can manually open the URL
  }
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

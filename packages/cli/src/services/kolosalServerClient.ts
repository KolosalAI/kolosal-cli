/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { getKolosalServerBaseUrl } from '../utils/modelIdentifiers.js';

export interface RegisterModelOptions {
  modelId: string;
  modelPath: string;
  baseUrl?: string;
  inferenceEngine?: string;
  modelType?: 'llm' | 'embedding';
  loadImmediately?: boolean;
  mainGpuId?: number;
}

export interface RegisterModelResult {
  status: 'created' | 'exists';
  message?: string;
}

function sanitizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export async function registerModelWithServer(
  options: RegisterModelOptions,
): Promise<RegisterModelResult> {
  const baseUrl = sanitizeBaseUrl(
    options.baseUrl ?? getKolosalServerBaseUrl(),
  );
  const endpoint = `${baseUrl}/models`;

  const payload = {
    model_id: options.modelId,
    model_path: options.modelPath,
    load_immediately: options.loadImmediately ?? true,
    main_gpu_id: options.mainGpuId ?? 0,
    model_type: options.modelType ?? 'llm',
    inference_engine: options.inferenceEngine ?? '',
  };

  let responseText: string | undefined;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    responseText = await response.text();
    let responseJson: unknown;
    try {
      responseJson = responseText ? JSON.parse(responseText) : undefined;
    } catch (error) {
      responseJson = undefined;
    }

    if (response.ok) {
      const message =
        typeof responseJson === 'object' && responseJson !== null
          ? (responseJson as Record<string, unknown>)['message']
          : undefined;
      return { status: 'created', message: typeof message === 'string' ? message : undefined };
    }

    const errorMessage = extractErrorMessage(response.status, responseJson, responseText);
    if (response.status === 409 || response.status === 400) {
      const normalized = errorMessage.toLowerCase();
      if (normalized.includes('already') && normalized.includes('exist')) {
        return { status: 'exists', message: errorMessage };
      }
    }

    throw new Error(
      `Kolosal Server responded with ${response.status} ${response.statusText}: ${errorMessage}`,
    );
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to register model with Kolosal Server at ${endpoint}: ${
          error.message
        }`,
        { cause: error },
      );
    }
    throw error;
  }
}

function extractErrorMessage(
  status: number,
  responseJson: unknown,
  fallbackText: string | undefined,
): string {
  if (typeof responseJson === 'object' && responseJson !== null) {
    const jsonRecord = responseJson as Record<string, unknown>;
    const directMessage = jsonRecord['message'];
    if (typeof directMessage === 'string' && directMessage.trim().length > 0) {
      return directMessage;
    }
    const errorObj = jsonRecord['error'];
    if (typeof errorObj === 'object' && errorObj !== null) {
      const message = (errorObj as Record<string, unknown>)['message'];
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
  }

  if (fallbackText && fallbackText.trim().length > 0) {
    return fallbackText.trim();
  }

  return `Unexpected error with status ${status}`;
}

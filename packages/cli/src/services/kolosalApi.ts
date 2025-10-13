/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const KOLOSAL_API_BASE = 'https://app.kolosal.ai';

export interface KolosalModel {
  id: string;
  name: string;
  pricing: {
    input: number;
    output: number;
    currency: string;
    unit: string;
  };
  contextSize: number;
  lastUpdated: string;
}

export interface KolosalModelsResponse {
  models: KolosalModel[];
}

/**
 * Fetch available models from Kolosal API
 */
export async function fetchKolosalModels(
  accessToken: string,
): Promise<KolosalModel[]> {
  try {
    const url = `${KOLOSAL_API_BASE}/api/models`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 404) {
      throw new Error(
        'Model list endpoint not found. The Kolosal Cloud model API (/api/models) is not yet available. Please contact support.',
      );
    }

    if (response.status === 401) {
      throw new Error('Unauthorized: Invalid or expired access token');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || `Failed to fetch models: ${response.statusText}`);
    }

    const data: KolosalModelsResponse = await response.json();
    
    // Validate response structure
    if (!data || !Array.isArray(data.models)) {
      // Log the actual response for debugging
      console.error('Invalid API response:', JSON.stringify(data, null, 2));
      throw new Error('Invalid response format: expected an object with a "models" array');
    }
    
    if (data.models.length === 0) {
      return [];
    }
    
    // Log the first model to see its structure (for debugging)
    if (data.models.length > 0) {
      console.log('API Response - First model:', JSON.stringify(data.models[0], null, 2));
    }
    
    // Filter out any invalid models - only check that it's an object
    // Allow models with any structure as long as they're objects
    const validModels = data.models.filter((model) => {
      return model && typeof model === 'object';
    });
    
    if (validModels.length === 0 && data.models.length > 0) {
      console.error('All models filtered out. First model:', JSON.stringify(data.models[0], null, 2));
      throw new Error('No valid models found in the response. Check console for details.');
    }
    
    return validModels;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Network error: Unable to fetch models from Kolosal Cloud');
  }
}

/**
 * Format price for display
 */
export function formatPrice(pricePerMTokens: number): string {
  return `$${pricePerMTokens.toFixed(2)}/M tokens`;
}

/**
 * Format context size for display
 */
export function formatContextSize(contextSize: number): string {
  return `${contextSize.toLocaleString()} tokens`;
}

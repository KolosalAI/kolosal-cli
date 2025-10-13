/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@kolosal-ai/kolosal-ai-core';

export type SavedModelProvider =
  | 'openai-compatible'
  | 'oss-local'
  | AuthType;

export type SavedModelDownloadStatus =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'error';

export interface SavedModelDownloadState {
  status: SavedModelDownloadStatus;
  bytesDownloaded?: number;
  totalBytes?: number;
  progress?: number;
  error?: string;
  localPath?: string;
  updatedAt: number;
  downloadId?: string;
  sourceModelId?: string;
  primaryFilename?: string;
}

export interface SavedModelEntry {
  id: string;
  provider: SavedModelProvider;
  label?: string;
  baseUrl?: string;
  authType?: AuthType;
  apiKey?: string;
  isVision?: boolean;
  runtimeModelId?: string;
  downloadState?: SavedModelDownloadState;
}

export interface OpenAIEnvConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  isFromKolosal?: boolean;
}

export interface OpenAIEnvDerivationOptions {
  defaultBaseUrl?: string;
  kolosalToken?: string;
  fallbackModel?: string;
}

export interface KolosalApiKeyOptions {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  envApiKey?: string;
  envBaseUrl?: string;
}

export function upsertSavedModelEntry(
  existing: SavedModelEntry[] | undefined,
  entry: SavedModelEntry,
): SavedModelEntry[] {
  const list = existing ?? [];
  const normalizedEntry = sanitizeEntry(entry);
  const keyToReplace = keyFor(normalizedEntry);
  const filtered = list.filter((item) => keyFor(item) !== keyToReplace);
  return [...filtered, normalizedEntry];
}

export function mergeSavedModelEntries(
  sources: Array<SavedModelEntry[] | undefined>,
): SavedModelEntry[] {
  const deduped = new Map<string, SavedModelEntry>();

  for (const source of sources) {
    if (!source) continue;
    for (const entry of source) {
      if (!entry?.id || !entry.provider) continue;
      const normalized = sanitizeEntry(entry);
      const key = keyFor(normalized);
      const existing = deduped.get(key);
      if (!existing || shouldReplace(existing, normalized)) {
        deduped.set(key, normalized);
      }
    }
  }

  return Array.from(deduped.values());
}

function sanitizeEntry(entry: SavedModelEntry): SavedModelEntry {
  const baseUrl = normalizeBaseUrl(entry.baseUrl);
  const id = entry.id.trim();
  return {
    ...entry,
    id,
    baseUrl,
  };
}

function normalizeBaseUrl(baseUrl?: string): string | undefined {
  if (!baseUrl) {
    return undefined;
  }
  return baseUrl.replace(/\/+$/, '');
}

function keyFor(entry: SavedModelEntry): string {
  const provider = entry.provider ?? '';
  const id = entry.id;
  if (provider === 'oss-local') {
    return `${provider}::${id}`;
  }
  return `${provider}::${id}::${entry.baseUrl ?? ''}`;
}

function shouldReplace(
  existing: SavedModelEntry,
  candidate: SavedModelEntry,
): boolean {
  return weight(candidate) > weight(existing);
}

function weight(entry: SavedModelEntry): number {
  let score = 0;
  if (entry.baseUrl) {
    score += 2;
  }
  if (entry.runtimeModelId) {
    score += 1;
  }
  if (entry.downloadState) {
    score += 1;
  }
  return score;
}

export function getCurrentModelAuthType(
  modelName: string | undefined,
  savedModels: SavedModelEntry[] | undefined,
): AuthType | undefined {
  if (!modelName || !savedModels) {
    return undefined;
  }
  const modelEntry = getSavedModelEntry(modelName, savedModels);

  if (!modelEntry) {
    return undefined;
  }

  if (modelEntry.authType) {
    return modelEntry.authType;
  }

  if (modelEntry.provider === AuthType.USE_OPENAI) {
    return AuthType.USE_OPENAI;
  }

  if (modelEntry.provider === AuthType.NO_AUTH) {
    return AuthType.NO_AUTH;
  }

  if (modelEntry.provider === 'openai-compatible') {
    return AuthType.USE_OPENAI;
  }

  if (modelEntry.provider === 'oss-local') {
    return AuthType.NO_AUTH;
  }

  return undefined;
}

export function getSavedModelEntry(
  modelName: string | undefined,
  savedModels: SavedModelEntry[] | undefined,
): SavedModelEntry | undefined {
  if (!modelName || !savedModels) {
    return undefined;
  }

  return savedModels.find(
    (entry) => entry.id === modelName || entry.runtimeModelId === modelName,
  );
}

export function deriveOpenAIEnvConfig(
  modelName: string | undefined,
  savedModels: SavedModelEntry[] | undefined,
  options: OpenAIEnvDerivationOptions = {},
): OpenAIEnvConfig {
  let entry = getSavedModelEntry(modelName, savedModels);

  if (!entry && options.fallbackModel) {
    entry = getSavedModelEntry(options.fallbackModel, savedModels);
  }

  if (!entry && options.kolosalToken && savedModels) {
    entry = savedModels.find(
      (candidate) =>
        candidate.provider === 'openai-compatible' &&
        candidate.apiKey === options.kolosalToken,
    );
  }

  const baseUrl = entry?.baseUrl ?? options.defaultBaseUrl;

  let apiKey = entry?.apiKey ?? undefined;
  let isFromKolosal = false;

  if (!apiKey && entry?.provider === 'openai-compatible') {
    apiKey = options.kolosalToken;
  }

  if (entry && apiKey && options.kolosalToken === apiKey) {
    isFromKolosal = entry.id.startsWith('kolosal-');
  }

  const model =
    entry?.runtimeModelId ??
    entry?.id ??
    modelName ??
    options.fallbackModel;

  return {
    apiKey,
    baseUrl,
    model,
    isFromKolosal,
  };
}

export function findKolosalApiKey(
  savedModels: SavedModelEntry[] | undefined,
  kolosalBaseUrl: string,
  options: KolosalApiKeyOptions = {},
): string | undefined {
  const normalizedKolosalBase = normalizeBaseUrl(kolosalBaseUrl);

  if (savedModels?.length) {
    const kolosalEntry = savedModels.find((entry) => {
      if (entry.provider !== 'openai-compatible') {
        return false;
      }
      const entryBase = normalizeBaseUrl(entry.baseUrl);
      return (
        entryBase === normalizedKolosalBase &&
        typeof entry.apiKey === 'string' &&
        entry.apiKey.trim().length > 0
      );
    });

    if (kolosalEntry?.apiKey) {
      return kolosalEntry.apiKey;
    }
  }

  const normalizedSettingBase = normalizeBaseUrl(options.openaiBaseUrl);
  if (
    options.openaiApiKey &&
    normalizedSettingBase === normalizedKolosalBase &&
    options.openaiApiKey.trim().length > 0
  ) {
    return options.openaiApiKey;
  }

  const normalizedEnvBase = normalizeBaseUrl(options.envBaseUrl);
  if (
    options.envApiKey &&
    normalizedEnvBase === normalizedKolosalBase &&
    options.envApiKey.trim().length > 0
  ) {
    return options.envApiKey;
  }

  return undefined;
}

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';

export const DEFAULT_KOLOSAL_SERVER_BASE_URL = 'http://localhost:8087/v1';

export function getKolosalServerBaseUrl(): string {
  const raw = process.env['KOLOSAL_SERVER_BASE_URL']?.trim();
  const base = raw && raw.length > 0 ? raw : DEFAULT_KOLOSAL_SERVER_BASE_URL;
  return base.replace(/\/+$/, '');
}

const MAX_MODEL_ID_LENGTH = 64;

export function deriveServerModelId(sourceId: string): string {
  const normalized = sourceId.trim();
  const hash = createHash('sha1').update(normalized).digest('hex').slice(0, 8);
  const sanitized = normalized
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  const base = sanitized.length > 0 ? sanitized : 'model';
  const maxBaseLength = Math.max(1, MAX_MODEL_ID_LENGTH - hash.length - 1);
  const truncatedBase = base.length > maxBaseLength
    ? base.slice(base.length - maxBaseLength)
    : base;

  let candidate = `${truncatedBase}_${hash}`;
  if (candidate.length > MAX_MODEL_ID_LENGTH) {
    candidate = candidate.slice(candidate.length - MAX_MODEL_ID_LENGTH);
  }
  return candidate;
}

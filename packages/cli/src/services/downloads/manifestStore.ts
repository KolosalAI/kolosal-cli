/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage } from '@kolosal-ai/kolosal-ai-core';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { ModelDownloadManifest } from './types.js';

const MANIFEST_FILENAME = 'model-downloads.json';

function getManifestPath(): string {
  const modelsDir = Storage.getGlobalModelsDir();
  fs.mkdirSync(modelsDir, { recursive: true });
  return path.join(modelsDir, MANIFEST_FILENAME);
}

export async function loadManifest(): Promise<ModelDownloadManifest> {
  const manifestPath = getManifestPath();
  try {
    const raw = await fsp.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ModelDownloadManifest;
    return parsed ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

export async function saveManifest(
  manifest: ModelDownloadManifest,
): Promise<void> {
  const manifestPath = getManifestPath();
  const tmpPath = `${manifestPath}.tmp`;
  const json = JSON.stringify(manifest, null, 2);
  await fsp.writeFile(tmpPath, json, 'utf8');
  await fsp.rename(tmpPath, manifestPath);
}

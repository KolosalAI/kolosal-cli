/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SavedModelDownloadStatus,
  SavedModelProvider,
} from '../../config/savedModels.js';

export interface ModelDownloadFile {
  filename: string;
  remoteUrl: string;
  localPath: string;
  tempPath: string;
  totalBytes?: number;
  downloadedBytes: number;
  etag?: string;
  checksumSha256?: string;
}

export interface ModelDownloadManifestEntry {
  id: string;
  modelId: string;
  displayName: string;
  provider: SavedModelProvider;
  destinationDir: string;
  status: SavedModelDownloadStatus;
  totalBytes?: number;
  downloadedBytes: number;
  files: ModelDownloadFile[];
  error?: string;
  updatedAt: number;
  resumeSupported: boolean;
}

export type ModelDownloadManifest = Record<string, ModelDownloadManifestEntry>;

export interface EnqueueDownloadOptions {
  modelId: string;
  displayName: string;
  provider: SavedModelProvider;
  primaryFilename: string;
  partFilenames: string[];
  destinationDir: string;
  token?: string;
}

export interface DownloadProgressEvent {
  id: string;
  modelId: string;
  status: SavedModelDownloadStatus;
  downloadedBytes: number;
  totalBytes?: number;
  percentage: number;
  error?: string;
}

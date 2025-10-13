/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import {
  createHfRequestHeaders,
  buildModelFileUrl,
} from '../huggingfaceApi.js';
import { loadManifest, saveManifest } from './manifestStore.js';
import type {
  DownloadProgressEvent,
  EnqueueDownloadOptions,
  ModelDownloadFile,
  ModelDownloadManifest,
  ModelDownloadManifestEntry,
} from './types.js';

const PERSIST_DEBOUNCE_MS = 500;
const RETRY_LIMIT = 3;

function createDownloadId(modelId: string, filename: string): string {
  return `${modelId}::${filename}`;
}

function toPercentage(downloaded: number, total?: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((downloaded / total) * 10000) / 100);
}

class ModelDownloadManager extends EventEmitter {
  private static instance: ModelDownloadManager | null = null;

  private manifest: ModelDownloadManifest = {};
  private activeDownloadId: string | null = null;
  private queue: string[] = [];
  private initialized = false;
  private paused = false;
  private persistTimer: NodeJS.Timeout | null = null;
  private pendingPersist = false;
  private runtimeTokens = new Map<string, string | undefined>();
  private abortController: AbortController | null = null;
  
  // Progress throttling properties
  private lastProgressEmit = new Map<string, number>();
  private readonly PROGRESS_THROTTLE_MS = 50; // Emit progress at most every 50ms

  private constructor() {
    super();
  }

  static getInstance(): ModelDownloadManager {
    if (!ModelDownloadManager.instance) {
      ModelDownloadManager.instance = new ModelDownloadManager();
    }
    return ModelDownloadManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.manifest = await loadManifest();
    this.initialized = true;
  }

  getEntries(): ModelDownloadManifest {
    return { ...this.manifest };
  }

  getEntry(id: string): ModelDownloadManifestEntry | undefined {
    return this.manifest[id];
  }

  enqueueDownload(options: EnqueueDownloadOptions): string {
    if (!this.initialized) {
      throw new Error('ModelDownloadManager not initialized. Call initialize() first.');
    }

    const id = createDownloadId(options.modelId, options.primaryFilename);
    const existing = this.manifest[id];
    const now = Date.now();

    const partFilenames = options.partFilenames.length
      ? options.partFilenames
      : [options.primaryFilename];

    const files: ModelDownloadFile[] = partFilenames.map((filename) => {
      const remoteUrl = buildModelFileUrl(options.modelId, filename);
      const localPath = path.join(options.destinationDir, filename);
      const tempPath = `${localPath}.part`;
      return {
        filename,
        remoteUrl,
        localPath,
        tempPath,
        totalBytes: existing?.files.find((f) => f.filename === filename)?.totalBytes,
        downloadedBytes:
          existing?.files.find((f) => f.filename === filename)?.downloadedBytes ?? 0,
        etag: existing?.files.find((f) => f.filename === filename)?.etag,
        checksumSha256:
          existing?.files.find((f) => f.filename === filename)?.checksumSha256,
      };
    });

    const totalBytes = files.reduce(
      (sum, file) => (file.totalBytes ? sum + file.totalBytes : sum),
      0,
    );
    const downloadedBytes = files.reduce((sum, file) => sum + file.downloadedBytes, 0);

    const entry: ModelDownloadManifestEntry = {
      id,
      modelId: options.modelId,
      displayName: options.displayName,
      provider: options.provider,
      destinationDir: options.destinationDir,
      status: 'queued',
      totalBytes: totalBytes || existing?.totalBytes,
      downloadedBytes,
      files,
      error: undefined,
      updatedAt: now,
      resumeSupported: true,
    };

    this.manifest[id] = entry;
    this.runtimeTokens.set(id, options.token);
    this.enqueueInternal(id);
    this.schedulePersist();
    this.emitProgress(entry);
    return id;
  }

  resumeDownload(id: string, token?: string): void {
    if (!this.initialized) return;
    const entry = this.manifest[id];
    if (!entry) return;

    if (entry.status === 'completed') {
      this.emitProgress(entry, true);
      return;
    }

    if (!this.queue.includes(id) && this.activeDownloadId !== id) {
      this.runtimeTokens.set(id, token);
      entry.status = entry.downloadedBytes > 0 ? 'paused' : 'queued';
      entry.error = undefined;
      entry.updatedAt = Date.now();
      this.enqueueInternal(id);
      this.schedulePersist();
      this.emitProgress(entry, true);
    } else {
      this.runtimeTokens.set(id, token);
    }
  }

  async pauseAll(): Promise<void> {
    this.paused = true;
    if (this.abortController) {
      this.abortController.abort();
    }

    if (this.activeDownloadId) {
      const entry = this.manifest[this.activeDownloadId];
      if (entry && entry.status !== 'completed' && entry.status !== 'error') {
        entry.status = 'paused';
        entry.updatedAt = Date.now();
        this.emitProgress(entry, true);
        await this.persistNow();
      }
    }
  }

  async resumeAll(): Promise<void> {
    this.paused = false;
    if (!this.activeDownloadId) {
      void this.processQueue();
    }
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persistNow();
  }

  private enqueueInternal(id: string): void {
    if (!this.queue.includes(id)) {
      this.queue.push(id);
      if (!this.paused) {
        void this.processQueue();
      }
    }
  }

  private async processQueue(): Promise<void> {
    if (this.paused) return;
    if (this.activeDownloadId) return;

    const nextId = this.queue.shift();
    if (!nextId) return;

    const entry = this.manifest[nextId];
    if (!entry) {
      void this.processQueue();
      return;
    }

    this.activeDownloadId = nextId;
    try {
      await this.downloadEntry(entry);
    } catch (error) {
      entry.status = this.paused ? 'paused' : 'error';
      entry.error = (error as Error).message;
      entry.updatedAt = Date.now();
      this.emitProgress(entry, true);
    } finally {
      this.activeDownloadId = null;
      this.schedulePersist();
      if (!this.paused) {
        void this.processQueue();
      }
    }
  }

  private async downloadEntry(entry: ModelDownloadManifestEntry): Promise<void> {
    entry.status = 'downloading';
    entry.error = undefined;
    entry.updatedAt = Date.now();
    this.emitProgress(entry, true);
    this.schedulePersist();

    for (const file of entry.files) {
      if (this.paused) {
        entry.status = 'paused';
        entry.updatedAt = Date.now();
        this.emitProgress(entry, true);
        this.schedulePersist();
        return;
      }

      await this.downloadFile(entry, file);
    }

    if (!this.paused) {
      entry.status = 'completed';
      entry.updatedAt = Date.now();
      entry.error = undefined;
      this.emitProgress(entry, true);
      this.schedulePersist();
    }
  }

  private async downloadFile(
    entry: ModelDownloadManifestEntry,
    file: ModelDownloadFile,
  ): Promise<void> {
    const token = this.runtimeTokens.get(entry.id);
    const headers = createHfRequestHeaders(token);

    // Ensure destination directories exist
    await fsp.mkdir(path.dirname(file.localPath), { recursive: true });

    let attempt = 0;
    let completed = false;

    while (!completed && attempt < RETRY_LIMIT) {
      attempt += 1;
      try {
        const downloadedBytes = await this.streamFile(entry, file, headers);
        file.downloadedBytes = downloadedBytes;
        entry.downloadedBytes = entry.files.reduce(
          (sum, current) => sum + current.downloadedBytes,
          0,
        );
        if (file.totalBytes && entry.files.every((f) => f.totalBytes)) {
          entry.totalBytes = entry.files.reduce(
            (sum, current) => sum + (current.totalBytes ?? 0),
            0,
          );
        }
        this.emitProgress(entry);
        this.schedulePersist();
        completed = true;
      } catch (error) {
        if (this.paused) {
          throw error;
        }
        if (attempt >= RETRY_LIMIT) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  private async streamFile(
    entry: ModelDownloadManifestEntry,
    file: ModelDownloadFile,
    headers: Headers,
  ): Promise<number> {
    const existingFinalSize = await getFileSize(file.localPath);
    if (existingFinalSize !== null) {
      if (!file.totalBytes || existingFinalSize >= file.totalBytes) {
        file.downloadedBytes = existingFinalSize;
        file.totalBytes = existingFinalSize;
        return existingFinalSize;
      }
    }

    let startAt = file.downloadedBytes ?? 0;
    const tempSize = await getFileSize(file.tempPath);
    if (tempSize !== null) {
      startAt = tempSize;
      file.downloadedBytes = tempSize;
    } else if (startAt > 0) {
      startAt = 0;
      file.downloadedBytes = 0;
    }

    const requestHeaders = new Headers(headers);
    if (startAt > 0) {
      requestHeaders.set('Range', `bytes=${startAt}-`);
    }

    const controller = new AbortController();
    this.abortController = controller;

    const response = await fetch(file.remoteUrl, {
      headers: requestHeaders,
      signal: controller.signal,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(
        `Download failed (${response.status} ${response.statusText}) for ${file.remoteUrl}`,
      );
    }

    if (!file.totalBytes) {
      const total = parseContentLength(response.headers, startAt);
      if (total) {
        file.totalBytes = total;
        // Update entry totalBytes immediately when we get file totalBytes
        entry.totalBytes = entry.files.reduce(
          (sum, current) => sum + (current.totalBytes ?? 0),
          0,
        );
        // Emit progress immediately so UI gets the updated totalBytes
        this.emitProgress(entry, true);
      }
    }

    if (!response.body) {
      throw new Error('Response body missing');
    }

    const webStream =
      response.body as unknown as NodeReadableStream<Uint8Array>;
    const nodeStream = Readable.fromWeb(webStream);
    await fsp.mkdir(path.dirname(file.tempPath), { recursive: true });
    const writeStream = fs.createWriteStream(file.tempPath, {
      flags: startAt > 0 ? 'a' : 'w',
    });

    let downloadedBytes = startAt;
    nodeStream.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      file.downloadedBytes = downloadedBytes;
      entry.downloadedBytes = entry.files.reduce(
        (sum, current) => sum + current.downloadedBytes,
        0,
      );
      this.emitProgress(entry);
    });

    try {
      await pipeline(nodeStream, writeStream);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error('Download aborted');
      }
      throw error;
    } finally {
      writeStream.close();
    }

    await fsp.rename(file.tempPath, file.localPath);
    file.downloadedBytes = downloadedBytes;

    return downloadedBytes;
  }

  private emitProgress(entry: ModelDownloadManifestEntry, force = false): void {
    const event: DownloadProgressEvent = {
      id: entry.id,
      modelId: entry.modelId,
      status: entry.status,
      downloadedBytes: entry.downloadedBytes,
      totalBytes: entry.totalBytes,
      percentage: toPercentage(entry.downloadedBytes, entry.totalBytes),
      error: entry.error,
    };

    // Always emit immediately for status changes (completed, error, etc.)
    if (force || entry.status !== 'downloading') {
      // Clean up any pending timer for this entry
      this.cleanupProgressTimer(entry.id);
      this.emit('progress', event);
      return;
    }

    // For downloading status, use simple time-based throttling
    const now = Date.now();
    const lastEmit = this.lastProgressEmit.get(entry.id) ?? 0;
    
    if (now - lastEmit >= this.PROGRESS_THROTTLE_MS) {
      // Emit immediately if enough time has passed
      this.lastProgressEmit.set(entry.id, now);
      this.emit('progress', event);
    }
    // If not enough time has passed, simply skip this emit (no setTimeout)
  }

  private cleanupProgressTimer(id: string): void {
    this.lastProgressEmit.delete(id);
  }

  private schedulePersist(): void {
    this.pendingPersist = true;
    if (this.persistTimer) return;

    this.persistTimer = setTimeout(async () => {
      this.persistTimer = null;
      if (!this.pendingPersist) {
        return;
      }
      this.pendingPersist = false;
      await this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private async persistNow(): Promise<void> {
    if (!this.initialized) return;
    await saveManifest(this.manifest);
  }
}

function parseContentLength(headers: Headers, startAt: number): number | undefined {
  const contentRange = headers.get('Content-Range');
  if (contentRange) {
    const match = contentRange.match(/\/([0-9]+)$/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  const contentLength = headers.get('Content-Length');
  if (contentLength) {
    const len = parseInt(contentLength, 10);
    if (!Number.isNaN(len)) {
      return len + startAt;
    }
  }

  return undefined;
}

async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isFile()) {
      return stat.size;
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export { ModelDownloadManager };

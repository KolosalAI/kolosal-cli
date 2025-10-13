/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

export type HFModel = { modelId: string };
export type HFSibling = { rfilename: string };
export type HFModelDetail = { siblings?: HFSibling[] };

const USER_AGENT = 'kolosal-cli/1.0 (+https://kolosal.ai)';

function setStdHeaders(headers: Headers, token?: string) {
  headers.set('User-Agent', USER_AGENT);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
}

export function createHfRequestHeaders(token?: string): Headers {
  const headers = new Headers();
  setStdHeaders(headers, token);
  return headers;
}

export function buildModelFileUrl(modelId: string, filename: string): string {
  const segments = modelId.split('/').map(encodeURIComponent).join('/');
  const encoded = filename.split('/').map(encodeURIComponent).join('/');
  return `https://huggingface.co/${segments}/resolve/main/${encoded}`;
}

export function buildModelsBaseUrl(query: string, limit = 20): string {
  const url = new URL('https://huggingface.co/api/models');
  url.searchParams.append('filter', 'text-generation');
  url.searchParams.append('filter', 'gguf');
  url.searchParams.set('sort', 'trendingScore');
  url.searchParams.set('full', 'false');
  url.searchParams.set('config', 'false');
  url.searchParams.set('limit', String(limit));
  if (query && query.trim()) url.searchParams.set('search', query.trim());
  return url.toString();
}

export function parseLinkNext(linkHeader: string | null): string | undefined {
  if (!linkHeader) return undefined;
  // Example: <https://...&cursor=abc>; rel="next", <...>; rel="prev"
  const parts = linkHeader.split(',');
  for (const part of parts) {
    const m = part.match(/<([^>]+)>;\s*rel="next"/);
    if (m) return m[1];
  }
  return undefined;
}

async function readErrorSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

export async function fetchModels(urlOrBase: string, token?: string): Promise<{ models: HFModel[]; nextUrl?: string }>{
  const url = urlOrBase;
  const headers = new Headers();
  setStdHeaders(headers, token);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await readErrorSnippet(res);
    throw new Error(`HF models request failed: ${res.status} ${res.statusText}${body ? `\n${body}` : ''}`);
  }
  const models = (await res.json()) as HFModel[];
  const nextUrl = parseLinkNext(res.headers.get('Link'));
  return { models, nextUrl };
}

export type GroupedFile = {
  displayName: string;  // The simplified name to show (e.g., "BF16/GLM-4.6-BF16.gguf")
  actualName: string;   // The actual first file (e.g., "BF16/GLM-4.6-BF16-00001-of-00015.gguf")
  partCount?: number;   // Number of parts if it's a multi-part file
  partFiles: string[];  // All physical files that compose the model (single element for non-partitioned)
  memoryEstimate?: string; // Human-readable memory estimate (e.g., "9.3 GB (Model: 7.2 GB + KV: 2.1 GB)")
};

type GGUFParams = {
  attentionHeads: number;
  kvHeads: number;
  hiddenLayers: number;
  hiddenSize: number;
};

/**
 * Groups multi-part GGUF files (e.g., "model-00001-of-00015.gguf") into single entries.
 * Returns the simplified display name and the actual first file to use.
 */
export function groupGGUFFiles(files: string[]): GroupedFile[] {
  // Pattern to match: name-00001-of-00015.gguf or name-00001-of-00015 (without .gguf)
  const multiPartPattern = /^(.+?)[-_](\d{5})-of-(\d{5})(\.gguf)?$/i;

  type MultiPartEntry = {
    displayName: string;
    totalParts: number;
    parts: Array<{ partNumber: number; file: string }>;
  };

  const multiPartGroups = new Map<string, MultiPartEntry>();
  const standalone: GroupedFile[] = [];

  for (const file of files) {
    const match = file.match(multiPartPattern);

    if (match) {
      const [, baseName, partNum, totalParts] = match;
      const partNumber = parseInt(partNum, 10);
      const total = parseInt(totalParts, 10);
      const key = baseName.toLowerCase();
      const entry = multiPartGroups.get(key) ?? {
        displayName: `${baseName}.gguf`,
        totalParts: total,
        parts: [],
      };

      entry.totalParts = Math.max(entry.totalParts, total);
      entry.parts.push({ partNumber, file });
      multiPartGroups.set(key, entry);
    } else {
      // Not a multi-part file, add as-is
      standalone.push({
        displayName: file,
        actualName: file,
        partFiles: [file],
      });
    }
  }

  const grouped: GroupedFile[] = [];

  for (const entry of multiPartGroups.values()) {
    const sortedParts = entry.parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber);
    if (sortedParts.length === 0) {
      continue;
    }

    const partFiles = sortedParts.map((p) => p.file);
    const actualName = sortedParts[0].file;

    grouped.push({
      displayName: entry.displayName,
      actualName,
      partCount: entry.totalParts || sortedParts.length,
      partFiles,
    });
  }

  const result = [...grouped, ...standalone];
  result.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return result;
}

export async function fetchModelFiles(modelId: string, token?: string): Promise<string[]> {
  const segments = modelId.split('/').map(encodeURIComponent).join('/');
  const url = `https://huggingface.co/api/models/${segments}?expand[]=siblings&full=false&config=false`;
  const headers = createHfRequestHeaders(token);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await readErrorSnippet(res);
    throw new Error(`HF model files failed: ${res.status} ${res.statusText}${body ? `\n${body}` : ''}`);
  }
  const detail = (await res.json()) as HFModelDetail;
  const files = (detail.siblings || []).map((s) => s.rfilename).filter((f) => f.toLowerCase().endsWith('.gguf'));
  return files;
}

// HTTP Range Reader for lazy chunk fetching
class RangeReader {
  private buf: Uint8Array = new Uint8Array(0);
  private bufStart = 0;
  private pos = 0;
  private eof = false;

  constructor(
    private url: string,
    private token?: string,
  ) {}

  private async fetchRange(start: number, endExclusive: number): Promise<Uint8Array> {
    const headers = new Headers();
    setStdHeaders(headers, this.token);
    headers.set('Range', `bytes=${start}-${endExclusive - 1}`);

    const res = await fetch(this.url, { headers });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Range request failed: ${res.status}`);
    }

    const data = new Uint8Array(await res.arrayBuffer());
    
    // Handle servers that return 200 OK instead of 206
    if (res.status === 200 && start > 0) {
      if (data.length <= start) return new Uint8Array(0);
      const actualEnd = Math.min(endExclusive, data.length);
      return data.slice(start, actualEnd);
    }

    return data;
  }

  private async ensure(n: number): Promise<void> {
    while (this.bufStart + this.buf.length - this.pos < n && !this.eof) {
      // Compact buffer
      if (this.pos > this.bufStart) {
        const offset = this.pos - this.bufStart;
        if (offset > 0 && this.buf.length > offset) {
          this.buf = this.buf.slice(offset);
        } else {
          this.buf = new Uint8Array(0);
        }
        this.bufStart = this.pos;
      }

      // Fetch next 256 KiB chunk
      const nextStart = this.bufStart + this.buf.length;
      const nextEnd = nextStart + 262144;
      const chunk = await this.fetchRange(nextStart, nextEnd);
      
      if (chunk.length === 0) {
        this.eof = true;
        break;
      }

      const newBuf = new Uint8Array(this.buf.length + chunk.length);
      newBuf.set(this.buf);
      newBuf.set(chunk, this.buf.length);
      this.buf = newBuf;
    }

    if (this.bufStart + this.buf.length - this.pos < n) {
      throw new Error('Unexpected EOF');
    }
  }

  async readExact(n: number): Promise<Uint8Array> {
    await this.ensure(n);
    const localOffset = this.pos - this.bufStart;
    const out = this.buf.slice(localOffset, localOffset + n);
    this.pos += n;
    return out;
  }
}

// Little-endian readers
function readU32LE(bytes: Uint8Array): number {
  return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
}

function readU64LE(bytes: Uint8Array): number {
  // JavaScript number precision limit, but should be fine for our use case
  return bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24) |
         (bytes[4] << 32) | (bytes[5] << 40) | (bytes[6] << 48) | (bytes[7] << 56);
}

// Skip GGUF value based on type tag
async function skipValue(rr: RangeReader, typeTag: number): Promise<void> {
  switch (typeTag) {
    case 0: case 1: // u8, i8
      await rr.readExact(1);
      break;
    case 2: case 3: // u16, i16
      await rr.readExact(2);
      break;
    case 4: case 5: case 6: // u32, i32, f32
      await rr.readExact(4);
      break;
    case 7: // bool
      await rr.readExact(1);
      break;
    case 8: { // string
      const lenBytes = await rr.readExact(8);
      const strLen = readU64LE(lenBytes);
      if (strLen > 1 << 20) throw new Error('String too long');
      await rr.readExact(strLen);
      break;
    }
    case 9: { // array
      const elemTypeBytes = await rr.readExact(4);
      const elemType = readU32LE(elemTypeBytes);
      const countBytes = await rr.readExact(8);
      const count = readU64LE(countBytes);
      for (let j = 0; j < count; j++) {
        await skipValue(rr, elemType);
      }
      break;
    }
    case 10: case 11: case 12: // u64, i64, f64
      await rr.readExact(8);
      break;
    default:
      throw new Error(`Unknown GGUF type: ${typeTag}`);
  }
}

// Parse GGUF header to extract model parameters
async function parseGGUFParams(rr: RangeReader): Promise<GGUFParams | null> {
  try {
    // Read magic (4 bytes)
    const magic = await rr.readExact(4);
    const magicNum = readU32LE(magic);
    if (magicNum !== 0x46554747) { // "GGUF" in little-endian
      return null;
    }

    // Read version (u32)
    const verBytes = await rr.readExact(4);
    const version = readU32LE(verBytes);
    if (version > 3) return null;

    // For version >= 1, skip 8-byte alignment field
    if (version >= 1) {
      await rr.readExact(8);
    }

    // Read metadata count (u64)
    const metaCountBytes = await rr.readExact(8);
    const metaCount = readU64LE(metaCountBytes);

    const params: Partial<GGUFParams> = {};
    const found = { ah: false, kv: false, hl: false, hs: false };

    // Iterate metadata key-value pairs
    for (let i = 0; i < metaCount; i++) {
      // Read key length (u64)
      const keyLenBytes = await rr.readExact(8);
      const keyLen = readU64LE(keyLenBytes);
      if (keyLen > 1 << 20) return null;

      // Read key string
      const keyBytes = await rr.readExact(keyLen);
      const key = new TextDecoder().decode(keyBytes);

      // Read value type tag (u32)
      const typeBytes = await rr.readExact(4);
      const valueType = readU32LE(typeBytes);

      // Check if key matches our targets
      if (key.endsWith('.attention.head_count')) {
        if (valueType === 4 || valueType === 5) { // u32 or i32
          const val = readU32LE(await rr.readExact(4));
          params.attentionHeads = val;
          if (!found.kv) {
            params.kvHeads = val; // default
            found.kv = true;
          }
          found.ah = true;
        } else {
          await skipValue(rr, valueType);
        }
      } else if (key.endsWith('.attention.head_count_kv')) {
        if (valueType === 4 || valueType === 5) {
          const val = readU32LE(await rr.readExact(4));
          params.kvHeads = val;
          found.kv = true;
        } else {
          await skipValue(rr, valueType);
        }
      } else if (key.endsWith('.block_count')) {
        if (valueType === 4 || valueType === 5) {
          const val = readU32LE(await rr.readExact(4));
          params.hiddenLayers = val;
          found.hl = true;
        } else {
          await skipValue(rr, valueType);
        }
      } else if (key.endsWith('.embedding_length')) {
        if (valueType === 10 || valueType === 11 || valueType === 12) { // u64, i64, f64
          const val = readU64LE(await rr.readExact(8));
          params.hiddenSize = val;
          found.hs = true;
        } else if (valueType === 4 || valueType === 5) { // u32
          const val = readU32LE(await rr.readExact(4));
          params.hiddenSize = val;
          found.hs = true;
        } else {
          await skipValue(rr, valueType);
        }
      } else {
        await skipValue(rr, valueType);
      }

      // Early exit if all required fields found
      if (found.ah && found.hl && found.hs) {
        if (!found.kv) {
          params.kvHeads = params.attentionHeads;
        }
        break;
      }
    }

    // Validate required fields
    if (!found.ah || !found.hl || !found.hs) {
      return null;
    }

    if (!found.kv) {
      params.kvHeads = params.attentionHeads;
    }

    return params as GGUFParams;
  } catch (e) {
    return null;
  }
}

// Get remote file size using HEAD request
async function getRemoteSize(url: string, token?: string): Promise<number> {
  const headers = new Headers();
  setStdHeaders(headers, token);

  // Try HEAD first
  const headRes = await fetch(url, { method: 'HEAD', headers });
  if (headRes.ok || headRes.status === 206) {
    const contentLength = headRes.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > 0) {
      return parseInt(contentLength, 10);
    }
  }

  // Fallback to range GET 0-0
  headers.set('Range', 'bytes=0-0');
  const rangeRes = await fetch(url, { headers });
  
  if (rangeRes.status === 206) {
    const contentRange = rangeRes.headers.get('Content-Range');
    if (contentRange) {
      // Parse "bytes 0-0/TOTAL"
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  } else if (rangeRes.ok) {
    const contentLength = rangeRes.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > 0) {
      return parseInt(contentLength, 10);
    }
  }

  throw new Error('Cannot determine file size');
}

// Format bytes as human-readable
function humanSize(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / 1_000_000)} MB`;
}

// Estimate memory requirement for a GGUF file
export async function estimateMemory(
  modelId: string,
  primaryFilename: string,
  token?: string,
  contextSize = 16384, // 16k default
  partFilenames?: string[],
): Promise<string | null> {
  try {
    // Build raw URL
    const segments = modelId.split('/').map(encodeURIComponent).join('/');
    const files = partFilenames && partFilenames.length > 0 ? partFilenames : [primaryFilename];

    let totalBytes = 0;
    let primaryUrl: string | null = null;

    const buildUrl = (filename: string) => {
      const encoded = filename.split('/').map(encodeURIComponent).join('/');
      return `https://huggingface.co/${segments}/resolve/main/${encoded}`;
    };

    for (const file of files) {
  const url = buildUrl(file);
      const size = await getRemoteSize(url, token);
      if (size <= 0) return null;
      totalBytes += size;
      if (!primaryUrl && file === primaryFilename) {
        primaryUrl = url;
      }
    }

    if (!primaryUrl) {
      primaryUrl = buildUrl(files[0]);
    }

    // Parse GGUF header
  const rr = new RangeReader(primaryUrl, token);
    const params = await parseGGUFParams(rr);
    if (!params) return null;

    // Estimate KV cache bytes
    // Formula: 4 bytes per element * HiddenSize * HiddenLayers * ContextSize
    const kvBytes = 4.0 * params.hiddenSize * params.hiddenLayers * contextSize;
    const totalBytesWithCache = totalBytes + kvBytes;

    return `${humanSize(totalBytesWithCache)} (Model: ${humanSize(totalBytes)} + KV: ${humanSize(kvBytes)})`;
  } catch (e) {
    return null; // Silently fail, just don't show estimate
  }
}


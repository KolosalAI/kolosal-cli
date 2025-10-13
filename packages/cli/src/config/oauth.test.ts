/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { validateApiKey, validateKolosalCredential } from './oauth.js';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('validateKolosalCredential', () => {
  it('prefers token validation by default', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          valid: true,
          user: { id: 'user-1', email: 'user@example.com' },
        }),
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(validateKolosalCredential('token-123')).resolves.toEqual({
      valid: true,
      source: 'token',
      user: { id: 'user-1', email: 'user@example.com' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.kolosal.ai/api/auth/validate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('falls back to API key validation when token invalid', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: vi.fn() })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          valid: true,
          user: { id: 'user-2', email: 'cloud@example.com' },
        }),
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(validateKolosalCredential('api-key-123')).resolves.toEqual({
      valid: true,
      source: 'api-key',
      user: { id: 'user-2', email: 'cloud@example.com' },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://app.kolosal.ai/api/auth/validate',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://app.kolosal.ai/api/auth/validate-key',
      expect.anything(),
    );
  });

  it('honors preferApiKey option but still tries token when needed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn(),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          valid: true,
          user: { id: 'user-3', email: 'cli@example.com' },
        }),
      });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      validateKolosalCredential('either-token', { preferApiKey: true }),
    ).resolves.toEqual({
      valid: true,
      source: 'token',
      user: { id: 'user-3', email: 'cli@example.com' },
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://app.kolosal.ai/api/auth/validate-key',
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://app.kolosal.ai/api/auth/validate',
      expect.anything(),
    );
  });

  it('returns error immediately when API key validation reports an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    });

    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      validateKolosalCredential('bad-key', { preferApiKey: true }),
    ).resolves.toEqual({
      valid: false,
      source: 'api-key',
      error: 'http-500',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('validateApiKey', () => {
  it('returns parsed response when endpoint validates key', async () => {
    const mockResponse = {
      valid: true,
      user: { id: 'user-id', email: 'user@example.com' },
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(mockResponse),
    });

    global.fetch = fetchMock;

    await expect(validateApiKey('kolosal-key')).resolves.toEqual(mockResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://app.kolosal.ai/api/auth/validate-key',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer kolosal-key',
        }),
      }),
    );
  });

  it('falls back to default success shape when response lacks JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error('no json')),
    });

    global.fetch = fetchMock;

    await expect(validateApiKey('kolosal-key')).resolves.toEqual({
      valid: true,
    });
  });

  it('returns invalid when server responds with error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(),
    });

    global.fetch = fetchMock;

    await expect(validateApiKey('kolosal-key')).resolves.toEqual({
      valid: false,
      error: 'http-500',
    });
  });

  it('returns invalid when fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network'));

    global.fetch = fetchMock;

    await expect(validateApiKey('kolosal-key')).resolves.toEqual({
      valid: false,
      error: 'network-error',
    });
  });
});

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi } from 'vitest';

const { exitMock } = vi.hoisted(() => ({
  exitMock: vi.fn<(code?: string | number | null | undefined) => never>(),
}));

vi.mock('node:process', async () => {
  const actual = await vi.importActual<typeof import('process')>('process');
  return {
    ...actual,
    exit: exitMock,
  };
});

import { renderWithProviders } from '../../test-utils/render.js';
import { waitFor } from '@testing-library/react';
import { FolderTrustDialog } from './FolderTrustDialog.js';

describe('FolderTrustDialog', () => {
  beforeEach(() => {
    exitMock.mockClear();
  });

  it('should render the dialog with title and description', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} />,
    );

    expect(lastFrame()).toContain('Do you trust this folder?');
    expect(lastFrame()).toContain(
      'Trusting a folder allows Kolosal Cli to execute commands it suggests.',
    );
  });

  it('should display restart message when isRestarting is true', () => {
    const { lastFrame } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    expect(lastFrame()).toContain(
      'To see changes, Kolosal Cli must be restarted',
    );
  });

  it('should call process.exit when "r" is pressed and isRestarting is true', async () => {
    const { stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={true} />,
    );

    stdin.write('r');

    await waitFor(() => {
      expect(exitMock).toHaveBeenCalledWith(0);
    });
  });

  it('should not call process.exit when "r" is pressed and isRestarting is false', async () => {
    const { stdin } = renderWithProviders(
      <FolderTrustDialog onSelect={vi.fn()} isRestarting={false} />,
    );

    stdin.write('r');

    await waitFor(() => {
      expect(exitMock).not.toHaveBeenCalled();
    });
  });
});

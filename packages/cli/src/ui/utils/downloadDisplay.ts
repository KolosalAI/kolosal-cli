/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { Colors } from '../colors.js';
import type { SavedModelDownloadStatus } from '../../config/savedModels.js';

export interface DownloadDisplayState {
  status: SavedModelDownloadStatus;
  percentage?: number;
  error?: string;
  downloadId?: string;
}

function clampPercentage(value: number | undefined): number | undefined {
  if (value === undefined || Number.isNaN(value)) {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, value));
}

function formatPercentage(value: number | undefined): string {
  const clamped = clampPercentage(value);
  if (clamped === undefined) {
    return '--%';
  }
  if (clamped >= 99.95) {
    return '100%';
  }
  if (clamped < 1) {
    return `${clamped.toFixed(1)}%`;
  }
  if (clamped < 10) {
    return `${clamped.toFixed(1)}%`;
  }
  return `${clamped.toFixed(1)}%`;
}

function formatErrorMessage(error?: string): string {
  if (!error) {
    return 'retry';
  }
  const normalized = error.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 40) {
    return normalized;
  }
  return `${normalized.slice(0, 37)}…`;
}

export function getDownloadStatusPresentation(
  state: DownloadDisplayState | undefined,
  spinnerFrame: string,
): { label: string; color: string } {
  if (!state) {
    return {
      label: 'Available',
      color: Colors.Gray,
    };
  }

  switch (state.status) {
    case 'completed':
      return {
        label: 'Ready ✓',
        color: Colors.AccentGreen,
      };
    case 'queued':
      return {
        label: `${spinnerFrame} queued`,
        color: Colors.AccentYellow,
      };
    case 'downloading':
      return {
        label: `${spinnerFrame} ${formatPercentage(state.percentage)} ↓`,
        color: Colors.AccentBlue,
      };
    case 'paused':
      return {
        label: `${spinnerFrame} paused ${formatPercentage(state.percentage)}`,
        color: Colors.AccentYellow,
      };
    case 'error':
      return {
        label: `Error — ${formatErrorMessage(state.error)}`,
        color: Colors.AccentRed,
      };
    default:
      return {
        label: 'Available',
        color: Colors.Gray,
      };
  }
}

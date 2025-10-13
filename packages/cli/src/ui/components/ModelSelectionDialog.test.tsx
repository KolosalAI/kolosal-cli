/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelSelectionDialog } from './ModelSelectionDialog.js';
import type { AvailableModel } from '../models/availableModels.js';
import type { SavedModelDownloadState } from '../../config/savedModels.js';

// Mock the useKeypress hook
const mockUseKeypress = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: mockUseKeypress,
}));

// Mock the RadioButtonSelect component
const mockRadioButtonSelect = vi.hoisted(() => vi.fn());
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: mockRadioButtonSelect,
}));

describe('ModelSelectionDialog', () => {
  const mockAvailableModels: AvailableModel[] = [
    { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
    { id: 'qwen-vl-max-latest', label: 'qwen-vl-max', isVision: true },
    { id: 'gpt-4', label: 'GPT-4' },
  ];

  const mockOnSelect = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock RadioButtonSelect to return a simple div
    mockRadioButtonSelect.mockReturnValue(
      React.createElement('div', { 'data-testid': 'radio-select' }),
    );
  });

  it('should setup escape key handler to call onCancel', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    expect(mockUseKeypress).toHaveBeenCalledWith(expect.any(Function), {
      isActive: true,
    });

    // Simulate escape key press
    const keypressHandler = mockUseKeypress.mock.calls[0][0];
    keypressHandler({ name: 'escape' });

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should not call onCancel for non-escape keys', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const keypressHandler = mockUseKeypress.mock.calls[0][0];
    keypressHandler({ name: 'enter' });

    expect(mockOnCancel).not.toHaveBeenCalled();
  });

  it('should set correct initial index for current model', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen-vl-max-latest"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(callArgs.initialIndex).toBe(1); // qwen-vl-max-latest is at index 1
  });

  it('should set initial index to 0 when current model is not found', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="non-existent-model"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(callArgs.initialIndex).toBe(0);
  });

  it('should call onSelect when a model is selected', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(typeof callArgs.onSelect).toBe('function');

    // Simulate selection
    const onSelectCallback = mockRadioButtonSelect.mock.calls[0][0].onSelect;
    const selectedOption = callArgs.items[1]!.value;
    onSelectCallback(selectedOption);

    expect(mockOnSelect).toHaveBeenCalledWith(selectedOption);
  });

  it('should handle empty models array', () => {
    render(
      <ModelSelectionDialog
        availableModels={[]}
        currentModel=""
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(callArgs.items).toEqual([]);
    expect(callArgs.initialIndex).toBe(0);
  });

  it('should create correct option items with proper labels', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(callArgs.items.map((item: { label: string }) => item.label)).toEqual([
      'qwen3-coder-plus (current) — Online ✓',
      'qwen-vl-max [Vision] — Online ✓',
      'GPT-4 — Online ✓',
    ]);
    callArgs.items.forEach((item: { renderLabel?: unknown }) => {
      expect(typeof item.renderLabel).toBe('function');
    });
    expect(
      callArgs.items.map((item: { value: AvailableModel }) => item.value.id),
    ).toEqual(['qwen3-coder-plus', 'qwen-vl-max-latest', 'gpt-4']);
  });

  it('should show vision indicator for vision models', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="gpt-4"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    const visionModelItem = callArgs.items.find(
      (item: { value: AvailableModel }) => item.value.id === 'qwen-vl-max-latest',
    );

    expect(visionModelItem?.label).toContain('[Vision]');
  });

  it('should show current indicator for the current model', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen-vl-max-latest"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    const currentModelItem = callArgs.items.find(
      (item: { value: AvailableModel }) =>
        item.value.id === 'qwen-vl-max-latest',
    );

    expect(currentModelItem?.label).toContain('(current)');
  });

  it('should pass isFocused prop to RadioButtonSelect', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    expect(callArgs.isFocused).toBe(true);
  });

  it('adds download status for oss-local models and disables in-progress items', () => {
    const downloads: AvailableModel[] = [
      {
        id: 'local-ready',
        label: 'Local Ready',
        provider: 'oss-local',
        downloadState: {
          status: 'completed',
          updatedAt: Date.now(),
        } as SavedModelDownloadState,
      },
      {
        id: 'local-downloading',
        label: 'Local Downloading',
        provider: 'oss-local',
        downloadState: {
          status: 'downloading',
          progress: 0.42,
          updatedAt: Date.now(),
        } as SavedModelDownloadState,
      },
    ];

    render(
      <ModelSelectionDialog
        availableModels={downloads}
        currentModel=""
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    const items = callArgs.items as Array<{ label: string; disabled?: boolean; value: AvailableModel }>;

    const readyItem = items.find((item) => item.value.id === 'local-ready');
  expect(readyItem?.label).toContain('— Ready ✓');
    expect(readyItem?.disabled).toBeFalsy();

    const downloadingItem = items.find((item) => item.value.id === 'local-downloading');
  expect(downloadingItem?.label).toContain('— ⠋ 42.0% ↓');
    expect(downloadingItem?.disabled).toBe(true);
  });

  it('should handle multiple onSelect calls correctly', () => {
    render(
      <ModelSelectionDialog
        availableModels={mockAvailableModels}
        currentModel="qwen3-coder-plus"
        onSelect={mockOnSelect}
        onCancel={mockOnCancel}
      />,
    );

    const callArgs = mockRadioButtonSelect.mock.calls[0][0];
    const onSelectCallback = callArgs.onSelect;

    const [first, second, third] = callArgs.items.map(
      (item: { value: AvailableModel }) => item.value,
    );

    // Call multiple times
    onSelectCallback(first);
    onSelectCallback(second);
    onSelectCallback(third);

    expect(mockOnSelect).toHaveBeenCalledTimes(3);
    expect(mockOnSelect).toHaveBeenNthCalledWith(1, first);
    expect(mockOnSelect).toHaveBeenNthCalledWith(2, second);
    expect(mockOnSelect).toHaveBeenNthCalledWith(3, third);
  });
});

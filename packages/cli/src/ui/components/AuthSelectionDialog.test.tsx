/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthSelectionDialog } from './AuthSelectionDialog.js';

const mockUseKeypress = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: mockUseKeypress,
}));

const mockRadioButtonSelect = vi.hoisted(() => vi.fn());
vi.mock('./shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: mockRadioButtonSelect,
}));

describe('AuthSelectionDialog', () => {
  const defaultProps = {
    defaultChoice: 'hf' as const,
    onSelect: vi.fn(),
    onCancel: vi.fn(),
    canCancel: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockRadioButtonSelect.mockReturnValue(
      React.createElement('div', { 'data-testid': 'radio-select' }),
    );
  });

  it('calls onCancel when escape is pressed and cancel is allowed', () => {
    render(
      <AuthSelectionDialog
        {...defaultProps}
        canCancel
        initialErrorMessage={null}
      />,
    );

    expect(mockUseKeypress).toHaveBeenCalledWith(expect.any(Function), {
      isActive: true,
    });

    const handler = mockUseKeypress.mock.calls[0][0];
    handler({ name: 'escape' });

    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  it("doesn't call onCancel when cancel is disallowed", () => {
    const onCancel = vi.fn();

    render(
      <AuthSelectionDialog
        {...defaultProps}
        canCancel={false}
        onCancel={onCancel}
        initialErrorMessage={null}
      />,
    );

    const handler = mockUseKeypress.mock.calls[0][0];
    handler({ name: 'escape' });

    expect(onCancel).not.toHaveBeenCalled();
  });

  it('hides escape hint when cancel is disabled', () => {
    const { lastFrame } = render(
      <AuthSelectionDialog
        {...defaultProps}
        canCancel={false}
        initialErrorMessage={null}
      />,
    );

    const output = lastFrame() ?? '';

    expect(output).toContain('Press Enter to choose');
    expect(output).not.toContain('Esc to cancel');
  });
});

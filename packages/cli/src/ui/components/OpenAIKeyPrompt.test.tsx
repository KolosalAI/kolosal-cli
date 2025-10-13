/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';

describe('OpenAIKeyPrompt', () => {
  it('should render the prompt correctly', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    expect(lastFrame()).toContain('Kolosal Cloud API Key');
    expect(lastFrame()).toContain('Press Enter to submit or Esc to cancel');
  });

  it('should show the component with proper styling', () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { lastFrame } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    const output = lastFrame();
    expect(output).toContain('Kolosal Cloud API Key');
    expect(output).toContain('API Key:');
    expect(output).not.toContain('Base URL:');
    expect(output).not.toContain('Model:');
    expect(output).toContain('Press Enter to submit or Esc to cancel');
  });

  it('should submit defaults when enter is pressed', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    stdin.write('s');
    stdin.write('k');
    stdin.write('-');
    stdin.write('t');
    stdin.write('e');
    stdin.write('s');
    stdin.write('t');
    stdin.write('\r');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        'sk-test',
        'https://openrouter.ai/api/v1',
        'moonshotai/kimi-k2-0905',
      );
    });
  });

  it('should handle paste with control characters', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    // Simulate paste with control characters
    const pasteWithControlChars = '\x1b[200~sk-test123\x1b[201~';
    stdin.write(pasteWithControlChars);

    // Wait a bit for processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The component should have filtered out the control characters
    // and only kept 'sk-test123'
    expect(onSubmit).not.toHaveBeenCalled(); // Should not submit yet
  });

  it('should call onCancel when escape is pressed', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();

    const { stdin } = render(
      <OpenAIKeyPrompt onSubmit={onSubmit} onCancel={onCancel} />,
    );

    stdin.write('\u001b');

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

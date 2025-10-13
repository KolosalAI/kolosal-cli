/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  pushDialog,
  removeDialog,
  previousDialog,
  peekDialog,
  type DialogId,
} from './dialogStack.js';

describe('dialogStack utilities', () => {
  it('pushDialog appends dialog and maintains uniqueness', () => {
    let stack: DialogId[] = [];
    stack = pushDialog(stack, 'provider');
    expect(stack).toEqual(['provider']);

    stack = pushDialog(stack, 'hfPicker');
    expect(stack).toEqual(['provider', 'hfPicker']);

    stack = pushDialog(stack, 'provider');
    expect(stack).toEqual(['hfPicker', 'provider']);
  });

  it('removeDialog removes matching entries', () => {
    const stack: DialogId[] = ['provider', 'hfPicker', 'auth'];
    const result = removeDialog(stack, 'hfPicker');
    expect(result).toEqual(['provider', 'auth']);
  });

  it('previousDialog returns prior dialog when present', () => {
    const stack: DialogId[] = ['provider', 'hfPicker', 'auth'];
    expect(previousDialog(stack, 'auth')).toBe('hfPicker');
    expect(previousDialog(stack, 'hfPicker')).toBe('provider');
    expect(previousDialog(stack, 'provider')).toBeUndefined();
    expect(previousDialog(stack, 'non-existent' as DialogId)).toBeUndefined();
  });

  it('peekDialog returns the last dialog or undefined', () => {
    expect(peekDialog([])).toBeUndefined();
    expect(peekDialog(['provider', 'auth'])).toBe('auth');
  });
});

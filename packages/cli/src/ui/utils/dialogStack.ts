/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type DialogId = 'provider' | 'hfPicker' | 'auth';

export function pushDialog(
  stack: DialogId[],
  dialog: DialogId,
): DialogId[] {
  const filtered = stack.filter((id) => id !== dialog);
  return [...filtered, dialog];
}

export function removeDialog(stack: DialogId[], dialog: DialogId): DialogId[] {
  return stack.filter((id) => id !== dialog);
}

export function previousDialog(
  stack: DialogId[],
  dialog: DialogId,
): DialogId | undefined {
  const index = stack.lastIndexOf(dialog);
  if (index <= 0) {
    return undefined;
  }
  return stack[index - 1];
}

export function peekDialog(stack: DialogId[]): DialogId | undefined {
  return stack.at(-1);
}

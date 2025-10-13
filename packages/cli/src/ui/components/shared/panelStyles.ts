/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Colors } from '../../colors.js';
import { resolveColor } from '../../themes/color-utils.js';

const HEX_COLOR_REGEX = /^#[0-9a-f]{6}$/i;

const NAMED_COLOR_TO_HEX: Record<string, string> = {
  black: '#000000',
  red: '#aa0000',
  green: '#00aa00',
  yellow: '#aa5500',
  blue: '#0000aa',
  magenta: '#aa00aa',
  cyan: '#00aaaa',
  white: '#aaaaaa',
  gray: '#555555',
  grey: '#555555',
  blackbright: '#555555',
  redbright: '#ff5555',
  greenbright: '#55ff55',
  yellowbright: '#ffff55',
  bluebright: '#5555ff',
  magentabright: '#ff55ff',
  cyanbright: '#55ffff',
  whitebright: '#ffffff',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.slice(1);
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lightenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const lighten = (channel: number) => channel + (255 - channel) * amount;
  return rgbToHex(lighten(r), lighten(g), lighten(b));
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const darken = (channel: number) => channel * (1 - amount);
  return rgbToHex(darken(r), darken(g), darken(b));
}

function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((value) => value / 255);
  const linearize = (value: number) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  const [lr, lg, lb] = [linearize(r), linearize(g), linearize(b)];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function colorToHex(color: string): string | undefined {
  const resolved = resolveColor(color);
  if (!resolved) {
    return undefined;
  }
  if (HEX_COLOR_REGEX.test(resolved)) {
    return resolved.toLowerCase();
  }
  const normalized = resolved.toLowerCase();
  return NAMED_COLOR_TO_HEX[normalized];
}

export function getPanelBackgroundColor(): string {
  const baseColor = Colors.Background;
  const themeType = Colors.type;
  const baseHex = colorToHex(baseColor);

  if (baseHex) {
    const luminance = getLuminance(baseHex);
    if (themeType === 'light' || luminance > 0.5) {
      return darkenHex(baseHex, 0.08);
    }
    return lightenHex(baseHex, 0.08);
  }

  if (themeType === 'ansi') {
    return 'blackbright';
  }

  if (themeType === 'dark') {
    return '#1a1a24';
  }

  if (themeType === 'light') {
    return '#e6e6ef';
  }

  return baseColor;
}

export function getDimmerPanelBackgroundColor(): string {
  // Use a lighter gray for a subtle dimmer effect
  return '#2a2a2a';
}

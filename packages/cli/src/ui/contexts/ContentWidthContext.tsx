/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useMemo } from 'react';

interface ContentWidthContextValue {
  contentWidth: number;
}

const ContentWidthContext = createContext<ContentWidthContextValue | undefined>(
  undefined,
);

export interface ContentWidthProviderProps {
  terminalWidth: number;
  /** Fraction (0-1] of terminal width to allocate to content panels. Default 0.9 */
  fraction?: number;
  /** Minimum width safeguard. Default 40 */
  minWidth?: number;
  children: React.ReactNode;
}

export function ContentWidthProvider({
  terminalWidth,
  fraction = 0.9,
  minWidth = 40,
  children,
}: ContentWidthProviderProps) {
  const value = useMemo(() => {
    const raw = Math.floor(terminalWidth * fraction);
    const contentWidth = Math.max(minWidth, raw);
    return { contentWidth };
  }, [terminalWidth, fraction, minWidth]);

  return (
    <ContentWidthContext.Provider value={value}>
      {children}
    </ContentWidthContext.Provider>
  );
}

export function useContentWidth(): number {
  const ctx = useContext(ContentWidthContext);
  if (!ctx) {
    throw new Error('useContentWidth must be used within a ContentWidthProvider');
  }
  return ctx.contentWidth;
}

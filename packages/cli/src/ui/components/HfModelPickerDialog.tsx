/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { buildModelsBaseUrl, fetchModels, type HFModel } from '../../services/huggingfaceApi.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

interface HfModelPickerDialogProps {
  token?: string;
  initialQuery?: string;
  onSelect: (modelId: string) => void;
  onCancel: () => void;
}

export const HfModelPickerDialog: React.FC<HfModelPickerDialogProps> = ({ token, initialQuery = '', onSelect, onCancel }) => {
  const [items, setItems] = useState<HFModel[]>([]);
  const [cursor, setCursor] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [nextUrl, setNextUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState(false);
  const inputBuffer = useRef('');
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const { rows, columns } = useTerminalSize();

  // Compute a max list height that fits well inside the dialog and screen
  // Reserve: header + instructions + optional search + error + footer hints/margins
  // We keep a sane minimum of 5 rows for the list viewport
  const RESERVED_VERTICAL = 10; // rough buffer for static text inside the dialog
  const viewportHeight = Math.max(5, Math.min(12, rows - RESERVED_VERTICAL));
  const listWidth = Math.max(20, Math.floor(columns * 0.8) - 6); // dialog padding/borders

  const baseUrl = useMemo(() => buildModelsBaseUrl(query, 20), [query]);

  async function load(url: string) {
    try {
      setLoading(true);
      const { models, nextUrl } = await fetchModels(url, token);
      setItems(models);
      setNextUrl(nextUrl);
      setCursor(0);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextUrl || loading) return;
    try {
      setLoading(true);
      const { models, nextUrl: nxt } = await fetchModels(nextUrl, token);
      setItems((prev) => [...prev, ...models]);
      setNextUrl(nxt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(baseUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl]);

  useInput((input, key) => {
    if (key.escape) return onCancel();

    if (searchMode) {
      // Exit search mode on Down arrow: apply the current buffer as query and leave search
      if (key.downArrow) {
        setSearchMode(false);
        setQuery(inputBuffer.current);
        inputBuffer.current = '';
        return;
      }
      if (key.return) {
        setSearchMode(false);
        setQuery(inputBuffer.current);
        inputBuffer.current = '';
        return;
      }
      if (key.backspace || key.delete) {
        inputBuffer.current = inputBuffer.current.slice(0, -1);
      } else if (key.ctrl && input === 'u') {
        inputBuffer.current = '';
      } else if (input) {
        inputBuffer.current += input;
      }
      // Debounce preview fetching while typing
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        setQuery(inputBuffer.current);
      }, 300);
      return;
    }

    if (input === '/') {
      setSearchMode(true);
      inputBuffer.current = query;
      return;
    }

    if (key.downArrow) {
      setCursor((c) => {
        const next = Math.min(c + 1, items.length - 1);
        if (items.length - next < 5) void loadMore();
        return next;
      });
    } else if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.return) {
      if (items[cursor]) onSelect(items[cursor].modelId);
    } else if (key.pageDown) {
      // PageDown moves the cursor down by a viewport
      setCursor((c) => Math.min(c + viewportHeight, items.length - 1));
      void loadMore();
    } else if (key.pageUp) {
      // PageUp moves the cursor up by a viewport
      setCursor((c) => Math.max(c - viewportHeight, 0));
    } else if (input === 'r') {
      void load(baseUrl);
    }
  });

  // windowing calculation: determine the slice of items to render based on cursor and viewportHeight
  const startIndex = Math.max(0, Math.min(cursor - Math.floor(viewportHeight / 2), Math.max(0, items.length - viewportHeight)));
  const endIndex = Math.min(items.length, startIndex + viewportHeight);
  const visibleItems = items.slice(startIndex, endIndex);
  const canScrollUp = startIndex > 0;
  const canScrollDown = endIndex < items.length;

  return (
    <LeftBorderPanel
      accentColor={Colors.AccentBlue}
      backgroundColor={getPanelBackgroundColor()}
      width="100%"
      marginLeft={1}
      marginTop={1}
      marginBottom={1}
      contentProps={{
        flexDirection: 'column',
        padding: 1,
      }}
    >
      <Box flexDirection="column" marginBottom={1}>
        <Text bold>Select a Hugging Face model</Text>
        <Text>
          Type '/' to search, Enter to select, ↑/↓ to move, PageUp/PageDown to scroll, Esc to cancel.
        </Text>
      </Box>
      {searchMode && (
        <Box marginBottom={1}>
          <Text color={Colors.AccentBlue}>Search: </Text>
          <Text>{inputBuffer.current || ''}</Text>
        </Box>
      )}
      {error && (
        <Box marginBottom={1}>
          <Text color={Colors.AccentRed}>Error: {error}</Text>
        </Box>
      )}
      <Box flexDirection="column">
        {items.length === 0 && !loading && !error && (
          <Text color={Colors.Gray}>No models found.</Text>
        )}
        {/* Scroll up indicator */}
        {canScrollUp && (
          <Text color={Colors.Gray}>▲ more above</Text>
        )}
        {visibleItems.map((m, localIdx) => {
          const absoluteIdx = startIndex + localIdx;
          const isActive = absoluteIdx === cursor;
          const label = m.modelId.length > listWidth - 4 ? m.modelId.slice(0, listWidth - 7) + '…' : m.modelId;
          return (
            <Text key={m.modelId} color={isActive ? Colors.AccentBlue : Colors.Gray} dimColor={!isActive}>
              {isActive ? '>' : ' '} {label}
            </Text>
          );
        })}
        {/* Scroll down indicator */}
        {canScrollDown && (
          <Text color={Colors.Gray}>▼ more below</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text>{loading ? 'Loading…' : nextUrl ? 'More available (PageDown)' : 'End of list'}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Tip: set HF_TOKEN for higher rate limits. Current query: "{query || ''}"
        </Text>
      </Box>
    </LeftBorderPanel>
  );
};

/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import {
  fetchModelFiles,
  groupGGUFFiles,
  estimateMemory,
  type GroupedFile,
} from '../../services/huggingfaceApi.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  getDownloadStatusPresentation,
  type DownloadDisplayState,
} from '../utils/downloadDisplay.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export type FileDownloadDisplayState = DownloadDisplayState;

interface HfModelFilePickerDialogProps {
  modelId: string;
  token?: string;
  onSelect: (file: GroupedFile) => void | Promise<void>;
  onBack: () => void;
  onCancel: () => void;
  downloadsByFilename?: Record<string, DownloadDisplayState>;
}

export const HfModelFilePickerDialog: React.FC<HfModelFilePickerDialogProps> = ({ 
  modelId, 
  token, 
  onSelect, 
  onBack,
  onCancel,
  downloadsByFilename = {},
}) => {
  const [files, setFiles] = useState<GroupedFile[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const { rows, columns } = useTerminalSize();

  // Compute viewport height similar to model picker
  const RESERVED_VERTICAL = 10;
  const viewportHeight = Math.max(5, Math.min(12, rows - RESERVED_VERTICAL));
  const listWidth = Math.max(40, Math.floor(columns * 0.8) - 6);
  const separator = '  ';
  const statusColumnWidth = Math.max(12, Math.min(22, Math.floor(listWidth * 0.25)));
  const memoryColumnWidth = Math.max(16, Math.min(30, Math.floor(listWidth * 0.35)));
  const nameColumnWidth = Math.max(
    10,
    listWidth - memoryColumnWidth - statusColumnWidth - separator.length * 2,
  );

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        setLoading(true);
        const modelFiles = await fetchModelFiles(modelId, token);
        const grouped = groupGGUFFiles(modelFiles);

        setFiles(grouped);
        setCursor(0);
        setError(null);

        grouped.forEach((file) => {
          void (async () => {
            try {
              const estimate = await estimateMemory(modelId, file.actualName, token, 16384, file.partFiles);
              if (!isActive) return;
              setFiles((prev) => {
                if (!isActive) return prev;
                const idx = prev.findIndex((f) => f.actualName === file.actualName);
                if (idx === -1) return prev;
                const existing = prev[idx];
                const finalEstimate = estimate ?? 'Unavailable';
                if (existing.memoryEstimate === finalEstimate) return prev;
                const updated = [...prev];
                updated[idx] = { ...existing, memoryEstimate: finalEstimate };
                return updated;
              });
            } catch {
              if (!isActive) return;
              setFiles((prev) => {
                if (!isActive) return prev;
                const idx = prev.findIndex((f) => f.actualName === file.actualName);
                if (idx === -1) return prev;
                const existing = prev[idx];
                if (existing.memoryEstimate === 'Unavailable') return prev;
                const updated = [...prev];
                updated[idx] = { ...existing, memoryEstimate: 'Unavailable' };
                return updated;
              });
            }
          })();
        });
      } catch (e) {
        if (!isActive) return;
        setError((e as Error).message);
      } finally {
        if (!isActive) return;
        setLoading(false);
      }
    }

    void load();

    return () => {
      isActive = false;
    };
  }, [modelId, token]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useInput((input, key) => {
    if (key.escape) return onBack();

    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, files.length - 1));
    } else if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.return) {
      const selected = files[cursor];
      if (selected) {
        const status = downloadsByFilename[selected.actualName]?.status;
        if (status === 'downloading' || status === 'queued') {
          return;
        }
        onSelect(selected);
      }
    } else if (key.pageDown) {
      setCursor((c) => Math.min(c + viewportHeight, files.length - 1));
    } else if (key.pageUp) {
      setCursor((c) => Math.max(c - viewportHeight, 0));
    }
  });

  // Windowing calculation
  const startIndex = Math.max(0, Math.min(cursor - Math.floor(viewportHeight / 2), Math.max(0, files.length - viewportHeight)));
  const endIndex = Math.min(files.length, startIndex + viewportHeight);
  const visibleFiles = files.slice(startIndex, endIndex);
  const canScrollUp = startIndex > 0;
  const canScrollDown = endIndex < files.length;

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
        <Text bold>Select a GGUF file from: {modelId}</Text>
        <Text>
          Enter to select, ↑/↓ to move, PageUp/PageDown to scroll, Esc to go back.
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color={Colors.AccentRed}>Error: {error}</Text>
        </Box>
      )}

      <Box flexDirection="column">
        {loading && <Text color={Colors.Gray}>Loading files...</Text>}
        
        {!loading && files.length === 0 && !error && (
          <Text color={Colors.Gray}>No GGUF files found in this model.</Text>
        )}

        {!loading && files.length > 0 && (
          <>
            {canScrollUp && <Text color={Colors.Gray}>▲ more above</Text>}
            
            {visibleFiles.map((file, localIdx) => {
              const absoluteIdx = startIndex + localIdx;
              const isActive = absoluteIdx === cursor;

              // Name column with optional part count indicator
              let displayText = file.displayName;
              if (file.partCount) {
                displayText += ` (${file.partCount} parts)`;
              }
              const needsEllipsis = displayText.length > nameColumnWidth;
              const truncatedName = needsEllipsis
                ? displayText.slice(0, Math.max(0, nameColumnWidth - 1)) + '…'
                : displayText;
              const nameCell = truncatedName.padEnd(nameColumnWidth, ' ');

              const spinnerFrame = SPINNER_FRAMES[spinnerIndex];
              const downloadInfo = downloadsByFilename[file.actualName];
              const normalizedState = downloadInfo
                ? {
                    ...downloadInfo,
                    percentage:
                      downloadInfo.status === 'completed'
                        ? 100
                        : downloadInfo.percentage,
                  }
                : undefined;
              const { label: statusLabel, color: statusColor } =
                getDownloadStatusPresentation(normalizedState, spinnerFrame);

              const statusNeedsEllipsis = statusLabel.length > statusColumnWidth;
              const truncatedStatus = statusNeedsEllipsis
                ? statusLabel.slice(0, Math.max(0, statusColumnWidth - 1)) + '…'
                : statusLabel;
              const statusCell = truncatedStatus.padEnd(statusColumnWidth, ' ');

              // Memory column
              const pendingText = `${spinnerFrame} estimating…`;
              const memoryText = file.memoryEstimate ?? pendingText;
              const memoryNeedsEllipsis = memoryText.length > memoryColumnWidth;
              const truncatedMemory = memoryNeedsEllipsis
                ? memoryText.slice(0, Math.max(0, memoryColumnWidth - 1)) + '…'
                : memoryText;
              const memoryCell = truncatedMemory.padEnd(memoryColumnWidth, ' ');

              return (
                <Box key={file.actualName} flexDirection="row">
                  <Text color={isActive ? Colors.AccentBlue : Colors.Gray} dimColor={!isActive}>
                    {isActive ? '>' : ' '} 
                  </Text>
                  <Text color={isActive ? Colors.AccentBlue : Colors.Gray} dimColor={!isActive}>{nameCell}</Text>
                  <Text>{separator}</Text>
                  <Text color={statusColor} dimColor={!isActive && statusColor === Colors.Gray}>
                    {statusCell}
                  </Text>
                  <Text>{separator}</Text>
                  <Text color={isActive ? Colors.AccentBlue : Colors.Gray} dimColor={!isActive}>
                    {memoryCell}
                  </Text>
                </Box>
              );
            })}
            
            {canScrollDown && <Text color={Colors.Gray}>▼ more below</Text>}
          </>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          {files.length} GGUF file{files.length !== 1 ? 's' : ''} available
        </Text>
      </Box>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Tip: Downloads in progress can’t be re-selected. Press Esc to go back to model selection.
        </Text>
      </Box>
    </LeftBorderPanel>
  );
};

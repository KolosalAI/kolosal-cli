/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import {
  fetchKolosalModels,
  formatPrice,
  formatContextSize,
  type KolosalModel,
} from '../../services/kolosalApi.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

interface KolosalModelPickerDialogProps {
  accessToken: string;
  userEmail?: string;
  onSelect: (model: KolosalModel) => void | Promise<void>;
  onCancel: () => void;
}

export const KolosalModelPickerDialog: React.FC<
  KolosalModelPickerDialogProps
> = ({ accessToken, userEmail, onSelect, onCancel }) => {
  const [models, setModels] = useState<KolosalModel[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rows, columns } = useTerminalSize();

  // Compute viewport height
  const RESERVED_VERTICAL = 14;
  const viewportHeight = Math.max(5, Math.min(12, rows - RESERVED_VERTICAL));
  const listWidth = Math.max(60, Math.floor(columns * 0.9) - 6);
  const separator = '  ';
  
  // Column widths for table
  const nameColumnWidth = Math.max(20, Math.floor(listWidth * 0.35));
  const inputPriceColumnWidth = Math.max(12, Math.floor(listWidth * 0.20));
  const outputPriceColumnWidth = Math.max(12, Math.floor(listWidth * 0.20));
  const contextColumnWidth = Math.max(
    12,
    listWidth - nameColumnWidth - inputPriceColumnWidth - outputPriceColumnWidth - separator.length * 3,
  );

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        setLoading(true);
        const fetchedModels = await fetchKolosalModels(accessToken);

        if (!isActive) return;

        setModels(fetchedModels);
        setCursor(0);
        setError(null);
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
  }, [accessToken]);

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.downArrow) {
      setCursor((c) => Math.min(c + 1, models.length - 1));
    } else if (key.upArrow) {
      setCursor((c) => Math.max(c - 1, 0));
    } else if (key.return) {
      const selected = models[cursor];
      if (selected) {
        void onSelect(selected);
      }
    } else if (key.pageDown) {
      setCursor((c) => Math.min(c + viewportHeight, models.length - 1));
    } else if (key.pageUp) {
      setCursor((c) => Math.max(c - viewportHeight, 0));
    }
  });

  // Windowing calculation
  const startIndex = Math.max(
    0,
    Math.min(
      cursor - Math.floor(viewportHeight / 2),
      Math.max(0, models.length - viewportHeight),
    ),
  );
  const endIndex = Math.min(models.length, startIndex + viewportHeight);
  const visibleModels = models.slice(startIndex, endIndex);
  const canScrollUp = startIndex > 0;
  const canScrollDown = endIndex < models.length;

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
        <Text bold color={Colors.AccentBlue}>
          Select a Kolosal Cloud Model
        </Text>
        {userEmail && (
          <Text color={Colors.Gray}>Logged in as: {userEmail}</Text>
        )}
        <Text color={Colors.Gray}>
          Enter to select, ↑/↓ to move, PageUp/PageDown to scroll, Esc to
          cancel.
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1} flexDirection="column">
          <Text color={Colors.AccentRed}>Error: {error}</Text>
          {error.includes('not yet available') && (
            <Box marginTop={1}>
              <Text color={Colors.Gray}>
                The model list API is still being developed. You can still use Kolosal Cloud 
                by manually entering model details in the "Use OpenAI Compatible API" option.
              </Text>
            </Box>
          )}
        </Box>
      )}

      <Box flexDirection="column">
        {loading && <Text color={Colors.Gray}>Loading models...</Text>}

        {!loading && models.length === 0 && !error && (
          <Text color={Colors.Gray}>No models available.</Text>
        )}

        {!loading && models.length > 0 && (
          <>
            {/* Table Header */}
            <Box flexDirection="row" marginBottom={1}>
              <Text color={Colors.AccentBlue} bold>
                {' '}
              </Text>
              <Text color={Colors.AccentBlue} bold>
                {'Model Name'.padEnd(nameColumnWidth, ' ')}
              </Text>
              <Text>{separator}</Text>
              <Text color={Colors.AccentBlue} bold>
                {'Input Price'.padEnd(inputPriceColumnWidth, ' ')}
              </Text>
              <Text>{separator}</Text>
              <Text color={Colors.AccentBlue} bold>
                {'Output Price'.padEnd(outputPriceColumnWidth, ' ')}
              </Text>
              <Text>{separator}</Text>
              <Text color={Colors.AccentBlue} bold>
                {'Context'.padEnd(contextColumnWidth, ' ')}
              </Text>
            </Box>

            {canScrollUp && <Text color={Colors.Gray}>▲ more above</Text>}

            {visibleModels.map((model, localIdx) => {
              const absoluteIdx = startIndex + localIdx;
              const isActive = absoluteIdx === cursor;

              // Helper to get field value with fallbacks for different naming conventions
              const getModelName = (m: any) => 
                m.name || m.model_name || m.modelName || 'Unknown Model';
              const getInputPrice = (m: any) => 
                m.pricing?.input ?? m.input_price_per_m_tokens ?? m.inputPricePerMTokens ?? m.inputPrice ?? 0;
              const getOutputPrice = (m: any) => 
                m.pricing?.output ?? m.output_price_per_m_tokens ?? m.outputPricePerMTokens ?? m.outputPrice ?? 0;
              const getContextSize = (m: any) => 
                m.contextSize ?? m.context_size ?? m.contextWindow ?? 0;

              // Name column
              const displayName = getModelName(model);
              const needsEllipsis = displayName.length > nameColumnWidth;
              const truncatedName = needsEllipsis
                ? displayName.slice(0, Math.max(0, nameColumnWidth - 1)) + '…'
                : displayName;
              const nameCell = truncatedName.padEnd(nameColumnWidth, ' ');

              // Input price column
              const inputPriceText = formatPrice(getInputPrice(model));
              const inputPriceNeedsEllipsis = inputPriceText.length > inputPriceColumnWidth;
              const truncatedInputPrice = inputPriceNeedsEllipsis
                ? inputPriceText.slice(0, Math.max(0, inputPriceColumnWidth - 1)) + '…'
                : inputPriceText;
              const inputPriceCell = truncatedInputPrice.padEnd(inputPriceColumnWidth, ' ');

              // Output price column
              const outputPriceText = formatPrice(getOutputPrice(model));
              const outputPriceNeedsEllipsis = outputPriceText.length > outputPriceColumnWidth;
              const truncatedOutputPrice = outputPriceNeedsEllipsis
                ? outputPriceText.slice(0, Math.max(0, outputPriceColumnWidth - 1)) + '…'
                : outputPriceText;
              const outputPriceCell = truncatedOutputPrice.padEnd(outputPriceColumnWidth, ' ');

              // Context column
              const contextText = formatContextSize(getContextSize(model));
              const contextNeedsEllipsis =
                contextText.length > contextColumnWidth;
              const truncatedContext = contextNeedsEllipsis
                ? contextText.slice(0, Math.max(0, contextColumnWidth - 1)) +
                  '…'
                : contextText;
              const contextCell = truncatedContext.padEnd(
                contextColumnWidth,
                ' ',
              );

              return (
                <Box key={model.id || absoluteIdx} flexDirection="row">
                  <Text
                    color={isActive ? Colors.AccentBlue : Colors.Gray}
                    dimColor={!isActive}
                  >
                    {isActive ? '>' : ' '}
                  </Text>
                  <Text
                    color={isActive ? Colors.AccentBlue : Colors.Gray}
                    dimColor={!isActive}
                  >
                    {nameCell}
                  </Text>
                  <Text>{separator}</Text>
                  <Text
                    color={isActive ? Colors.AccentBlue : Colors.Gray}
                    dimColor={!isActive}
                  >
                    {inputPriceCell}
                  </Text>
                  <Text>{separator}</Text>
                  <Text
                    color={isActive ? Colors.AccentBlue : Colors.Gray}
                    dimColor={!isActive}
                  >
                    {outputPriceCell}
                  </Text>
                  <Text>{separator}</Text>
                  <Text
                    color={isActive ? Colors.AccentBlue : Colors.Gray}
                    dimColor={!isActive}
                  >
                    {contextCell}
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
          {models.length} model{models.length !== 1 ? 's' : ''} available
        </Text>
      </Box>

      {!loading && models.length > 0 && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>
            All models will be saved for quick switching with the 'model'
            command.
          </Text>
        </Box>
      )}
    </LeftBorderPanel>
  );
};

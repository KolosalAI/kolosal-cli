/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import type { AvailableModel } from '../models/availableModels.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  getDownloadStatusPresentation,
  type DownloadDisplayState,
} from '../utils/downloadDisplay.js';
import type { SavedModelDownloadState } from '../../config/savedModels.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function toDisplayState(
  state: SavedModelDownloadState | undefined,
): DownloadDisplayState | undefined {
  if (!state) {
    return undefined;
  }

  let percentage: number | undefined;
  if (typeof state.progress === 'number') {
    percentage = Math.max(0, Math.min(100, state.progress * 100));
  } else if (
    typeof state.bytesDownloaded === 'number' &&
    typeof state.totalBytes === 'number' &&
    state.totalBytes > 0
  ) {
    percentage = Math.max(
      0,
      Math.min(100, (state.bytesDownloaded / state.totalBytes) * 100),
    );
  }

  return {
    status: state.status,
    percentage,
    error: state.error,
    downloadId: state.downloadId,
  };
}

export interface ModelSelectionDialogProps {
  availableModels: AvailableModel[];
  currentModel: string;
  onSelect: (model: AvailableModel) => void;
  onCancel: () => void;
}

export const ModelSelectionDialog: React.FC<ModelSelectionDialogProps> = ({
  availableModels,
  currentModel,
  onSelect,
  onCancel,
}) => {
  const { columns } = useTerminalSize();
  const [spinnerIndex, setSpinnerIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSpinnerIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 120);
    return () => {
      clearInterval(interval);
    };
  }, []);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onCancel();
      }
    },
    { isActive: true },
  );

  const listWidth = Math.max(40, Math.floor(columns * 0.8) - 6);
  const separator = '  ';
  const statusColumnWidth = Math.max(
    12,
    Math.min(22, Math.floor(listWidth * 0.3)),
  );
  const nameColumnWidth = Math.max(
    10,
    listWidth - statusColumnWidth - separator.length,
  );

  const spinnerFrame = SPINNER_FRAMES[spinnerIndex];

  const options: Array<RadioSelectItem<AvailableModel>> = useMemo(
    () =>
      availableModels.map((model) => {
        const runtimeId = model.runtimeId ?? model.id;
        const visionIndicator = model.isVision ? ' [Vision]' : '';
        const currentIndicator = runtimeId === currentModel ? ' (current)' : '';
        const baseName = `${model.label}${visionIndicator}${currentIndicator}`;
        const needsEllipsis = baseName.length > nameColumnWidth;
        const truncatedName = needsEllipsis
          ? baseName.slice(0, Math.max(0, nameColumnWidth - 1)) + '…'
          : baseName;
        const nameCell = truncatedName.padEnd(nameColumnWidth, ' ');

        const downloadState =
          model.downloadState ?? model.savedModel?.downloadState;
        const displayState = toDisplayState(downloadState);

        const statusPresentation =
          model.provider === 'oss-local'
            ? getDownloadStatusPresentation(displayState, spinnerFrame)
            : {
                label: 'Online ✓',
                color: Colors.AccentGreen,
              };

        const statusNeedsEllipsis =
          statusPresentation.label.length > statusColumnWidth;
        const truncatedStatus = statusNeedsEllipsis
          ? statusPresentation.label.slice(
              0,
              Math.max(0, statusColumnWidth - 1),
            ) + '…'
          : statusPresentation.label;
        const statusCell = truncatedStatus.padEnd(statusColumnWidth, ' ');

        const disabled =
          model.provider === 'oss-local' &&
          downloadState !== undefined &&
          downloadState.status !== 'completed';

        const label = `${baseName} — ${statusPresentation.label}`;

        return {
          label,
          value: model,
          disabled,
          renderLabel: ({ isSelected, isDisabled }) => {
            const baseColor = isSelected
              ? Colors.AccentGreen
              : isDisabled
                ? Colors.Gray
                : Colors.Foreground;
            return (
              <Box flexDirection="row">
                <Text color={baseColor} dimColor={!isSelected && isDisabled}>
                  {nameCell}
                </Text>
                <Text>{separator}</Text>
                <Text
                  color={statusPresentation.color}
                  dimColor={!isSelected && isDisabled}
                >
                  {statusCell}
                </Text>
              </Box>
            );
          },
        } satisfies RadioSelectItem<AvailableModel>;
      }),
    [
      availableModels,
      currentModel,
      nameColumnWidth,
      separator,
      spinnerFrame,
      statusColumnWidth,
    ],
  );

  const initialIndex = Math.max(
    0,
    availableModels.findIndex(
      (model) => (model.runtimeId ?? model.id) === currentModel,
    ),
  );

  const handleSelect = (model: AvailableModel) => {
    onSelect(model);
  };

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
        <Text bold>Select Model</Text>
        <Text>Choose a model for this session:</Text>
      </Box>

      <Box marginBottom={1}>
        <RadioButtonSelect
          items={options}
          initialIndex={initialIndex}
          onSelect={handleSelect}
          isFocused
        />
      </Box>

      <Box>
        <Text color={Colors.Gray}>Press Enter to select, Esc to cancel</Text>
      </Box>
    </LeftBorderPanel>
  );
};

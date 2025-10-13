/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolConfirmationOutcome } from '@kolosal-ai/kolosal-ai-core';
import { Box, Text } from 'ink';
import type React from 'react';
import { Colors } from '../colors.js';
import { RenderInline } from '../utils/InlineMarkdownRenderer.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

export interface ShellConfirmationRequest {
  commands: string[];
  onConfirm: (
    outcome: ToolConfirmationOutcome,
    approvedCommands?: string[],
  ) => void;
}

export interface ShellConfirmationDialogProps {
  request: ShellConfirmationRequest;
}

export const ShellConfirmationDialog: React.FC<
  ShellConfirmationDialogProps
> = ({ request }) => {
  const { commands, onConfirm } = request;

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onConfirm(ToolConfirmationOutcome.Cancel);
      }
    },
    { isActive: true },
  );

  const handleSelect = (item: ToolConfirmationOutcome) => {
    if (item === ToolConfirmationOutcome.Cancel) {
      onConfirm(item);
    } else {
      // For both ProceedOnce and ProceedAlways, we approve all the
      // commands that were requested.
      onConfirm(item, commands);
    }
  };

  const options: Array<RadioSelectItem<ToolConfirmationOutcome>> = [
    {
      label: 'Yes, allow once',
      value: ToolConfirmationOutcome.ProceedOnce,
    },
    {
      label: 'Yes, allow always for this session',
      value: ToolConfirmationOutcome.ProceedAlways,
    },
    {
      label: 'No (esc)',
      value: ToolConfirmationOutcome.Cancel,
    },
  ];

  return (
    <LeftBorderPanel
      accentColor={Colors.AccentYellow}
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
        <Text bold>Shell Command Execution</Text>
        <Text>A custom command wants to run the following shell commands:</Text>
        <LeftBorderPanel
          accentColor={Colors.Gray}
          backgroundColor={getPanelBackgroundColor()}
          marginTop={1}
          contentProps={{
            flexDirection: 'column',
            paddingLeft: 1,
            paddingRight: 1,
            paddingTop: 1,
            paddingBottom: 1,
          }}
        >
          {commands.map((cmd) => (
            <Text key={cmd} color={Colors.AccentCyan}>
              <RenderInline text={cmd} />
            </Text>
          ))}
        </LeftBorderPanel>
      </Box>

      <Box marginBottom={1}>
        <Text>Do you want to proceed?</Text>
      </Box>

      <RadioButtonSelect items={options} onSelect={handleSelect} isFocused />
    </LeftBorderPanel>
  );
};

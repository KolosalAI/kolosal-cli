/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { RadioButtonSelect, type RadioSelectItem } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

export type AuthSelectionChoice = 'login' | 'hf' | 'openai';

interface AuthSelectionDialogProps {
  defaultChoice: AuthSelectionChoice;
  initialErrorMessage?: string | null;
  onSelect: (choice: AuthSelectionChoice) => void;
  onCancel: () => void;
  canCancel: boolean;
}

export const AuthSelectionDialog: React.FC<AuthSelectionDialogProps> = ({
  defaultChoice,
  initialErrorMessage,
  onSelect,
  onCancel,
  canCancel,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape' && canCancel) {
        onCancel();
      }
    },
    { isActive: true },
  );

  const options: Array<RadioSelectItem<AuthSelectionChoice>> = [
    {
      label: 'Login (Kolosal Cloud OAuth)',
      value: 'login',
    },
    {
      label: 'Use local open-source model (Hugging Face)',
      value: 'hf',
    },
    {
      label: 'Use OpenAI Compatible API',
      value: 'openai',
    },
  ];

  const initialIndex = Math.max(0, options.findIndex((option) => option.value === defaultChoice));

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
          Choose how you want to connect
        </Text>
        <Text>Pick a model provider to continue.</Text>
      </Box>
      <Box marginBottom={1}>
        <RadioButtonSelect
          items={options}
          initialIndex={initialIndex}
          onSelect={(choice) => {
            onSelect(choice);
          }}
          isFocused
        />
      </Box>
      {initialErrorMessage ? (
        <Box marginBottom={1}>
          <Text color={Colors.AccentRed}>{initialErrorMessage}</Text>
        </Box>
      ) : null}
      <Box>
        <Text color={Colors.Gray}>
          {canCancel ? 'Press Enter to choose, Esc to cancel' : 'Press Enter to choose'}
        </Text>
      </Box>
    </LeftBorderPanel>
  );
};

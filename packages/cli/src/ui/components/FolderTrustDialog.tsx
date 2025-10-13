/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { Colors } from '../colors.js';
import type { RadioSelectItem } from './shared/RadioButtonSelect.js';
import { RadioButtonSelect } from './shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import * as process from 'node:process';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

export enum FolderTrustChoice {
  TRUST_FOLDER = 'trust_folder',
  TRUST_PARENT = 'trust_parent',
  DO_NOT_TRUST = 'do_not_trust',
}

interface FolderTrustDialogProps {
  onSelect: (choice: FolderTrustChoice) => void;
  isRestarting?: boolean;
}

export const FolderTrustDialog: React.FC<FolderTrustDialogProps> = ({
  onSelect,
  isRestarting,
}) => {
  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        onSelect(FolderTrustChoice.DO_NOT_TRUST);
      }
    },
    { isActive: !isRestarting },
  );

  useKeypress(
    (key) => {
      if (key.name === 'r') {
        process.exit(0);
      }
    },
    { isActive: !!isRestarting },
  );

  const options: Array<RadioSelectItem<FolderTrustChoice>> = [
    {
      label: 'Trust folder',
      value: FolderTrustChoice.TRUST_FOLDER,
    },
    {
      label: 'Trust parent folder',
      value: FolderTrustChoice.TRUST_PARENT,
    },
    {
      label: "Don't trust (esc)",
      value: FolderTrustChoice.DO_NOT_TRUST,
    },
  ];

  return (
    <Box flexDirection="column">
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
          <Text bold>Do you trust this folder?</Text>
          <Text>
            Trusting a folder allows Kolosal Cli to execute commands it suggests.
            This is a security feature to prevent accidental execution in
            untrusted directories.
          </Text>
        </Box>

        <RadioButtonSelect
          items={options}
          onSelect={onSelect}
          isFocused={!isRestarting}
        />
      </LeftBorderPanel>
      {isRestarting && (
        <Box marginLeft={1} marginTop={1}>
          <Text color={Colors.AccentYellow}>
            To see changes, Kolosal Cli must be restarted. Press r to exit and
            apply changes now.
          </Text>
        </Box>
      )}
    </Box>
  );
};

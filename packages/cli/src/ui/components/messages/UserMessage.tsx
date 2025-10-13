/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Text, Box } from 'ink';
import { Colors } from '../../colors.js';
import { SCREEN_READER_USER_PREFIX } from '../../textConstants.js';
import { isSlashCommand as checkIsSlashCommand } from '../../utils/commandUtils.js';

interface UserMessageProps {
  text: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ text }) => {
  const prefix = '> ';
  const prefixWidth = prefix.length;
  const isSlashCommand = checkIsSlashCommand(text);

  const textColor = isSlashCommand ? Colors.AccentPurple : Colors.AccentYellow;
  const borderColor = isSlashCommand ? Colors.AccentPurple : Colors.AccentYellow;

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      paddingY={0}
      marginTop={1}
      marginBottom={1}
      flexDirection="row"
    >
      <Box width={prefixWidth} marginRight={1}>
        <Text color={textColor} aria-label={SCREEN_READER_USER_PREFIX}>
          {prefix}
        </Text>
      </Box>
      <Box flexGrow={1}>
        <Text wrap="wrap" color={textColor}>
          {text}
        </Text>
      </Box>
    </Box>
  );
};

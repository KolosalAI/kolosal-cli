/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Text } from 'ink';
import { Colors } from '../colors.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

interface UpdateNotificationProps {
  message: string;
}

export const UpdateNotification = ({ message }: UpdateNotificationProps) => (
  <LeftBorderPanel
    accentColor={Colors.AccentYellow}
    backgroundColor={getPanelBackgroundColor()}
    marginTop={1}
    marginBottom={1}
    contentProps={{
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 1,
      paddingBottom: 1,
    }}
  >
    <Text color={Colors.AccentYellow}>{message}</Text>
  </LeftBorderPanel>
);

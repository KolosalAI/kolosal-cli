/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { GIT_COMMIT_INFO } from '../../generated/git-commit.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

interface AboutBoxProps {
  cliVersion: string;
  osVersion: string;
  sandboxEnv: string;
  modelVersion: string;
  selectedAuthType: string;
  gcpProject: string;
  ideClient: string;
}

export const AboutBox: React.FC<AboutBoxProps> = ({
  cliVersion,
  osVersion,
  sandboxEnv,
  modelVersion,
  selectedAuthType,
  gcpProject,
  ideClient,
}) => (
  <LeftBorderPanel
    accentColor={Colors.Gray}
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
    <Box marginBottom={1}>
      <Text bold color={Colors.AccentPurple}>
        About Kolosal Cli
      </Text>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          CLI Version
        </Text>
      </Box>
      <Box>
        <Text>{cliVersion}</Text>
      </Box>
    </Box>
    {GIT_COMMIT_INFO && !['N/A'].includes(GIT_COMMIT_INFO) && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={Colors.LightBlue}>
            Git Commit
          </Text>
        </Box>
        <Box>
          <Text>{GIT_COMMIT_INFO}</Text>
        </Box>
      </Box>
    )}
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Model
        </Text>
      </Box>
      <Box>
        <Text>{modelVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Sandbox
        </Text>
      </Box>
      <Box>
        <Text>{sandboxEnv}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          OS
        </Text>
      </Box>
      <Box>
        <Text>{osVersion}</Text>
      </Box>
    </Box>
    <Box flexDirection="row">
      <Box width="35%">
        <Text bold color={Colors.LightBlue}>
          Auth Method
        </Text>
      </Box>
      <Box>
        <Text>
          {selectedAuthType.startsWith('oauth') ? 'OAuth' : selectedAuthType}
        </Text>
      </Box>
    </Box>
    {gcpProject && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={Colors.LightBlue}>
            GCP Project
          </Text>
        </Box>
        <Box>
          <Text>{gcpProject}</Text>
        </Box>
      </Box>
    )}
    {ideClient && (
      <Box flexDirection="row">
        <Box width="35%">
          <Text bold color={Colors.LightBlue}>
            IDE Client
          </Text>
        </Box>
        <Box>
          <Text>{ideClient}</Text>
        </Box>
      </Box>
    )}
  </LeftBorderPanel>
);

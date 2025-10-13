/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { LeftBorderPanel } from './shared/LeftBorderPanel.js';
import { getPanelBackgroundColor } from './shared/panelStyles.js';

interface OpenAIKeyPromptProps {
  onSubmit: (apiKey: string, baseUrl: string, model: string) => void;
  onCancel: () => void;
}

export function OpenAIKeyPrompt({
  onSubmit,
  onCancel,
}: OpenAIKeyPromptProps): React.JSX.Element {
  const [currentField, setCurrentField] = useState<'baseUrl' | 'model' | 'apiKey'>('baseUrl');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  
  const baseUrlRef = useRef(baseUrl);
  const modelRef = useRef(model);
  const apiKeyRef = useRef(apiKey);

  useInput((input, key) => {
    // Handle arrow keys for navigation
    if (key.upArrow) {
      if (currentField === 'model') {
        setCurrentField('baseUrl');
      } else if (currentField === 'apiKey') {
        setCurrentField('model');
      }
      return;
    }

    if (key.downArrow) {
      if (currentField === 'baseUrl') {
        setCurrentField('model');
      } else if (currentField === 'model') {
        setCurrentField('apiKey');
      }
      return;
    }

    // Filter paste-related control sequences
    let cleanInput = (input || '')
      .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex
      .replace(/\[200~/g, '')
      .replace(/\[201~/g, '')
      .replace(/^\[|~$/g, '');

    // Filter invisible characters (ASCII < 32, except newline)
    cleanInput = cleanInput
      .split('')
      .filter((ch) => ch.charCodeAt(0) >= 32)
      .join('');

    if (cleanInput.length > 0) {
      if (currentField === 'baseUrl') {
        baseUrlRef.current = `${baseUrlRef.current}${cleanInput}`;
        setBaseUrl(baseUrlRef.current);
      } else if (currentField === 'model') {
        modelRef.current = `${modelRef.current}${cleanInput}`;
        setModel(modelRef.current);
      } else if (currentField === 'apiKey') {
        apiKeyRef.current = `${apiKeyRef.current}${cleanInput}`;
        setApiKey(apiKeyRef.current);
      }
      return;
    }

    // Check if Enter key pressed
    if (input.includes('\n') || input.includes('\r')) {
      if (currentField === 'baseUrl') {
        setCurrentField('model');
      } else if (currentField === 'model') {
        setCurrentField('apiKey');
      } else if (currentField === 'apiKey') {
        const trimmedApiKey = apiKeyRef.current.trim();
        const trimmedBaseUrl = baseUrlRef.current.trim();
        const trimmedModel = modelRef.current.trim();
        if (trimmedApiKey && trimmedBaseUrl && trimmedModel) {
          onSubmit(trimmedApiKey, trimmedBaseUrl, trimmedModel);
        }
      }
      return;
    }

    if (key.escape) {
      onCancel();
      return;
    }

    // Handle backspace
    if (key.backspace || key.delete) {
      if (currentField === 'baseUrl') {
        baseUrlRef.current = baseUrlRef.current.slice(0, -1);
        setBaseUrl(baseUrlRef.current);
      } else if (currentField === 'model') {
        modelRef.current = modelRef.current.slice(0, -1);
        setModel(modelRef.current);
      } else if (currentField === 'apiKey') {
        apiKeyRef.current = apiKeyRef.current.slice(0, -1);
        setApiKey(apiKeyRef.current);
      }
      return;
    }
  });

  return (
    <LeftBorderPanel
      accentColor="yellow"
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
      <Text bold color={Colors.AccentBlue}>
        OpenAI Compatible API Configuration
      </Text>
      <Box marginTop={1}>
        <Text>
          Please enter your OpenAI-compatible API configuration to continue.
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text color={currentField === 'baseUrl' ? Colors.AccentBlue : Colors.Gray}>
            Base URL:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={currentField === 'baseUrl' ? 'white' : Colors.Gray}>
            {currentField === 'baseUrl' ? `> ${baseUrl || ' '}` : baseUrl || '(not set)'}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text color={currentField === 'model' ? Colors.AccentBlue : Colors.Gray}>
            Model:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={currentField === 'model' ? 'white' : Colors.Gray}>
            {currentField === 'model' ? `> ${model || ' '}` : model || '(not set)'}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box width={12}>
          <Text color={currentField === 'apiKey' ? Colors.AccentBlue : Colors.Gray}>
            API Key:
          </Text>
        </Box>
        <Box flexGrow={1}>
          <Text color={currentField === 'apiKey' ? 'white' : Colors.Gray}>
            {currentField === 'apiKey' ? `> ${apiKey || ' '}` : apiKey || '(not set)'}
          </Text>
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={Colors.Gray}>
          Use ↑/↓ to navigate, Enter to continue, Esc to cancel
        </Text>
      </Box>
    </LeftBorderPanel>
  );
}

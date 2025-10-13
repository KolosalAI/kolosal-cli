/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import { Box, Text } from 'ink';
import {
  setOpenAIApiKey,
  setOpenAIBaseUrl,
  setOpenAIModel,
} from '../../config/auth.js';
import { type LoadedSettings, SettingScope } from '../../config/settings.js';
import { Colors } from '../colors.js';
import { OpenAIKeyPrompt } from './OpenAIKeyPrompt.js';

interface AuthDialogProps {
  onSelect: (authMethod: AuthType | undefined, scope: SettingScope) => void;
  settings: LoadedSettings;
  initialErrorMessage?: string | null;
  onCancel: () => void;
  onModelConfigured?: (
    config: { model?: string; baseUrl?: string; apiKey?: string },
  ) => void | Promise<void>;
}

// Removed OAuth and selection flow; prompt for OpenAI details directly

export function AuthDialog({
  onSelect,
  onCancel,
  settings,
  initialErrorMessage,
  onModelConfigured,
}: AuthDialogProps): React.JSX.Element {
  const errorMessage = initialErrorMessage || null;

  const handleOpenAIKeySubmit = (
    apiKey: string,
    baseUrl: string,
    model: string,
  ) => {
    // Set env for current session immediately
    setOpenAIApiKey(apiKey);
    if (baseUrl) setOpenAIBaseUrl(baseUrl);
    if (model) setOpenAIModel(model);

    // Persist to user settings so it survives restarts
    try {
      // Don't save apiKey/baseUrl globally - they'll be in saved models
      // Don't save selectedAuthType globally - it's per-model now in authType field
      if (model) settings.setValue(SettingScope.User, 'model.name', model);
    } catch (e) {
      // If persisting fails, still proceed with in-memory values
    }

  void onModelConfigured?.({ model, baseUrl: baseUrl || undefined, apiKey });

    onSelect(AuthType.USE_OPENAI, SettingScope.User);
  };

  const handleOpenAIKeyCancel = () => {
    onCancel();
  };

  // Directly prompt for OpenAI configuration
  return (
    <Box flexDirection="column" width="100%">
      <OpenAIKeyPrompt
        onSubmit={handleOpenAIKeySubmit}
        onCancel={handleOpenAIKeyCancel}
      />
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
    </Box>
  );
}

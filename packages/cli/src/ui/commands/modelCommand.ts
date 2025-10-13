/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@kolosal-ai/kolosal-ai-core';
import type {
  SlashCommand,
  CommandContext,
  OpenDialogActionReturn,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import {
  getOpenAIAvailableModelFromEnv,
  type AvailableModel,
} from '../models/availableModels.js';
import type { SavedModelEntry } from '../../config/savedModels.js';

function getAvailableModelsForAuthType(authType: AuthType): AvailableModel[] {
  switch (authType) {
    case AuthType.USE_OPENAI: {
      const openAIModel = getOpenAIAvailableModelFromEnv();
      return openAIModel ? [openAIModel] : [];
    }
    default:
      // For other auth types, return empty array for now
      // This can be expanded later according to the design doc
      return [];
  }
}

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Switch the model for this session',
  kind: CommandKind.BUILT_IN,
  action: async (
    context: CommandContext,
  ): Promise<OpenDialogActionReturn | MessageActionReturn> => {
    const { services } = context;
    const { config, settings } = services;

    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not available.',
      };
    }

    const contentGeneratorConfig = config.getContentGeneratorConfig();
    if (!contentGeneratorConfig) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Content generator configuration not available.',
      };
    }

    const authType = contentGeneratorConfig.authType;
    if (!authType) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Authentication type not available.',
      };
    }

    const savedModels =
      (settings.merged.model?.savedModels ?? []) as SavedModelEntry[];
    const providerFromSettings =
      settings.merged.contentGenerator?.provider as
        | SavedModelEntry['provider']
        | undefined;
    const providerFromAuth: SavedModelEntry['provider'] | undefined =
      authType === AuthType.USE_OPENAI
        ? 'openai-compatible'
        : (authType as SavedModelEntry['provider']);

    const effectiveProvider = providerFromSettings ?? providerFromAuth;
    const savedForProvider = savedModels.filter((entry) => {
      if (!effectiveProvider) {
        return true;
      }
      return entry.provider === effectiveProvider;
    });

    let hasModels = savedForProvider.length > 0;
    if (!hasModels) {
      const fallbackModels = getAvailableModelsForAuthType(authType);
      hasModels = fallbackModels.length > 0;
    }

    if (!hasModels) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'No saved models are available yet. Authenticate or select a model first, then try /model again.',
      };
    }

    // Trigger model selection dialog
    return {
      type: 'dialog',
      dialog: 'model',
    };
  },
};

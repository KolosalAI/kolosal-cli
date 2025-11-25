/**
 * @license
 * Copyright 2025 Kolosal
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  OpenDialogActionReturn,
  MessageActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import type { SavedModelEntry } from '../../config/savedModels.js';

const KOLOSAL_API_BASE_URL = 'https://api.kolosal.ai/v1';

function isKolosalCloudModel(entry: SavedModelEntry): boolean {
  return (
    entry.id.startsWith('kolosal-') ||
    entry.label?.endsWith('(Kolosal Cloud)') ||
    entry.baseUrl === KOLOSAL_API_BASE_URL
  );
}

export const modelDeleteCommand: SlashCommand = {
  name: 'model-delete',
  altNames: ['delete-model'],
  description: 'Delete a saved custom model',
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

    const savedModels =
      (settings.merged.model?.savedModels ?? []) as SavedModelEntry[];

    if (!savedModels || savedModels.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'No saved models found. Nothing to delete.',
      };
    }

    const currentModel = config.getModel();
    const deletableModels = savedModels.filter((entry) => {
      // Exclude Kolosal Cloud models
      if (isKolosalCloudModel(entry)) {
        return false;
      }
      // Exclude currently active model
      const runtimeId = entry.runtimeModelId ?? entry.id;
      return runtimeId !== currentModel;
    });

    if (deletableModels.length === 0) {
      return {
        type: 'message',
        messageType: 'error',
        content:
          'No deletable models found. The currently active model cannot be deleted. Switch to a different model first.',
      };
    }

    // Trigger model delete selection dialog
    return {
      type: 'dialog',
      dialog: 'model_delete',
    };
  },
};


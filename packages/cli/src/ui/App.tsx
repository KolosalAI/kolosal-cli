/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Box,
  type DOMElement,
  measureElement,
  Static,
  Text,
  useStdin,
  useStdout,
} from 'ink';
import {
  StreamingState,
  type HistoryItem,
  MessageType,
  ToolCallStatus,
  type HistoryItemWithoutId,
} from './types.js';
import { useTerminalSize } from './hooks/useTerminalSize.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import { useLoadingIndicator } from './hooks/useLoadingIndicator.js';
import { useThemeCommand } from './hooks/useThemeCommand.js';
import { useAuthCommand } from './hooks/useAuthCommand.js';
import { useFolderTrust } from './hooks/useFolderTrust.js';
import { useEditorSettings } from './hooks/useEditorSettings.js';
import { useQuitConfirmation } from './hooks/useQuitConfirmation.js';
import { useWelcomeBack } from './hooks/useWelcomeBack.js';
import { useDialogClose } from './hooks/useDialogClose.js';
import { useSlashCommandProcessor } from './hooks/slashCommandProcessor.js';
import { useSubagentCreateDialog } from './hooks/useSubagentCreateDialog.js';
import { useAgentsManagerDialog } from './hooks/useAgentsManagerDialog.js';
import { useAutoAcceptIndicator } from './hooks/useAutoAcceptIndicator.js';
import { useMessageQueue } from './hooks/useMessageQueue.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { Header } from './components/Header.js';
import { LoadingIndicator } from './components/LoadingIndicator.js';
import { AutoAcceptIndicator } from './components/AutoAcceptIndicator.js';
import { ShellModeIndicator } from './components/ShellModeIndicator.js';
import { InputPrompt } from './components/InputPrompt.js';
import { Footer } from './components/Footer.js';
import { ThemeDialog } from './components/ThemeDialog.js';
import { AuthDialog } from './components/AuthDialog.js';
import {
  AuthSelectionDialog,
  type AuthSelectionChoice,
} from './components/AuthSelectionDialog.js';
import { AuthInProgress } from './components/AuthInProgress.js';
import { OAuthDeviceFlow } from './components/OAuthDeviceFlow.js';
import { KolosalModelPickerDialog } from './components/KolosalModelPickerDialog.js';
import { EditorSettingsDialog } from './components/EditorSettingsDialog.js';
import { FolderTrustDialog } from './components/FolderTrustDialog.js';
import { ShellConfirmationDialog } from './components/ShellConfirmationDialog.js';
import { QuitConfirmationDialog } from './components/QuitConfirmationDialog.js';
import { RadioButtonSelect } from './components/shared/RadioButtonSelect.js';
import { ModelSelectionDialog } from './components/ModelSelectionDialog.js';
import {
  ModelDeleteConfirmationDialog,
  ModelDeleteChoice,
} from './components/ModelDeleteConfirmationDialog.js';
import { HfModelPickerDialog } from './components/HfModelPickerDialog.js';
import {
  HfModelFilePickerDialog,
  type FileDownloadDisplayState,
} from './components/HfModelFilePickerDialog.js';
import type { GroupedFile } from '../services/huggingfaceApi.js';
import {
  ModelDownloadManager,
  type DownloadProgressEvent,
} from '../services/downloads/index.js';
import {
  ModelSwitchDialog,
  type VisionSwitchOutcome,
} from './components/ModelSwitchDialog.js';
import {
  getOpenAIAvailableModelFromEnv,
  getFilteredQwenModels,
  type AvailableModel,
} from './models/availableModels.js';
import { processVisionSwitchOutcome } from './hooks/useVisionAutoSwitch.js';
import {
  AgentCreationWizard,
  AgentsManagerDialog,
} from './components/subagents/index.js';
import { Colors } from './colors.js';
import { LeftBorderPanel } from './components/shared/LeftBorderPanel.js';
import { loadHierarchicalGeminiMemory } from '../config/config.js';
import type { LoadedSettings } from '../config/settings.js';
import { SettingScope } from '../config/settings.js';
import { ConsolePatcher } from './utils/ConsolePatcher.js';
import { registerCleanup } from '../utils/cleanup.js';
import { DetailedMessagesDisplay } from './components/DetailedMessagesDisplay.js';
import { HistoryItemDisplay } from './components/HistoryItemDisplay.js';
import { ContextSummaryDisplay } from './components/ContextSummaryDisplay.js';
import { useHistory } from './hooks/useHistoryManager.js';
import process from 'node:process';
import type { EditorType, Config, IdeContext } from '@kolosal-ai/kolosal-ai-core';
import {
  ApprovalMode,
  getAllGeminiMdFilenames,
  isEditorAvailable,
  getErrorMessage,
  AuthType,
  logFlashFallback,
  FlashFallbackEvent,
  ideContext,
  isProQuotaExceededError,
  isGenericQuotaExceededError,
  UserTierId,
  Storage,
} from '@kolosal-ai/kolosal-ai-core';
import type { IdeIntegrationNudgeResult } from './IdeIntegrationNudge.js';
import { IdeIntegrationNudge } from './IdeIntegrationNudge.js';
import {
  setOpenAIBaseUrl,
  setOpenAIModel,
  setOpenAIApiKey,
  setKolosalOAuthToken,
  validateAuthMethod,
} from '../config/auth.js';
import {
  registerModelWithServer,
  type RegisterModelResult,
} from '../services/kolosalServerClient.js';
import {
  fetchKolosalModels,
  type KolosalModel,
} from '../services/kolosalApi.js';
import { useLogger } from './hooks/useLogger.js';
import { StreamingContext } from './contexts/StreamingContext.js';
import {
  SessionStatsProvider,
  useSessionStats,
} from './contexts/SessionContext.js';
import { useGitBranchName } from './hooks/useGitBranchName.js';
import { useFocus } from './hooks/useFocus.js';
import { useBracketedPaste } from './hooks/useBracketedPaste.js';
import { useTextBuffer } from './components/shared/text-buffer.js';
import { useVimMode, VimModeProvider } from './contexts/VimModeContext.js';
import { useVim } from './hooks/vim.js';
import type { Key } from './hooks/useKeypress.js';
import { useKeypress } from './hooks/useKeypress.js';
import { KeypressProvider } from './contexts/KeypressContext.js';
import { useKittyKeyboardProtocol } from './hooks/useKittyKeyboardProtocol.js';
import { keyMatchers, Command } from './keyMatchers.js';
import {
  upsertSavedModelEntry,
  removeSavedModelEntry,
  getCurrentModelAuthType,
  deriveOpenAIEnvConfig,
  findKolosalApiKey,
  type SavedModelDownloadState,
  type SavedModelEntry,
} from '../config/savedModels.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UpdateNotification } from './components/UpdateNotification.js';
import type { UpdateObject } from './utils/updateCheck.js';
import ansiEscapes from 'ansi-escapes';
import { OverflowProvider } from './contexts/OverflowContext.js';
import { ShowMoreLines } from './components/ShowMoreLines.js';
import { PrivacyNotice } from './privacy/PrivacyNotice.js';
import { useSettingsCommand } from './hooks/useSettingsCommand.js';
import { SettingsDialog } from './components/SettingsDialog.js';
import { setUpdateHandler } from '../utils/handleAutoUpdate.js';
import { appEvents, AppEvent } from '../utils/events.js';
import { isNarrowWidth } from './utils/isNarrowWidth.js';
import { useWorkspaceMigration } from './hooks/useWorkspaceMigration.js';
import { WorkspaceMigrationDialog } from './components/WorkspaceMigrationDialog.js';
import { WelcomeBackDialog } from './components/WelcomeBackDialog.js';
import {
  pushDialog as pushDialogInStack,
  removeDialog as removeDialogFromStack,
  previousDialog,
  type DialogId,
} from './utils/dialogStack.js';
import { deriveServerModelId, getKolosalServerBaseUrl } from '../utils/modelIdentifiers.js';

// Maximum number of queued messages to display in UI to prevent performance issues
const MAX_DISPLAYED_QUEUED_MESSAGES = 3;

interface AppProps {
  config: Config;
  settings: LoadedSettings;
  startupWarnings?: string[];
  version: string;
}

interface DownloadAssociation {
  savedModelId: string;
  destinationDir: string;
  primaryFilename: string;
  sourceModelId: string;
  displayName: string;
  runtimeModelId: string;
}

function isToolExecuting(pendingHistoryItems: HistoryItemWithoutId[]) {
  return pendingHistoryItems.some((item) => {
    if (item && item.type === 'tool_group') {
      return item.tools.some(
        (tool) => ToolCallStatus.Executing === tool.status,
      );
    }
    return false;
  });
}

export const AppWrapper = (props: AppProps) => {
  const kittyProtocolStatus = useKittyKeyboardProtocol();
  const nodeMajorVersion = parseInt(process.versions.node.split('.')[0], 10);
  return (
    <KeypressProvider
      kittyProtocolEnabled={kittyProtocolStatus.enabled}
      pasteWorkaround={process.platform === 'win32' || nodeMajorVersion < 20}
      config={props.config}
      debugKeystrokeLogging={
        props.settings.merged.general?.debugKeystrokeLogging
      }
    >
      <SessionStatsProvider>
        <VimModeProvider settings={props.settings}>
          <App {...props} />
        </VimModeProvider>
      </SessionStatsProvider>
    </KeypressProvider>
  );
};

const KOLOSAL_API_BASE_URL = 'https://api.kolosal.ai/v1';

const App = ({ config, settings, startupWarnings = [], version }: AppProps) => {
  const isFocused = useFocus();
  useBracketedPaste();
  const [updateInfo, setUpdateInfo] = useState<UpdateObject | null>(null);
  const { stdout } = useStdout();
  const nightly = version.includes('nightly');
  const { history, addItem, clearItems, loadHistory } = useHistory();

  const [idePromptAnswered, setIdePromptAnswered] = useState(false);
  const currentIDE = config.getIdeClient().getCurrentIde();
  useEffect(() => {
    registerCleanup(() => config.getIdeClient().disconnect());
  }, [config]);
  const shouldShowIdePrompt =
    currentIDE &&
    !config.getIdeMode() &&
    !settings.merged.ide?.hasSeenNudge &&
    !idePromptAnswered;

  useEffect(() => {
    const cleanup = setUpdateHandler(addItem, setUpdateInfo);
    return cleanup;
  }, [addItem]);

  const {
    consoleMessages,
    handleNewMessage,
    clearConsoleMessages: clearConsoleMessagesState,
  } = useConsoleMessages();

  useEffect(() => {
    const consolePatcher = new ConsolePatcher({
      onNewMessage: handleNewMessage,
      debugMode: config.getDebugMode(),
    });
    consolePatcher.patch();
    registerCleanup(consolePatcher.cleanup);
  }, [handleNewMessage, config]);

  const { stats: sessionStats } = useSessionStats();
  const [staticNeedsRefresh, setStaticNeedsRefresh] = useState(false);
  const [staticKey, setStaticKey] = useState(0);
  const refreshStatic = useCallback(() => {
    stdout.write(ansiEscapes.clearTerminal);
    setStaticKey((prev) => prev + 1);
  }, [setStaticKey, stdout]);

  const [geminiMdFileCount, setGeminiMdFileCount] = useState<number>(0);
  const [debugMessage, setDebugMessage] = useState<string>('');
  const [themeError, setThemeError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [footerHeight, setFooterHeight] = useState<number>(0);
  const [corgiMode, setCorgiMode] = useState(false);
  const [isTrustedFolderState, setIsTrustedFolder] = useState(
    config.isTrustedFolder(),
  );
  const [currentModel, setCurrentModel] = useState(config.getModel());
  const [shellModeActive, setShellModeActive] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState<boolean>(false);
  const [showToolDescriptions, setShowToolDescriptions] =
    useState<boolean>(false);

  const [ctrlCPressedOnce, setCtrlCPressedOnce] = useState(false);
  const [quittingMessages, setQuittingMessages] = useState<
    HistoryItem[] | null
  >(null);
  const ctrlCTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [ctrlDPressedOnce, setCtrlDPressedOnce] = useState(false);
  const ctrlDTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [constrainHeight, setConstrainHeight] = useState<boolean>(true);
  const [showPrivacyNotice, setShowPrivacyNotice] = useState<boolean>(false);
  const [modelSwitchedFromQuotaError, setModelSwitchedFromQuotaError] =
    useState<boolean>(false);
  const [userTier, setUserTier] = useState<UserTierId | undefined>(undefined);
  const [ideContextState, setIdeContextState] = useState<
    IdeContext | undefined
  >();
  const [showEscapePrompt, setShowEscapePrompt] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const {
    showWorkspaceMigrationDialog,
    workspaceExtensions,
    onWorkspaceMigrationDialogOpen,
    onWorkspaceMigrationDialogClose,
  } = useWorkspaceMigration(settings);

  const downloadManagerRef = useRef(ModelDownloadManager.getInstance());
  const [downloadEvents, setDownloadEvents] = useState<
    Map<string, DownloadProgressEvent>
  >(new Map());
  const downloadAssociationsRef = useRef<Map<string, DownloadAssociation>>(
    new Map(),
  );
  const downloadPersistCacheRef = useRef<Map<string, number>>(new Map());
  const completedDownloadsRef = useRef<Set<string>>(new Set());

  // Model selection dialog states
  const [isModelSelectionDialogOpen, setIsModelSelectionDialogOpen] =
    useState(false);
  const [isModelDeleteDialogOpen, setIsModelDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<AvailableModel | null>(null);
  const [isHfPickerOpen, setIsHfPickerOpen] = useState(false);
  const [isHfFilePickerOpen, setIsHfFilePickerOpen] = useState(false);
  const [selectedHfModelId, setSelectedHfModelId] = useState<string | null>(null);
  const [isVisionSwitchDialogOpen, setIsVisionSwitchDialogOpen] =
    useState(false);
  const [visionSwitchResolver, setVisionSwitchResolver] = useState<{
    resolve: (result: {
      modelOverride?: string;
      persistSessionModel?: string;
      showGuidance?: boolean;
    }) => void;
    reject: () => void;
  } | null>(null);

  const [skipNextHfPickerAutoload, setSkipNextHfPickerAutoload] =
    useState(false);
  const [forceAuthDialogVisible, setForceAuthDialogVisible] = useState(false);
  const [authSelectionCompleted, setAuthSelectionCompleted] = useState(() => {
    const provider = settings.merged.contentGenerator?.provider as
      | string
      | undefined;
    if (provider === 'openai-compatible') {
      return true;
    }
    if (provider === 'oss-local') {
      const hfSelected = (settings.merged as any)?.contentGenerator?.huggingface
        ?.selectedModelId as string | undefined;
      return Boolean(hfSelected);
    }
    return false;
  });
  const [authFlowStage, setAuthFlowStage] = useState<
    'selection' | 'openai' | 'login' | 'kolosal-model-picker'
  >('selection');
  const [kolosalOAuthToken, setKolosalOAuthTokenState] = useState<string | null>(null);
  const [kolosalOAuthUser, setKolosalOAuthUser] = useState<{ id: string; email: string } | null>(null);

  // Load persisted OAuth token on startup
  const dialogStackRef = useRef<DialogId[]>([]);
  const needsHfSelectionRef = useRef(false);
  const previousProviderRef = useRef<string | undefined>(undefined);
  const previousHfModelIdRef = useRef<string | undefined>(undefined);

  const pushDialogStack = useCallback((dialog: DialogId) => {
    dialogStackRef.current = pushDialogInStack(
      dialogStackRef.current,
      dialog,
    );
  }, []);

  const removeDialogStack = useCallback((dialog: DialogId) => {
    dialogStackRef.current = removeDialogFromStack(
      dialogStackRef.current,
      dialog,
    );
  }, []);

  const getPreviousDialogFromStack = useCallback(
    (dialog: DialogId): DialogId | undefined =>
      previousDialog(dialogStackRef.current, dialog),
    [],
  );

  const getHfToken = useCallback((): string | undefined => {
    const envToken = process.env['HF_TOKEN']?.trim();
    if (envToken) {
      return envToken;
    }

    const settingsToken = (
      (settings.merged as any)?.contentGenerator?.huggingface?.token as
        | string
        | undefined
    )?.trim();
    return settingsToken || undefined;
  }, [settings.merged]);

  const openHfPicker = useCallback(() => {
    needsHfSelectionRef.current = true;
    pushDialogStack('hfPicker');
    setIsHfPickerOpen(true);
  }, [pushDialogStack]);

  const closeHfPicker = useCallback(
    (options?: { preserveStack?: boolean }) => {
      setIsHfPickerOpen(false);
      if (!(options?.preserveStack ?? false)) {
        removeDialogStack('hfPicker');
      }
    },
    [removeDialogStack],
  );

  const configureLocalModel = useCallback(
    async ({
      savedModelId,
      displayName,
      destinationDir,
      primaryFilename,
      sourceModelId,
      downloadState,
      runtimeModelId: explicitRuntimeId,
    }: {
      savedModelId: string;
      displayName: string;
      destinationDir: string;
      primaryFilename: string;
      sourceModelId: string;
      downloadState?: SavedModelDownloadState;
      runtimeModelId?: string;
    }): Promise<{
      runtimeModelId: string;
      registration: RegisterModelResult;
      baseUrl: string;
    }> => {
      const runtimeModelId =
        explicitRuntimeId ?? deriveServerModelId(savedModelId);
      const localPath = path.join(destinationDir, primaryFilename);

      if (!fs.existsSync(localPath)) {
        throw new Error(`Model file not found at ${localPath}`);
      }

      const baseUrl = getKolosalServerBaseUrl();
      const registration = await registerModelWithServer({
        modelId: runtimeModelId,
        modelPath: localPath,
        baseUrl,
        loadImmediately: true,
      });

      setOpenAIBaseUrl(baseUrl);
      setOpenAIModel(runtimeModelId);

      settings.setValue(SettingScope.User, 'openaiBaseUrl', baseUrl);
      settings.setValue(SettingScope.User, 'model.name', runtimeModelId);
      settings.setValue(
        SettingScope.User,
        'security.auth.selectedType',
        AuthType.NO_AUTH,
      );
      settings.setValue(
        SettingScope.User,
        'contentGenerator.provider',
        'openai-compatible',
      );
      settings.setValue(
        SettingScope.User,
        'contentGenerator.huggingface.selectedModelId',
        savedModelId,
      );

      const existingSavedModels = (
        settings.merged.model?.savedModels ?? []
      ) as SavedModelEntry[];
      const existingEntry = existingSavedModels.find(
        (entry) => entry.id === savedModelId,
      );

      const effectiveDownloadState: SavedModelDownloadState = {
        ...(existingEntry?.downloadState ?? {}),
        ...(downloadState ?? {}),
        status: 'completed',
        progress: 1,
        localPath,
        sourceModelId,
        primaryFilename,
        updatedAt: Date.now(),
      };

      const nextSavedModels = upsertSavedModelEntry(existingSavedModels, {
        ...(existingEntry ?? {}),
        id: savedModelId,
        label: displayName,
        provider: 'oss-local',
        baseUrl,
        runtimeModelId,
        downloadState: effectiveDownloadState,
      });

      settings.setValue(SettingScope.User, 'model.savedModels', nextSavedModels);

      await config.setModel(runtimeModelId, {
        reason: 'manual',
        context: 'kolosal-server-registration',
      });
      setCurrentModel(runtimeModelId);

      return { runtimeModelId, registration, baseUrl };
    },
    [config, setCurrentModel, settings],
  );

  const finalizeDownload = useCallback(
    async (association: DownloadAssociation) => {
      const displayName = association.displayName ?? association.savedModelId;
      try {
        const result = await configureLocalModel({
          savedModelId: association.savedModelId,
          displayName,
          destinationDir: association.destinationDir,
          primaryFilename: association.primaryFilename,
          sourceModelId: association.sourceModelId,
          runtimeModelId: association.runtimeModelId,
        });

        addItem(
          {
            type: MessageType.INFO,
            text: `Model \`${displayName}\` ready via Kolosal Server at ${result.baseUrl} as \`${result.runtimeModelId}\`.`,
          },
          Date.now(),
        );
      } catch (error) {
        console.error('Failed to activate model after download:', error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Model \`${displayName}\` download completed, but activation failed: ${getErrorMessage(error)}`,
          },
          Date.now(),
        );
      }
    },
    [addItem, configureLocalModel],
  );

  const persistDownloadEvent = useCallback(
    (event: DownloadProgressEvent) => {
      const association = downloadAssociationsRef.current.get(event.id);

      if (association) {
        const savedModelList = (
          settings.merged.model?.savedModels ?? []
        ) as SavedModelEntry[];
        const index = savedModelList.findIndex(
          (entry) => entry.id === association.savedModelId,
        );
        if (index !== -1) {
          const nextSaved = [...savedModelList];
          const existing = nextSaved[index];
          const progressFraction =
            event.totalBytes && event.totalBytes > 0
              ? event.downloadedBytes / event.totalBytes
              : existing.downloadState?.progress;

          const downloadState: SavedModelDownloadState = {
            status: event.status,
            bytesDownloaded: event.downloadedBytes,
            totalBytes: event.totalBytes,
            progress:
              event.status === 'completed'
                ? 1
                : progressFraction,
            updatedAt: Date.now(),
            error: event.error,
            localPath: path.join(
              association.destinationDir,
              association.primaryFilename,
            ),
            downloadId: event.id,
            sourceModelId: association.sourceModelId,
            primaryFilename: association.primaryFilename,
          };

          if (
            existing.downloadState?.status !== event.status ||
            event.status === 'completed' ||
            event.status === 'error'
          ) {
            nextSaved[index] = {
              ...existing,
              downloadState,
            };
            settings.setValue(
              SettingScope.User,
              'model.savedModels',
              nextSaved,
            );
          }
        }
      }

      const currentDownloads = {
        ...((settings.merged.model?.downloads as Record<
          string,
          SavedModelDownloadState
        >) ?? {}),
      };

      const rounded = Math.round(event.percentage);
      const cached = downloadPersistCacheRef.current.get(event.id);
      const shouldPersist =
        event.status === 'completed' ||
        event.status === 'error' ||
        cached === undefined ||
        rounded !== cached;

      if (!shouldPersist) {
        return;
      }

      if (event.status === 'completed' || event.status === 'error') {
        downloadPersistCacheRef.current.delete(event.id);
      } else {
        downloadPersistCacheRef.current.set(event.id, rounded);
      }

      currentDownloads[event.id] = {
        status: event.status,
        bytesDownloaded: event.downloadedBytes,
        totalBytes: event.totalBytes,
        progress:
          event.status === 'completed'
            ? 1
            : event.totalBytes && event.totalBytes > 0
              ? event.downloadedBytes / event.totalBytes
              : currentDownloads[event.id]?.progress,
        updatedAt: Date.now(),
        error: event.error,
        localPath: association
          ? path.join(
              association.destinationDir,
              association.primaryFilename,
            )
          : currentDownloads[event.id]?.localPath,
        downloadId: event.id,
        sourceModelId: association?.sourceModelId,
        primaryFilename: association?.primaryFilename,
      };

      settings.setValue(
        SettingScope.User,
        'model.downloads',
        currentDownloads,
      );
    },
    [settings],
  );

  const handleDownloadEvent = useCallback(
    (event: DownloadProgressEvent) => {
      setDownloadEvents((prev) => {
        const next = new Map(prev);
        next.set(event.id, event);
        return next;
      });

      persistDownloadEvent(event);

      const association = downloadAssociationsRef.current.get(event.id);

      if (!association) {
        return;
      }

      if (event.status === 'completed') {
        if (!completedDownloadsRef.current.has(event.id)) {
          completedDownloadsRef.current.add(event.id);
          void finalizeDownload(association);
        }
      } else if (event.status === 'error') {
        completedDownloadsRef.current.delete(event.id);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Download failed for \`${association.savedModelId}\`: ${
              event.error ?? 'unknown error'
            }`,
          },
          Date.now(),
        );
      }
    },
    [addItem, finalizeDownload, persistDownloadEvent],
  );

  useEffect(() => {
    const unsubscribe = ideContext.subscribeToIdeContext(setIdeContextState);
    // Set the initial value
    setIdeContextState(ideContext.getIdeContext());
    return unsubscribe;
  }, []);

  useEffect(() => {
    const savedModelList = (
      settings.merged.model?.savedModels ?? []
    ) as SavedModelEntry[];
    const associations = new Map<string, DownloadAssociation>();

    for (const entry of savedModelList) {
      const downloadState = entry.downloadState;
      if (!downloadState?.downloadId) {
        continue;
      }

      const destinationDir = downloadState.localPath
        ? path.dirname(downloadState.localPath)
        : path.join(
            Storage.getGlobalModelsDir(),
            ...(downloadState.sourceModelId?.split('/') ?? []),
          );

      const runtimeModelId =
        entry.runtimeModelId ?? deriveServerModelId(entry.id);

      associations.set(downloadState.downloadId, {
        savedModelId: entry.id,
        destinationDir,
        primaryFilename:
          downloadState.primaryFilename ??
          entry.id.split('/')[entry.id.split('/').length - 1],
        sourceModelId: downloadState.sourceModelId ?? entry.id,
        displayName: entry.label ?? entry.id,
        runtimeModelId,
      });
    }

    downloadAssociationsRef.current = associations;
  }, [settings.merged.model?.savedModels]);

  useEffect(() => {
    let isMounted = true;
    const manager = downloadManagerRef.current;

    const listener = (event: DownloadProgressEvent) => {
      if (!isMounted) return;
      handleDownloadEvent(event);
    };

    (async () => {
      await manager.initialize();
      if (!isMounted) {
        return;
      }

      const entries = manager.getEntries();
      const initialEvents = new Map<string, DownloadProgressEvent>();

      for (const entry of Object.values(entries)) {
        const percentage =
          entry.totalBytes && entry.totalBytes > 0
            ? Math.min(
                100,
                Math.round(
                  (entry.downloadedBytes / entry.totalBytes) * 10000,
                ) / 100,
              )
            : 0;

        const event: DownloadProgressEvent = {
          id: entry.id,
          modelId: entry.modelId,
          status: entry.status,
          downloadedBytes: entry.downloadedBytes,
          totalBytes: entry.totalBytes,
          percentage,
          error: entry.error,
        };

        initialEvents.set(entry.id, event);
        persistDownloadEvent(event);

        if (entry.status === 'completed') {
          completedDownloadsRef.current.add(entry.id);
        }
      }

      setDownloadEvents(initialEvents);
      manager.on('progress', listener);

      for (const entry of Object.values(entries)) {
        if (entry.status === 'completed') {
          continue;
        }
        const token = getHfToken();
        manager.resumeDownload(entry.id, token);
      }

      void manager.resumeAll();
    })().catch((error) => {
      console.error('Failed to initialize download manager:', error);
    });

    return () => {
      isMounted = false;
      manager.off('progress', listener);
    };
  }, [getHfToken, handleDownloadEvent, persistDownloadEvent]);

  useEffect(() => {
    const manager = downloadManagerRef.current;

    const handleExit = () => {
      void (async () => {
        await manager.pauseAll();
        await manager.flush();
      })();
    };

    process.on('beforeExit', handleExit);
    process.on('SIGINT', handleExit);
    process.on('SIGTERM', handleExit);

    return () => {
      process.off('beforeExit', handleExit);
      process.off('SIGINT', handleExit);
      process.off('SIGTERM', handleExit);
    };
  }, []);

  useEffect(() => {
    const openDebugConsole = () => {
      setShowErrorDetails(true);
      setConstrainHeight(false); // Make sure the user sees the full message.
    };
    appEvents.on(AppEvent.OpenDebugConsole, openDebugConsole);

    const logErrorHandler = (errorMessage: unknown) => {
      handleNewMessage({
        type: 'error',
        content: String(errorMessage),
        count: 1,
      });
    };
    appEvents.on(AppEvent.LogError, logErrorHandler);

    return () => {
      appEvents.off(AppEvent.OpenDebugConsole, openDebugConsole);
      appEvents.off(AppEvent.LogError, logErrorHandler);
    };
  }, [handleNewMessage]);

  const openPrivacyNotice = useCallback(() => {
    setShowPrivacyNotice(true);
  }, []);

  const handleEscapePromptChange = useCallback((showPrompt: boolean) => {
    setShowEscapePrompt(showPrompt);
  }, []);

  const initialPromptSubmitted = useRef(false);

  const restorePreviousProvider = useCallback(() => {
    const providerToRestore = previousProviderRef.current;
    const hfModelToRestore = previousHfModelIdRef.current;

    if (providerToRestore !== undefined) {
      settings.setValue(
        SettingScope.User,
        'contentGenerator.provider',
        providerToRestore,
      );
    }

    if (hfModelToRestore !== undefined) {
      settings.setValue(
        SettingScope.User,
        'contentGenerator.huggingface.selectedModelId',
        hfModelToRestore,
      );
    }

    previousProviderRef.current = undefined;
    previousHfModelIdRef.current = undefined;
  }, [settings]);

  const errorCount = useMemo(
    () =>
      consoleMessages
        .filter((msg) => msg.type === 'error')
        .reduce((total, msg) => total + msg.count, 0),
    [consoleMessages],
  );

  const currentProvider =
    settings.merged.contentGenerator?.provider as string | undefined;

  const savedModels = useMemo(
    () =>
      ((settings.merged.model?.savedModels ?? []) as SavedModelEntry[]).map(
        (entry) => ({ ...entry }),
      ),
    [settings.merged.model?.savedModels],
  );

  useEffect(() => {
    const persistedToken = settings.merged.kolosalOAuthToken as
      | string
      | undefined;

    if (!persistedToken) {
      return;
    }

    let isCancelled = false;

    const validatePersistedCredential = async () => {
      try {
        const { validateKolosalCredential } = await import(
          '../config/oauth.js'
        );

        const matchesSavedApiKey = savedModels.some(
          (entry) => entry.apiKey === persistedToken,
        );

        const result = await validateKolosalCredential(persistedToken, {
          preferApiKey: matchesSavedApiKey,
        });

        if (isCancelled) {
          return;
        }

        if (result.valid) {
          setKolosalOAuthTokenState(persistedToken);
          setKolosalOAuthUser(result.user ?? null);
          setKolosalOAuthToken(persistedToken);
        } else if (!result.error) {
          settings.setValue(SettingScope.User, 'kolosalOAuthToken', undefined);
        }
      } catch (error) {
        if (isCancelled) {
          return;
        }
        // Preserve the token on unexpected errors to avoid forcing re-auth unnecessarily.
      }
    };

    void validatePersistedCredential();

    return () => {
      isCancelled = true;
    };
  }, [settings, savedModels]);

  const getExistingKolosalApiKey = useCallback(() => {
    const envApiKey = process.env['OPENAI_API_KEY']?.trim();
    const envBaseUrl = process.env['OPENAI_BASE_URL']?.trim();

    return findKolosalApiKey(savedModels, KOLOSAL_API_BASE_URL, {
      openaiApiKey: settings.merged.openaiApiKey as string | undefined,
      openaiBaseUrl: settings.merged.openaiBaseUrl as string | undefined,
      envApiKey,
      envBaseUrl,
    });
  }, [savedModels, settings.merged.openaiApiKey, settings.merged.openaiBaseUrl]);

  const autoKolosalPickerAttemptedRef = useRef(false);

  const attemptReuseExistingKolosalCredential = useCallback(async () => {
    const candidates: Array<{
      token: string;
      source: 'saved' | 'persisted';
      matchesSaved: boolean;
    }> = [];

    const existingKey = getExistingKolosalApiKey();
    if (existingKey) {
      candidates.push({
        token: existingKey,
        source: 'saved',
        matchesSaved: true,
      });
    }

    const persistedToken = settings.merged.kolosalOAuthToken as
      | string
      | undefined;

    if (
      persistedToken &&
      (!existingKey || persistedToken !== existingKey)
    ) {
      const matchesSaved = savedModels.some(
        (entry) => entry.apiKey === persistedToken,
      );
      candidates.push({
        token: persistedToken,
        source: 'persisted',
        matchesSaved,
      });
    }

    if (candidates.length === 0) {
      return false;
    }

    const { validateKolosalCredential } = await import('../config/oauth.js');

    for (const candidate of candidates) {
      const result = await validateKolosalCredential(candidate.token, {
        preferApiKey: candidate.matchesSaved,
      });

      if (result.valid) {
        setKolosalOAuthTokenState(candidate.token);
        setKolosalOAuthUser(result.user ?? null);
        setKolosalOAuthToken(candidate.token);
        setOpenAIApiKey(candidate.token);
        setOpenAIBaseUrl(KOLOSAL_API_BASE_URL);
        settings.setValue(
          SettingScope.User,
          'openaiBaseUrl',
          KOLOSAL_API_BASE_URL,
        );
        settings.setValue(
          SettingScope.User,
          'kolosalOAuthToken',
          candidate.token,
        );
        setAuthFlowStage('kolosal-model-picker');
        setAuthSelectionCompleted(false);
        return true;
      }

      if (
        candidate.source === 'persisted' &&
        !result.error &&
        (settings.merged.kolosalOAuthToken as string | undefined) ===
          candidate.token
      ) {
        settings.setValue(SettingScope.User, 'kolosalOAuthToken', undefined);
      }
    }

    return false;
  }, [
    getExistingKolosalApiKey,
    savedModels,
    setAuthFlowStage,
    setAuthSelectionCompleted,
    setKolosalOAuthTokenState,
    setKolosalOAuthUser,
    settings,
    setOpenAIApiKey,
    setOpenAIBaseUrl,
    setKolosalOAuthToken,
  ]);

  useEffect(() => {
    const kolosalTokenSetting = settings.merged.kolosalOAuthToken as
      | string
      | undefined;
    const defaultBaseUrl = settings.merged.openaiBaseUrl as
      | string
      | undefined;
    const fallbackModelName = settings.merged.model?.name as
      | string
      | undefined;

    const envConfig = deriveOpenAIEnvConfig(currentModel, savedModels, {
      kolosalToken: kolosalTokenSetting,
      defaultBaseUrl,
      fallbackModel: fallbackModelName,
    });

    if (envConfig.baseUrl) {
      setOpenAIBaseUrl(envConfig.baseUrl);
    }

    if (envConfig.model) {
      setOpenAIModel(envConfig.model);
    }

    if (envConfig.apiKey) {
      setOpenAIApiKey(envConfig.apiKey);

      if (envConfig.isFromKolosal) {
        setKolosalOAuthToken(envConfig.apiKey);
      }
    }
  }, [
    currentModel,
    savedModels,
    settings.merged.kolosalOAuthToken,
    settings.merged.openaiBaseUrl,
    settings.merged.model?.name,
  ]);

  const hfDownloadsByFilename = useMemo<Record<string, FileDownloadDisplayState>>(() => {
    if (!selectedHfModelId) {
      return {};
    }

    const result: Record<string, FileDownloadDisplayState> = {};
    const persisted =
      (settings.merged.model?.downloads as Record<
        string,
        SavedModelDownloadState
      >) ?? {};

    for (const state of Object.values(persisted)) {
      if (
        state.sourceModelId === selectedHfModelId &&
        state.primaryFilename
      ) {
        result[state.primaryFilename] = {
          status: state.status,
          percentage:
            state.progress !== undefined
              ? Math.round(state.progress * 10000) / 100
              : undefined,
          error: state.error,
          downloadId: state.downloadId,
        };
      }
    }

    for (const event of downloadEvents.values()) {
      const association = downloadAssociationsRef.current.get(event.id);
      if (
        association &&
        association.sourceModelId === selectedHfModelId &&
        association.primaryFilename
      ) {
        result[association.primaryFilename] = {
          status: event.status,
          percentage: event.percentage,
          error: event.error,
          downloadId: event.id,
        };
      }
    }

    return result;
  }, [
    selectedHfModelId,
    settings.merged.model?.downloads,
    downloadEvents,
  ]);

  const downloadStateBySavedModelId = useMemo(() => {
    const result = new Map<string, SavedModelDownloadState>();
    for (const event of downloadEvents.values()) {
      const association = downloadAssociationsRef.current.get(event.id);
      if (!association) continue;

      const progress =
        event.totalBytes && event.totalBytes > 0
          ? event.downloadedBytes / event.totalBytes
          : undefined;

      result.set(association.savedModelId, {
        status: event.status,
        bytesDownloaded: event.downloadedBytes,
        totalBytes: event.totalBytes,
        progress,
        error: event.error,
        updatedAt: Date.now(),
        localPath: path.join(
          association.destinationDir,
          association.primaryFilename,
        ),
        downloadId: event.id,
        sourceModelId: association.sourceModelId,
        primaryFilename: association.primaryFilename,
      });
    }
    return result;
  }, [downloadEvents]);

  const defaultAuthSelectionChoice = useMemo<AuthSelectionChoice>(
    () => {
      if (currentProvider === 'openai-compatible') {
        return 'openai';
      }
      if (currentProvider === 'oss-local') {
        return 'hf';
      }
      // Default to login for new users
      return 'login';
    },
    [currentProvider],
  );

  const currentHfModelId = (settings.merged as any)?.contentGenerator?.huggingface
    ?.selectedModelId as string | undefined;
  const currentAuthType = getCurrentModelAuthType(currentModel, savedModels);
  const kolosalToken = settings.merged.kolosalOAuthToken as string | undefined;
  const hasExistingModelOrAuth =
    Boolean(currentModel) ||
    savedModels.length > 0 ||
    Boolean(kolosalToken) ||
    (currentProvider === 'oss-local' && Boolean(currentHfModelId)) ||
    (currentProvider !== undefined &&
      currentProvider !== 'oss-local' &&
      Boolean(currentAuthType));

  const upsertSavedModel = useCallback(
    (entry: SavedModelEntry) => {
      const updated = upsertSavedModelEntry(savedModels, entry);
      settings.setValue(SettingScope.User, 'model.savedModels', updated);
    },
    [savedModels, settings],
  );

  const {
    isThemeDialogOpen,
    openThemeDialog,
    handleThemeSelect,
    handleThemeHighlight,
  } = useThemeCommand(settings, setThemeError, addItem);

  const { isSettingsDialogOpen, openSettingsDialog, closeSettingsDialog } =
    useSettingsCommand();

  const {
    isSubagentCreateDialogOpen,
    openSubagentCreateDialog,
    closeSubagentCreateDialog,
  } = useSubagentCreateDialog();

  const {
    isAgentsManagerDialogOpen,
    openAgentsManagerDialog,
    closeAgentsManagerDialog,
  } = useAgentsManagerDialog();

  const { isFolderTrustDialogOpen, handleFolderTrustSelect, isRestarting } =
    useFolderTrust(settings, setIsTrustedFolder);

  const { showQuitConfirmation, handleQuitConfirmationSelect } =
    useQuitConfirmation();

  const {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect: baseHandleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  } = useAuthCommand(settings, setAuthError, config);

  const closeAuthDialog = useCallback(async () => {
    await baseHandleAuthSelect(undefined, SettingScope.User);
    removeDialogStack('auth');
    setForceAuthDialogVisible(false);
  }, [baseHandleAuthSelect, removeDialogStack]);

  const authDialogVisible = isAuthDialogOpen || forceAuthDialogVisible;

  useEffect(() => {
    if (isAuthDialogOpen) {
      setForceAuthDialogVisible(false);
    }
  }, [isAuthDialogOpen]);

  const wasAuthDialogVisibleRef = useRef(false);
  useEffect(() => {
    if (authDialogVisible && !wasAuthDialogVisibleRef.current) {
      setAuthFlowStage('selection');
    }
    wasAuthDialogVisibleRef.current = authDialogVisible;
  }, [authDialogVisible]);

  useEffect(() => {
    if (!authDialogVisible) {
      autoKolosalPickerAttemptedRef.current = false;
      return;
    }

    if (authFlowStage !== 'selection') {
      return;
    }

    if (autoKolosalPickerAttemptedRef.current) {
      return;
    }

    autoKolosalPickerAttemptedRef.current = true;

    let isActive = true;

    void (async () => {
      if (!isActive) {
        return;
      }
      await attemptReuseExistingKolosalCredential();
    })();

    return () => {
      isActive = false;
    };
  }, [
    authDialogVisible,
    authFlowStage,
    attemptReuseExistingKolosalCredential,
  ]);

  useEffect(() => {
    const provider = settings.merged.contentGenerator?.provider as
      | string
      | undefined;
    if (provider === 'oss-local') return; // Skip auth validation in OSS mode
    
    // Get authType from current model instead of global selectedAuthType
    const modelAuthType = getCurrentModelAuthType(currentModel, savedModels);
    
    if (modelAuthType === AuthType.NO_AUTH) return; // Skip auth validation for local models
    if (
      modelAuthType &&
      !settings.merged.security?.auth?.useExternal
    ) {
      const error = validateAuthMethod(modelAuthType);
      if (error) {
        setAuthError(error);
        openAuthDialog();
      }
    }
  }, [
    settings.merged.contentGenerator?.provider,
    currentModel,
    savedModels,
    settings.merged.security?.auth?.useExternal,
    openAuthDialog,
    setAuthError,
  ]);

  // Startup: drive provider/auth selection through AuthSelectionDialog
  useEffect(() => {
    const provider = settings.merged.contentGenerator?.provider as
      | string
      | undefined;
    const hfSelected = (settings.merged as any)?.contentGenerator?.huggingface
      ?.selectedModelId as string | undefined;

    // If user has existing models or auth, never show auth dialog at startup
    if (hasExistingModelOrAuth && !authDialogVisible) {
      // User is already set up, don't interfere
      return;
    }

    if (!provider) {
      if (isHfPickerOpen || isHfFilePickerOpen) {
        closeHfPicker();
        setIsHfFilePickerOpen(false);
        setSelectedHfModelId(null);
      }
      // Only show auth dialog if user has no existing models or auth
      if (!authDialogVisible && !hasExistingModelOrAuth) {
        setForceAuthDialogVisible(true);
        setAuthFlowStage('selection');
        setAuthSelectionCompleted(false);
        openAuthDialog();
      }
      if (skipNextHfPickerAutoload) {
        setSkipNextHfPickerAutoload(false);
      }
      return;
    }

    if (provider === 'oss-local') {
      if (!hfSelected) {
        if (!authSelectionCompleted) {
          if (isHfPickerOpen || isHfFilePickerOpen) {
            closeHfPicker();
            setIsHfFilePickerOpen(false);
            setSelectedHfModelId(null);
          }
          if (!authDialogVisible) {
            setForceAuthDialogVisible(true);
            setAuthFlowStage('selection');
            openAuthDialog();
          }
          return;
        }

        if (authDialogVisible) {
          return;
        }

        if (skipNextHfPickerAutoload) {
          setSkipNextHfPickerAutoload(false);
          return;
        }

        if (!isHfPickerOpen && !isHfFilePickerOpen) {
          openHfPicker();
        }
        return;
      }

      // Check if there are any active downloads before closing the file picker
      const hasActiveDownloads = Object.values(hfDownloadsByFilename).some(
        (download) => download.status === 'downloading' || download.status === 'queued'
      );
      
      if (isHfPickerOpen) {
        closeHfPicker();
      }
      
      // Only close the file picker if there are no active downloads
      if (isHfFilePickerOpen && !hasActiveDownloads) {
        setIsHfFilePickerOpen(false);
        setSelectedHfModelId(null);
      }
      return;
    }

    if (isHfPickerOpen || isHfFilePickerOpen) {
      closeHfPicker();
      setIsHfFilePickerOpen(false);
      setSelectedHfModelId(null);
    }

    // Only show auth dialog if user has no existing models or auth
    if (!authSelectionCompleted && !authDialogVisible && !hasExistingModelOrAuth) {
      setForceAuthDialogVisible(true);
      setAuthFlowStage('selection');
      openAuthDialog();
    }
  }, [
    settings.merged.contentGenerator?.provider,
    settings.merged.contentGenerator?.huggingface?.selectedModelId,
    isHfPickerOpen,
    isHfFilePickerOpen,
    closeHfPicker,
    authDialogVisible,
    setForceAuthDialogVisible,
    setAuthFlowStage,
    setAuthSelectionCompleted,
    openAuthDialog,
    skipNextHfPickerAutoload,
    setSkipNextHfPickerAutoload,
    authSelectionCompleted,
    openHfPicker,
    hfDownloadsByFilename,
    hasExistingModelOrAuth,
  ]);
  const handleHfModelSelect = useCallback(
    (modelId: string) => {
      // Instead of directly saving, open the file picker
      setSelectedHfModelId(modelId);
      setIsHfPickerOpen(false);
      setIsHfFilePickerOpen(true);
    },
    [],
  );

  const handleHfFileSelect = useCallback(
    async (file: GroupedFile) => {
      if (!selectedHfModelId) return;

      const existingState = hfDownloadsByFilename[file.actualName];

      const manager = downloadManagerRef.current;
      try {
        await manager.initialize();
      } catch (error) {
        console.error('Failed to initialize download manager:', error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to initialize downloads: ${getErrorMessage(error)}`,
          },
          Date.now(),
        );
        return;
      }

      const token = getHfToken();
      const destinationDir = path.join(
        Storage.getGlobalModelsDir(),
        ...selectedHfModelId.split('/'),
      );

      try {
        await fs.promises.mkdir(destinationDir, { recursive: true });
      } catch (error) {
        console.error('Failed to prepare model directory:', error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to prepare download directory for \`${selectedHfModelId}\`: ${getErrorMessage(error)}`,
          },
          Date.now(),
        );
        return;
      }

      const fullModelPath = `${selectedHfModelId}/${file.actualName}`;

      if (existingState?.status === 'completed') {
        const runtimeModelId = deriveServerModelId(fullModelPath);
        const displayName = file.displayName ?? file.actualName;
        const localPath = path.join(destinationDir, file.actualName);

        try {
          const result = await configureLocalModel({
            savedModelId: fullModelPath,
            displayName,
            destinationDir,
            primaryFilename: file.actualName,
            sourceModelId: selectedHfModelId,
            runtimeModelId,
            downloadState: {
              status: 'completed',
              progress: 1,
              updatedAt: Date.now(),
              localPath,
              sourceModelId: selectedHfModelId,
              primaryFilename: file.actualName,
              downloadId: existingState.downloadId,
            },
          });

          addItem(
            {
              type: MessageType.INFO,
              text: `Model \`${displayName}\` ready via Kolosal Server at ${result.baseUrl} as \`${result.runtimeModelId}\`.`,
            },
            Date.now(),
          );

          setAuthSelectionCompleted(true);
          setIsHfFilePickerOpen(false);
          setSelectedHfModelId(null);
          closeHfPicker();
          needsHfSelectionRef.current = false;
          previousProviderRef.current = undefined;
          previousHfModelIdRef.current = undefined;
        } catch (error) {
          console.error('Failed to configure existing model:', error);
          addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to configure downloaded model \`${displayName}\`: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
        return;
      }

      let downloadId: string;
      try {
        downloadId = manager.enqueueDownload({
          modelId: selectedHfModelId,
          displayName: file.displayName ?? fullModelPath,
          provider: 'oss-local',
          primaryFilename: file.actualName,
          partFilenames: file.partFiles,
          destinationDir,
          token,
        });
      } catch (error) {
        console.error('Failed to enqueue model download:', error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to start download for \`${file.displayName ?? file.actualName}\`: ${getErrorMessage(error)}`,
          },
          Date.now(),
        );
        return;
      }

      const runtimeModelId = deriveServerModelId(fullModelPath);
      const displayName = file.displayName ?? fullModelPath;

      const association: DownloadAssociation = {
        savedModelId: fullModelPath,
        destinationDir,
        primaryFilename: file.actualName,
        sourceModelId: selectedHfModelId,
        displayName,
        runtimeModelId,
      };

      downloadAssociationsRef.current.set(downloadId, association);

      const downloadState: SavedModelDownloadState = {
        status: 'queued',
        bytesDownloaded: 0,
        progress: 0,
        updatedAt: Date.now(),
        localPath: path.join(destinationDir, file.actualName),
        downloadId,
        sourceModelId: selectedHfModelId,
        primaryFilename: file.actualName,
      };

      upsertSavedModel({
        id: fullModelPath,
        label: displayName,
        provider: 'oss-local',
        runtimeModelId,
        downloadState,
      });

      settings.setValue(
        SettingScope.User,
        'contentGenerator.huggingface.selectedModelId',
        fullModelPath,
      );

      addItem(
        {
          type: MessageType.INFO,
          text: `Queued download for \`${file.displayName ?? file.actualName}\` from \`${selectedHfModelId}\`.`,
        },
        Date.now(),
      );

      setAuthSelectionCompleted(true);
      needsHfSelectionRef.current = false;
  previousProviderRef.current = undefined;
  previousHfModelIdRef.current = undefined;

      const manifestEntry = manager.getEntry(downloadId);
      if (manifestEntry) {
        const percentage =
          manifestEntry.totalBytes && manifestEntry.totalBytes > 0
            ? Math.min(
                100,
                Math.round(
                  (manifestEntry.downloadedBytes /
                    manifestEntry.totalBytes) *
                    10000,
                ) / 100,
              )
            : 0;

        handleDownloadEvent({
          id: manifestEntry.id,
          modelId: manifestEntry.modelId,
          status: manifestEntry.status,
          downloadedBytes: manifestEntry.downloadedBytes,
          totalBytes: manifestEntry.totalBytes,
          percentage,
          error: manifestEntry.error,
        });
      }
    },
    [
      selectedHfModelId,
      getHfToken,
      addItem,
      upsertSavedModel,
      settings,
      handleDownloadEvent,
      closeHfPicker,
      setAuthSelectionCompleted,
      hfDownloadsByFilename,
    ],
  );

  const handleHfFilePickerBack = useCallback(() => {
    // Go back to model picker
    setIsHfFilePickerOpen(false);
    setSelectedHfModelId(null);
    setIsHfPickerOpen(true);
  }, []);

  const handleHfFilePickerCancel = useCallback(() => {
    // Cancel entire flow
    setIsHfFilePickerOpen(false);
    setSelectedHfModelId(null);
    closeHfPicker();
    
    setSkipNextHfPickerAutoload(true);
    setForceAuthDialogVisible(true);
    setAuthFlowStage('selection');
    setAuthSelectionCompleted(false);
    needsHfSelectionRef.current = false;
    restorePreviousProvider();
    setTimeout(() => {
      openAuthDialog();
    }, 0);
  }, [
    closeHfPicker,
    openAuthDialog,
    restorePreviousProvider,
    needsHfSelectionRef,
    setSkipNextHfPickerAutoload,
    setForceAuthDialogVisible,
    setAuthFlowStage,
    setAuthSelectionCompleted,
  ]);

  const handleHfCancel = useCallback(() => {
    closeHfPicker();

    setSkipNextHfPickerAutoload(true);
    setForceAuthDialogVisible(true);
    setAuthFlowStage('selection');
    setAuthSelectionCompleted(false);
    needsHfSelectionRef.current = false;
    restorePreviousProvider();
    setTimeout(() => {
      openAuthDialog();
    }, 0);
  }, [
    closeHfPicker,
    openAuthDialog,
    restorePreviousProvider,
    needsHfSelectionRef,
    setSkipNextHfPickerAutoload,
    setForceAuthDialogVisible,
    setAuthFlowStage,
    setAuthSelectionCompleted,
  ]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      setAuthFlowStage('selection');
      const previousDialog =
        authType === undefined
          ? getPreviousDialogFromStack('auth')
          : undefined;

      await baseHandleAuthSelect(authType, scope);
      removeDialogStack('auth');
      setForceAuthDialogVisible(false);
      if (authType !== undefined) {
        setAuthSelectionCompleted(true);
        closeHfPicker();
        needsHfSelectionRef.current = false;
        previousProviderRef.current = undefined;
        previousHfModelIdRef.current = undefined;
        return;
      }

      if (
        previousProviderRef.current !== undefined ||
        previousHfModelIdRef.current !== undefined
      ) {
        restorePreviousProvider();
      }

      // Only navigate back to hfPicker if no model exists yet
      if (
        !hasExistingModelOrAuth &&
        previousDialog === 'hfPicker' &&
        needsHfSelectionRef.current
      ) {
        setIsHfPickerOpen(true);
        pushDialogStack('hfPicker');
        return;
      }

      needsHfSelectionRef.current = false;
    },
    [
      baseHandleAuthSelect,
      closeHfPicker,
      getPreviousDialogFromStack,
      needsHfSelectionRef,
  previousHfModelIdRef,
  previousProviderRef,
  restorePreviousProvider,
      hasExistingModelOrAuth,
      pushDialogStack,
      removeDialogStack,
      setForceAuthDialogVisible,
      setAuthSelectionCompleted,
      setAuthFlowStage,
    ],
  );

  const handleAuthCancel = useCallback(() => {
    if (hasExistingModelOrAuth) {
      setAuthSelectionCompleted(true);
      // Clear the dialog stack to prevent navigation back to HF picker
      removeDialogStack('hfPicker');
      // Prevent startup effect from auto-opening HF picker
      setSkipNextHfPickerAutoload(true);
      needsHfSelectionRef.current = false;
      previousProviderRef.current = undefined;
      previousHfModelIdRef.current = undefined;
      // Close the auth dialog entirely when a model already exists
      void closeAuthDialog();
    } else {
      restorePreviousProvider();
      void handleAuthSelect(undefined, SettingScope.User);
    }
  }, [
    closeAuthDialog,
    handleAuthSelect,
    hasExistingModelOrAuth,
    previousHfModelIdRef,
    previousProviderRef,
    restorePreviousProvider,
    needsHfSelectionRef,
    removeDialogStack,
    setSkipNextHfPickerAutoload,
  ]);

  const handleAuthSelectionChoice = useCallback(
    async (choice: AuthSelectionChoice) => {
      if (choice === 'login') {
        needsHfSelectionRef.current = false;
        const reused = await attemptReuseExistingKolosalCredential();

        if (reused) {
          return;
        }

        // No valid token, proceed with OAuth flow
        setAuthFlowStage('login');
        setAuthSelectionCompleted(false);
        return;
      }

      if (choice === 'openai') {
        needsHfSelectionRef.current = false;
        settings.setValue(
          SettingScope.User,
          'contentGenerator.provider',
          'openai-compatible',
        );
        setAuthFlowStage('openai');
        setAuthSelectionCompleted(false);
        return;
      }

      if (previousProviderRef.current === undefined) {
        previousProviderRef.current = settings.merged.contentGenerator?.provider as
          | string
          | undefined;
      }
      if (previousHfModelIdRef.current === undefined) {
        previousHfModelIdRef.current = (settings.merged as any)?.contentGenerator?.huggingface
          ?.selectedModelId as string | undefined;
      }
      needsHfSelectionRef.current = true;
      settings.setValue(
        SettingScope.User,
        'contentGenerator.provider',
        'oss-local',
      );
      settings.setValue(
        SettingScope.User,
        'contentGenerator.huggingface.selectedModelId',
        undefined,
      );
      setAuthFlowStage('selection');
      setAuthSelectionCompleted(true);
      await closeAuthDialog();
      openHfPicker();
    },
    [
      closeAuthDialog,
      needsHfSelectionRef,
      openHfPicker,
      previousHfModelIdRef,
      previousProviderRef,
      attemptReuseExistingKolosalCredential,
      setAuthSelectionCompleted,
      setAuthFlowStage,
      settings,
    ],
  );

  useEffect(() => {
    if (authDialogVisible) {
      pushDialogStack('auth');
    } else {
      removeDialogStack('auth');
    }
  }, [
    authDialogVisible,
    pushDialogStack,
    removeDialogStack,
  ]);

  // Sync user tier from config when authentication changes
  useEffect(() => {
    // Only sync when not currently authenticating
    if (!isAuthenticating) {
      setUserTier(config.getGeminiClient()?.getUserTier());
    }
  }, [config, isAuthenticating]);



  const {
    isEditorDialogOpen,
    openEditorDialog,
    handleEditorSelect,
    exitEditorDialog,
  } = useEditorSettings(settings, setEditorError, addItem);

  const toggleCorgiMode = useCallback(() => {
    setCorgiMode((prev) => !prev);
  }, []);

  const performMemoryRefresh = useCallback(async () => {
    addItem(
      {
        type: MessageType.INFO,
        text: 'Refreshing hierarchical memory (KOLOSAL.md or other context files)...',
      },
      Date.now(),
    );
    try {
      const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
        process.cwd(),
        settings.merged.context?.loadMemoryFromIncludeDirectories
          ? config.getWorkspaceContext().getDirectories()
          : [],
        config.getDebugMode(),
        config.getFileService(),
        settings.merged,
        config.getExtensionContextFilePaths(),
        settings.merged.context?.importFormat || 'tree', // Use setting or default to 'tree'
        config.getFileFilteringOptions(),
      );

      config.setUserMemory(memoryContent);
      config.setGeminiMdFileCount(fileCount);
      setGeminiMdFileCount(fileCount);

      addItem(
        {
          type: MessageType.INFO,
          text: `Memory refreshed successfully. ${memoryContent.length > 0 ? `Loaded ${memoryContent.length} characters from ${fileCount} file(s).` : 'No memory content found.'}`,
        },
        Date.now(),
      );
      if (config.getDebugMode()) {
        console.log(
          `[DEBUG] Refreshed memory content in config: ${memoryContent.substring(0, 200)}...`,
        );
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      addItem(
        {
          type: MessageType.ERROR,
          text: `Error refreshing memory: ${errorMessage}`,
        },
        Date.now(),
      );
      console.error('Error refreshing memory:', error);
    }
  }, [config, addItem, settings.merged]);

  // Watch for model changes (e.g., from Flash fallback)
  useEffect(() => {
    const checkModelChange = () => {
      const configModel = config.getModel();
      if (configModel !== currentModel) {
        setCurrentModel(configModel);
      }
    };

    // Check immediately and then periodically
    checkModelChange();
    const interval = setInterval(checkModelChange, 1000); // Check every second

    return () => clearInterval(interval);
  }, [config, currentModel]);

  // Set up Flash fallback handler
  useEffect(() => {
    const flashFallbackHandler = async (
      currentModel: string,
      fallbackModel: string,
      error?: unknown,
    ): Promise<boolean> => {
      let message: string;

      if (
        config.getContentGeneratorConfig().authType ===
        AuthType.USE_OPENAI
      ) {
        // Use actual user tier if available; otherwise, default to FREE tier behavior (safe default)
        const isPaidTier =
          userTier === UserTierId.LEGACY || userTier === UserTierId.STANDARD;

        // Check if this is a Pro quota exceeded error
        if (error && isProQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using an OpenAI API key from https://platform.openai.com/account/api-keys`;
          } else {
            message = `⚡ You have reached your daily ${currentModel} quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ Or you can utilize an OpenAI API Key. See: https://platform.openai.com/account/api-keys
⚡ You can switch authentication methods by typing /auth`;
          }
        } else if (error && isGenericQuotaExceededError(error)) {
          if (isPaidTier) {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using an OpenAI API key from https://platform.openai.com/account/api-keys`;
          } else {
            message = `⚡ You have reached your daily quota limit.
⚡ Automatically switching from ${currentModel} to ${fallbackModel} for the remainder of this session.
⚡ Or you can utilize an OpenAI API Key. See: https://platform.openai.com/account/api-keys
⚡ You can switch authentication methods by typing /auth`;
          }
        } else {
          if (isPaidTier) {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ To continue accessing the ${currentModel} model today, consider using /auth to switch to using an OpenAI API key from https://platform.openai.com/account/api-keys`;
          } else {
            // Default fallback message for other cases (like consecutive 429s)
            message = `⚡ Automatically switching from ${currentModel} to ${fallbackModel} for faster responses for the remainder of this session.
⚡ Possible reasons for this are that you have received multiple consecutive capacity errors or you have reached your daily ${currentModel} quota limit
⚡ Or you can utilize an OpenAI API Key. See: https://platform.openai.com/account/api-keys
⚡ You can switch authentication methods by typing /auth`;
          }
        }

        // Add message to UI history
        addItem(
          {
            type: MessageType.INFO,
            text: message,
          },
          Date.now(),
        );

        // Set the flag to prevent tool continuation
        setModelSwitchedFromQuotaError(true);
        // Set global quota error flag to prevent Flash model calls
        config.setQuotaErrorOccurred(true);
      }

      // Switch model for future use but return false to stop current retry
      config.setModel(fallbackModel).catch((error) => {
        console.error('Failed to switch to fallback model:', error);
      });
      config.setFallbackMode(true);
      logFlashFallback(
        config,
        new FlashFallbackEvent(config.getContentGeneratorConfig().authType!),
      );
      return false; // Don't continue with current prompt
    };

    config.setFlashFallbackHandler(flashFallbackHandler);
  }, [config, addItem, userTier]);

  // Terminal and UI setup
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const isNarrow = isNarrowWidth(terminalWidth);
  const { stdin, setRawMode } = useStdin();
  const isInitialMount = useRef(true);

  const widthFraction = 0.9;
  const inputWidth = Math.max(
    20,
    Math.floor(terminalWidth * widthFraction) - 3,
  );
  const suggestionsWidth = Math.max(20, Math.floor(terminalWidth * 0.8));

  // Utility callbacks
  const isValidPath = useCallback((filePath: string): boolean => {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (_e) {
      return false;
    }
  }, []);

  const getPreferredEditor = useCallback(() => {
    const editorType = settings.merged.general?.preferredEditor;
    const isValidEditor = isEditorAvailable(editorType);
    if (!isValidEditor) {
      openEditorDialog();
      return;
    }
    return editorType as EditorType;
  }, [settings, openEditorDialog]);

  const onAuthError = useCallback(() => {
    setAuthError('reauth required');
    openAuthDialog();
  }, [openAuthDialog, setAuthError]);

  // Vision switch handler for auto-switch functionality
  const handleVisionSwitchRequired = useCallback(
    async (_query: unknown) =>
      new Promise<{
        modelOverride?: string;
        persistSessionModel?: string;
        showGuidance?: boolean;
      }>((resolve, reject) => {
        setVisionSwitchResolver({ resolve, reject });
        setIsVisionSwitchDialogOpen(true);
      }),
    [],
  );

  const handleVisionSwitchSelect = useCallback(
    (outcome: VisionSwitchOutcome) => {
      setIsVisionSwitchDialogOpen(false);
      if (visionSwitchResolver) {
        const result = processVisionSwitchOutcome(outcome);
        visionSwitchResolver.resolve(result);
        setVisionSwitchResolver(null);
      }
    },
    [visionSwitchResolver],
  );

  const handleModelSelectionOpen = useCallback(() => {
    setIsModelSelectionDialogOpen(true);
  }, []);

  const handleModelSelectionClose = useCallback(() => {
    setIsModelSelectionDialogOpen(false);
  }, []);

  const handleModelDeleteOpen = useCallback(() => {
    // Open model selection dialog filtered to deletable models
    setIsModelSelectionDialogOpen(true);
  }, []);

  const handleModelDeleteClose = useCallback(() => {
    setIsModelDeleteDialogOpen(false);
    setModelToDelete(null);
  }, []);

  const handleModelDeleteRequest = useCallback(
    (model: AvailableModel) => {
      const runtimeId = model.runtimeId ?? model.id;
      const isCurrentModel = runtimeId === currentModel;
      if (isCurrentModel) {
        addItem(
          {
            type: MessageType.ERROR,
            text: 'Cannot delete the currently active model. Switch to a different model first.',
          },
          Date.now(),
        );
        return;
      }
      if (!model.savedModel) {
        addItem(
          {
            type: MessageType.ERROR,
            text: 'This model cannot be deleted as it is not a saved custom model.',
          },
          Date.now(),
        );
        return;
      }
      // Prevent deletion of Kolosal Cloud models
      const isKolosalCloudModel =
        model.savedModel.id.startsWith('kolosal-') ||
        model.label?.endsWith('(Kolosal Cloud)') ||
        model.savedModel.baseUrl === KOLOSAL_API_BASE_URL;
      if (isKolosalCloudModel) {
        addItem(
          {
            type: MessageType.ERROR,
            text: 'Cannot delete Kolosal Cloud models. These are managed by Kolosal and cannot be removed.',
          },
          Date.now(),
        );
        return;
      }
      setModelToDelete(model);
      setIsModelDeleteDialogOpen(true);
    },
    [currentModel, addItem],
  );

  const handleModelDeleteConfirm = useCallback(
    (choice: ModelDeleteChoice) => {
      if (choice === ModelDeleteChoice.CANCEL) {
        handleModelDeleteClose();
        return;
      }

      if (choice === ModelDeleteChoice.DELETE && modelToDelete?.savedModel) {
        // Double-check: prevent deletion of Kolosal Cloud models as a safety measure
        const isKolosalCloudModel =
          modelToDelete.savedModel.id.startsWith('kolosal-') ||
          modelToDelete.label?.endsWith('(Kolosal Cloud)') ||
          modelToDelete.savedModel.baseUrl === KOLOSAL_API_BASE_URL;
        if (isKolosalCloudModel) {
          addItem(
            {
              type: MessageType.ERROR,
              text: 'Cannot delete Kolosal Cloud models. These are managed by Kolosal and cannot be removed.',
            },
            Date.now(),
          );
          handleModelDeleteClose();
          return;
        }

        const modelLabel = modelToDelete.label ?? modelToDelete.id;
        const existingSavedModels = (
          settings.merged.model?.savedModels ?? []
        ) as SavedModelEntry[];

        // Find the exact model to delete by matching both id and runtimeModelId
        // to prevent accidentally deleting the wrong model
        const modelToDeleteId = modelToDelete.savedModel.id;
        const modelToDeleteRuntimeId = modelToDelete.savedModel.runtimeModelId;
        const modelToDeleteBaseUrl = modelToDelete.savedModel.baseUrl;
        const modelToDeleteProvider = modelToDelete.savedModel.provider;

        const updatedModels = existingSavedModels.filter((entry) => {
          // Match by exact id, provider, and baseUrl to ensure we delete the correct model
          const idMatches = entry.id === modelToDeleteId;
          const providerMatches = entry.provider === modelToDeleteProvider;
          const baseUrlMatches =
            (entry.baseUrl ?? '') === (modelToDeleteBaseUrl ?? '');
          const runtimeIdMatches =
            !modelToDeleteRuntimeId ||
            entry.runtimeModelId === modelToDeleteRuntimeId;

          // Only delete if all identifiers match
          return !(idMatches && providerMatches && baseUrlMatches && runtimeIdMatches);
        });

        settings.setValue(
          SettingScope.User,
          'model.savedModels',
          updatedModels,
        );

        addItem(
          {
            type: MessageType.INFO,
            text: `Model \`${modelLabel}\` has been deleted.`,
          },
          Date.now(),
        );

        handleModelDeleteClose();
      }
    },
    [modelToDelete, settings, addItem, handleModelDeleteClose],
  );

  const handleModelSelect = useCallback(
    async (model: AvailableModel) => {
  const savedModelId = model.savedModel?.id ?? model.id;
  const displayName = model.label ?? savedModelId;

      const contentGeneratorConfig = config.getContentGeneratorConfig();
      const authTypeForModel =
        model.savedModel?.authType ?? contentGeneratorConfig?.authType;

      const providerForModel =
        (model.provider as SavedModelEntry['provider'] | undefined) ??
        (currentProvider as SavedModelEntry['provider'] | undefined) ??
        (authTypeForModel === AuthType.USE_OPENAI
          ? 'openai-compatible'
          : (authTypeForModel as SavedModelEntry['provider'] | undefined)) ??
        'openai-compatible';

      const downloadState =
        model.downloadState ?? model.savedModel?.downloadState;

      const runtimeModelId =
        providerForModel === 'oss-local'
          ? model.runtimeId ?? deriveServerModelId(savedModelId)
          : model.runtimeId ?? savedModelId;
      if (
        providerForModel === 'oss-local' &&
        downloadState &&
        downloadState.status !== 'completed'
      ) {
        const statusLabel =
          downloadState.status === 'error'
            ? 'failed'
            : downloadState.status;
        addItem(
          {
            type: MessageType.INFO,
            text: `Model \`${displayName}\` isn't ready yet (${statusLabel}). Let the download finish or retry from the Hugging Face picker.`,
          },
          Date.now(),
        );
        return;
      }

      if (providerForModel === 'oss-local') {
        const savedModelSegments = savedModelId.split('/');
        const fallbackPrimaryFilename =
          savedModelSegments.at(-1) ?? savedModelId;
        const primaryFilename =
          downloadState?.primaryFilename ?? fallbackPrimaryFilename;
        const fallbackDestinationDir = path.join(
          Storage.getGlobalModelsDir(),
          ...savedModelSegments.slice(0, -1),
        );
        const destinationDir = downloadState?.localPath
          ? path.dirname(downloadState.localPath)
          : fallbackDestinationDir;
        const sourceModelId =
          downloadState?.sourceModelId ??
          (savedModelSegments.length > 1
            ? savedModelSegments.slice(0, -1).join('/')
            : savedModelId);

        try {
          const result = await configureLocalModel({
            savedModelId,
            displayName,
            destinationDir,
            primaryFilename,
            sourceModelId,
            downloadState,
            runtimeModelId,
          });

          const statusLabel =
            result.registration.status === 'exists'
              ? 'already registered, loading existing instance'
              : 'registered and loaded';
          const statusSummary = result.registration.message
            ? `${statusLabel}: ${result.registration.message}`
            : statusLabel;

          addItem(
            {
              type: MessageType.INFO,
              text: `Model \`${displayName}\` ready via Kolosal Server at ${result.baseUrl} as \`${result.runtimeModelId}\` (${statusSummary}).`,
            },
            Date.now(),
          );

          setIsModelSelectionDialogOpen(false);
        } catch (error) {
          console.error('Failed to activate local model:', error);
          addItem(
            {
              type: MessageType.ERROR,
              text: `Failed to activate local model \`${displayName}\`: ${getErrorMessage(error)}`,
            },
            Date.now(),
          );
        }
        return;
      }

      try {
        if (providerForModel === 'openai-compatible') {
          if (model.baseUrl) {
            setOpenAIBaseUrl(model.baseUrl);
            settings.setValue(
              SettingScope.User,
              'openaiBaseUrl',
              model.baseUrl,
            );
          }
          setOpenAIModel(runtimeModelId);
          settings.setValue(
            SettingScope.User,
            'contentGenerator.provider',
            'openai-compatible',
          );
        }

        settings.setValue(SettingScope.User, 'model.name', runtimeModelId);

        upsertSavedModel({
          id: savedModelId,
          label: displayName,
          provider: providerForModel,
          baseUrl: model.baseUrl,
          authType: authTypeForModel,
          apiKey: model.savedModel?.apiKey,
          isVision: model.isVision ?? model.savedModel?.isVision,
          runtimeModelId,
        });

        await config.setModel(runtimeModelId);
        setCurrentModel(runtimeModelId);
        setIsModelSelectionDialogOpen(false);
        addItem(
          {
            type: MessageType.INFO,
            text: `Switched model to \`${displayName}\` for this session.`,
          },
          Date.now(),
        );
      } catch (error) {
        console.error('Failed to switch model:', error);
        addItem(
          {
            type: MessageType.ERROR,
            text: `Failed to switch to model \`${displayName}\`. Please try again.`,
          },
          Date.now(),
        );
      }
    },
    [
      config,
      currentProvider,
      setCurrentModel,
      addItem,
      setIsModelSelectionDialogOpen,
      settings,
      upsertSavedModel,
      configureLocalModel,
    ],
  );

  const getAvailableModelsForCurrentAuth = useCallback((): AvailableModel[] => {
    const contentGeneratorConfig = config.getContentGeneratorConfig();
    const authType = contentGeneratorConfig?.authType;
    const visionModelPreviewEnabled =
      settings.merged.experimental?.visionModelPreview ?? true;

    const combined: AvailableModel[] = [];
    const seenModelKeys = new Set<string>();
    const markSeen = (key?: string) => {
      if (!key) return;
      seenModelKeys.add(key);
    };

    for (const entry of savedModels) {
      const runtimeState = downloadStateBySavedModelId.get(entry.id);
      const downloadState = runtimeState ?? entry.downloadState;
      const runtimeId =
        entry.provider === 'oss-local'
          ? entry.runtimeModelId ?? deriveServerModelId(entry.id)
          : entry.runtimeModelId ?? entry.id;

      combined.push({
        id: entry.id,
        label: entry.label ?? entry.id,
        runtimeId,
        isVision: entry.isVision,
        provider: entry.provider,
        baseUrl: entry.baseUrl,
        savedModel: entry,
        downloadState,
      });
      markSeen(entry.id);
      markSeen(runtimeId);
    }

    if (
      authType === AuthType.USE_OPENAI ||
      currentProvider === 'openai-compatible'
    ) {
      const openAIModel = getOpenAIAvailableModelFromEnv();
      if (openAIModel && !seenModelKeys.has(openAIModel.id)) {
        combined.unshift({
          ...openAIModel,
          provider: 'openai-compatible',
          runtimeId: openAIModel.id,
        });
        markSeen(openAIModel.id);
      }
    }

    if (combined.length > 0) {
      return combined;
    }

    switch (authType) {
      case AuthType.USE_OPENAI:
        return getFilteredQwenModels(visionModelPreviewEnabled);
      case AuthType.USE_OPENAI: {
        const openAIModel = getOpenAIAvailableModelFromEnv();
        return openAIModel
          ? [
              {
                ...openAIModel,
                provider: 'openai-compatible',
                runtimeId: openAIModel.id,
              },
            ]
          : [];
      }
      default:
        return [];
    }
  }, [
    config,
    currentProvider,
    downloadStateBySavedModelId,
    savedModels,
    settings.merged.experimental?.visionModelPreview,
  ]);

  // Core hooks and processors
  const {
    vimEnabled: vimModeEnabled,
    vimMode,
    toggleVimEnabled,
  } = useVimMode();

  const {
    handleSlashCommand,
    slashCommands,
    pendingHistoryItems: pendingSlashCommandHistoryItems,
    commandContext,
    shellConfirmationRequest,
    confirmationRequest,
    quitConfirmationRequest,
  } = useSlashCommandProcessor(
    config,
    settings,
    addItem,
    clearItems,
    loadHistory,
    refreshStatic,
    setDebugMessage,
    openThemeDialog,
    openAuthDialog,
    openEditorDialog,
    toggleCorgiMode,
    setQuittingMessages,
    openPrivacyNotice,
    openSettingsDialog,
    handleModelSelectionOpen,
    handleModelDeleteOpen,
    openSubagentCreateDialog,
    openAgentsManagerDialog,
    toggleVimEnabled,
    setIsProcessing,
    setGeminiMdFileCount,
    showQuitConfirmation,
  );

  const buffer = useTextBuffer({
    initialText: '',
    viewport: { height: 10, width: inputWidth },
    stdin,
    setRawMode,
    isValidPath,
    shellModeActive,
  });

  const [userMessages, setUserMessages] = useState<string[]>([]);

  // Stable reference for cancel handler to avoid circular dependency
  const cancelHandlerRef = useRef<() => void>(() => {});

  const {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems: pendingGeminiHistoryItems,
    thought,
    cancelOngoingRequest,
  } = useGeminiStream(
    config.getGeminiClient(),
    history,
    addItem,
    config,
    setDebugMessage,
    handleSlashCommand,
    shellModeActive,
    getPreferredEditor,
    onAuthError,
    performMemoryRefresh,
    modelSwitchedFromQuotaError,
    setModelSwitchedFromQuotaError,
    refreshStatic,
    () => cancelHandlerRef.current(),
    settings.merged.experimental?.visionModelPreview ?? true,
    handleVisionSwitchRequired,
  );

  const pendingHistoryItems = useMemo(
    () =>
      [...pendingSlashCommandHistoryItems, ...pendingGeminiHistoryItems].map(
        (item, index) => ({
          ...item,
          id: index,
        }),
      ),
    [pendingSlashCommandHistoryItems, pendingGeminiHistoryItems],
  );

  // Welcome back functionality
  const {
    welcomeBackInfo,
    showWelcomeBackDialog,
    welcomeBackChoice,
    handleWelcomeBackSelection,
    handleWelcomeBackClose,
  } = useWelcomeBack(config, submitQuery, buffer, settings.merged);

  // Dialog close functionality
  const { closeAnyOpenDialog } = useDialogClose({
    isThemeDialogOpen,
    handleThemeSelect,
    isAuthDialogOpen: authDialogVisible,
    handleAuthSelect,
    selectedAuthType: currentAuthType,
    isEditorDialogOpen,
    exitEditorDialog,
    isSettingsDialogOpen,
    closeSettingsDialog,
    isFolderTrustDialogOpen,
    showPrivacyNotice,
    setShowPrivacyNotice,
    showWelcomeBackDialog,
    handleWelcomeBackClose,
    quitConfirmationRequest,
  });

  // Message queue for handling input during streaming
  const { messageQueue, addMessage, clearQueue, getQueuedMessagesText } =
    useMessageQueue({
      streamingState,
      submitQuery,
    });

  // Update the cancel handler with message queue support
  cancelHandlerRef.current = useCallback(() => {
    if (isToolExecuting(pendingHistoryItems)) {
      buffer.setText(''); // Just clear the prompt
      return;
    }

    const lastUserMessage = userMessages.at(-1);
    let textToSet = lastUserMessage || '';

    // Append queued messages if any exist
    const queuedText = getQueuedMessagesText();
    if (queuedText) {
      textToSet = textToSet ? `${textToSet}\n\n${queuedText}` : queuedText;
      clearQueue();
    }

    if (textToSet) {
      buffer.setText(textToSet);
    }
  }, [
    buffer,
    userMessages,
    getQueuedMessagesText,
    clearQueue,
    pendingHistoryItems,
  ]);

  // Input handling - queue messages for processing
  const handleFinalSubmit = useCallback(
    (submittedValue: string) => {
      addMessage(submittedValue);
    },
    [addMessage],
  );

  const handleIdePromptComplete = useCallback(
    (result: IdeIntegrationNudgeResult) => {
      if (result.userSelection === 'yes') {
        if (result.isExtensionPreInstalled) {
          handleSlashCommand('/ide enable');
        } else {
          handleSlashCommand('/ide install');
        }
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      } else if (result.userSelection === 'dismiss') {
        settings.setValue(
          SettingScope.User,
          'hasSeenIdeIntegrationNudge',
          true,
        );
      }
      setIdePromptAnswered(true);
    },
    [handleSlashCommand, settings],
  );

  const { handleInput: vimHandleInput } = useVim(buffer, handleFinalSubmit);

  const { elapsedTime, currentLoadingPhrase } =
    useLoadingIndicator(streamingState);
  const showAutoAcceptIndicator = useAutoAcceptIndicator({ config, addItem });

  const handleExit = useCallback(
    (
      pressedOnce: boolean,
      setPressedOnce: (value: boolean) => void,
      timerRef: ReturnType<typeof useRef<NodeJS.Timeout | null>>,
    ) => {
      // Fast double-press: Direct quit (preserve user habit)
      if (pressedOnce) {
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        // Exit directly without showing confirmation dialog
        handleSlashCommand('/quit');
        return;
      }

      // First press: Prioritize cleanup tasks

      // Special case: If quit-confirm dialog is open, Ctrl+C means "quit immediately"
      if (quitConfirmationRequest) {
        handleSlashCommand('/quit');
        return;
      }

      // 1. Close other dialogs (highest priority)
      if (closeAnyOpenDialog()) {
        return; // Dialog closed, end processing
      }

      // 2. Cancel ongoing requests
      if (streamingState === StreamingState.Responding) {
        cancelOngoingRequest?.();
        return; // Request cancelled, end processing
      }

      // 3. Clear input buffer (if has content)
      if (buffer.text.length > 0) {
        buffer.setText('');
        return; // Input cleared, end processing
      }

      // All cleanup tasks completed, show quit confirmation dialog
      handleSlashCommand('/quit-confirm');
    },
    [
      handleSlashCommand,
      quitConfirmationRequest,
      closeAnyOpenDialog,
      streamingState,
      cancelOngoingRequest,
      buffer,
    ],
  );

  const handleGlobalKeypress = useCallback(
    (key: Key) => {
      // Debug log keystrokes if enabled
      if (settings.merged.general?.debugKeystrokeLogging) {
        console.log('[DEBUG] Keystroke:', JSON.stringify(key));
      }

      let enteringConstrainHeightMode = false;
      if (!constrainHeight) {
        enteringConstrainHeightMode = true;
        setConstrainHeight(true);
      }

      if (keyMatchers[Command.SHOW_ERROR_DETAILS](key)) {
        setShowErrorDetails((prev) => !prev);
      } else if (keyMatchers[Command.TOGGLE_TOOL_DESCRIPTIONS](key)) {
        const newValue = !showToolDescriptions;
        setShowToolDescriptions(newValue);

        const mcpServers = config.getMcpServers();
        if (Object.keys(mcpServers || {}).length > 0) {
          handleSlashCommand(newValue ? '/mcp desc' : '/mcp nodesc');
        }
      } else if (
        keyMatchers[Command.TOGGLE_IDE_CONTEXT_DETAIL](key) &&
        config.getIdeMode() &&
        ideContextState
      ) {
        // Show IDE status when in IDE mode and context is available.
        handleSlashCommand('/ide status');
      } else if (keyMatchers[Command.QUIT](key)) {
        // When authenticating, let AuthInProgress component handle Ctrl+C.
        if (isAuthenticating) {
          return;
        }
        handleExit(ctrlCPressedOnce, setCtrlCPressedOnce, ctrlCTimerRef);
      } else if (keyMatchers[Command.EXIT](key)) {
        if (buffer.text.length > 0) {
          return;
        }
        handleExit(ctrlDPressedOnce, setCtrlDPressedOnce, ctrlDTimerRef);
      } else if (
        keyMatchers[Command.SHOW_MORE_LINES](key) &&
        !enteringConstrainHeightMode
      ) {
        setConstrainHeight(false);
      }
    },
    [
      constrainHeight,
      setConstrainHeight,
      setShowErrorDetails,
      showToolDescriptions,
      setShowToolDescriptions,
      config,
      ideContextState,
      handleExit,
      ctrlCPressedOnce,
      setCtrlCPressedOnce,
      ctrlCTimerRef,
      buffer.text.length,
      ctrlDPressedOnce,
      setCtrlDPressedOnce,
      ctrlDTimerRef,
      handleSlashCommand,
      isAuthenticating,
      settings.merged.general?.debugKeystrokeLogging,
    ],
  );

  useKeypress(handleGlobalKeypress, {
    isActive: true,
  });

  useEffect(() => {
    if (config) {
      setGeminiMdFileCount(config.getGeminiMdFileCount());
    }
  }, [config, config.getGeminiMdFileCount]);

  const logger = useLogger(config.storage);

  useEffect(() => {
    const fetchUserMessages = async () => {
      const pastMessagesRaw = (await logger?.getPreviousUserMessages()) || []; // Newest first

      const currentSessionUserMessages = history
        .filter(
          (item): item is HistoryItem & { type: 'user'; text: string } =>
            item.type === 'user' &&
            typeof item.text === 'string' &&
            item.text.trim() !== '',
        )
        .map((item) => item.text)
        .reverse(); // Newest first, to match pastMessagesRaw sorting

      // Combine, with current session messages being more recent
      const combinedMessages = [
        ...currentSessionUserMessages,
        ...pastMessagesRaw,
      ];

      // Deduplicate consecutive identical messages from the combined list (still newest first)
      const deduplicatedMessages: string[] = [];
      if (combinedMessages.length > 0) {
        deduplicatedMessages.push(combinedMessages[0]); // Add the newest one unconditionally
        for (let i = 1; i < combinedMessages.length; i++) {
          if (combinedMessages[i] !== combinedMessages[i - 1]) {
            deduplicatedMessages.push(combinedMessages[i]);
          }
        }
      }
      // Reverse to oldest first for useInputHistory
      setUserMessages(deduplicatedMessages.reverse());
    };
    fetchUserMessages();
  }, [history, logger]);

  const isInputActive =
    (streamingState === StreamingState.Idle ||
      streamingState === StreamingState.Responding) &&
    !initError &&
    !isProcessing &&
    !showWelcomeBackDialog;

  const handleClearScreen = useCallback(() => {
    clearItems();
    clearConsoleMessagesState();
    console.clear();
    refreshStatic();
  }, [clearItems, clearConsoleMessagesState, refreshStatic]);

  const mainControlsRef = useRef<DOMElement>(null);
  const pendingHistoryItemRef = useRef<DOMElement>(null);

  useEffect(() => {
    if (mainControlsRef.current) {
      const fullFooterMeasurement = measureElement(mainControlsRef.current);
      setFooterHeight(fullFooterMeasurement.height);
    }
  }, [terminalHeight, consoleMessages, showErrorDetails]);

  const staticExtraHeight = /* margins and padding */ 3;
  const availableTerminalHeight = useMemo(
    () => terminalHeight - footerHeight - staticExtraHeight,
    [terminalHeight, footerHeight],
  );

  useEffect(() => {
    // skip refreshing Static during first mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // debounce so it doesn't fire up too often during resize
    const handler = setTimeout(() => {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [terminalWidth, terminalHeight, refreshStatic]);

  useEffect(() => {
    if (streamingState === StreamingState.Idle && staticNeedsRefresh) {
      setStaticNeedsRefresh(false);
      refreshStatic();
    }
  }, [streamingState, refreshStatic, staticNeedsRefresh]);

  const filteredConsoleMessages = useMemo(() => {
    if (config.getDebugMode()) {
      return consoleMessages;
    }
    return consoleMessages.filter((msg) => msg.type !== 'debug');
  }, [consoleMessages, config]);

  const branchName = useGitBranchName(config.getTargetDir());

  const contextFileNames = useMemo(() => {
    const fromSettings = settings.merged.context?.fileName;
    if (fromSettings) {
      return Array.isArray(fromSettings) ? fromSettings : [fromSettings];
    }
    return getAllGeminiMdFilenames();
  }, [settings.merged.context?.fileName]);

  const initialPrompt = useMemo(() => config.getQuestion(), [config]);
  const geminiClient = config.getGeminiClient();

  useEffect(() => {
    if (
      initialPrompt &&
      !initialPromptSubmitted.current &&
      !isAuthenticating &&
  !authDialogVisible &&
      !isHfPickerOpen &&
      !isHfFilePickerOpen &&
      !isThemeDialogOpen &&
      !isEditorDialogOpen &&
      !isModelSelectionDialogOpen &&
      !isVisionSwitchDialogOpen &&
      !isSubagentCreateDialogOpen &&
      !showPrivacyNotice &&
      !showWelcomeBackDialog &&
      welcomeBackChoice !== 'restart' &&
      geminiClient?.isInitialized?.()
    ) {
      submitQuery(initialPrompt);
      initialPromptSubmitted.current = true;
    }
  }, [
    initialPrompt,
    submitQuery,
    isAuthenticating,
    authDialogVisible,
    isThemeDialogOpen,
    isEditorDialogOpen,
    isSubagentCreateDialogOpen,
    showPrivacyNotice,
    showWelcomeBackDialog,
    welcomeBackChoice,
    geminiClient,
    isModelSelectionDialogOpen,
    isVisionSwitchDialogOpen,
  ]);

  if (quittingMessages) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        {quittingMessages.map((item) => (
          <HistoryItemDisplay
            key={item.id}
            availableTerminalHeight={
              constrainHeight ? availableTerminalHeight : undefined
            }
            terminalWidth={terminalWidth}
            item={item}
            isPending={false}
            config={config}
          />
        ))}
      </Box>
    );
  }

  const mainAreaWidth = Math.floor(terminalWidth * 0.9);
  const debugConsoleMaxHeight = Math.floor(Math.max(terminalHeight * 0.2, 5));
  // Arbitrary threshold to ensure that items in the static area are large
  // enough but not too large to make the terminal hard to use.
  const staticAreaMaxItemHeight = Math.max(terminalHeight * 4, 100);
  const placeholder = vimModeEnabled
    ? "  Press 'i' for INSERT mode and 'Esc' for NORMAL mode."
    : '  Type your message or @path/to/file';
  return (
    <StreamingContext.Provider value={streamingState}>
      <Box flexDirection="column" width="90%">
        {/*
         * The Static component is an Ink intrinsic in which there can only be 1 per application.
         * Because of this restriction we're hacking it slightly by having a 'header' item here to
         * ensure that it's statically rendered.
         *
         * Background on the Static Item: Anything in the Static component is written a single time
         * to the console. Think of it like doing a console.log and then never using ANSI codes to
         * clear that content ever again. Effectively it has a moving frame that every time new static
         * content is set it'll flush content to the terminal and move the area which it's "clearing"
         * down a notch. Without Static the area which gets erased and redrawn continuously grows.
         */}
        <Static
          key={staticKey}
          items={[
            <Box flexDirection="column" key="header">
              {!(
                settings.merged.ui?.hideBanner || config.getScreenReader()
              ) && <Header version={version} nightly={nightly} />}
            </Box>,
            ...history.map((h, index) => {
              // Find the first assistant message in the history
              const firstAssistantMessageIndex = history.findIndex(
                (item) => item.type === 'gemini' || item.type === 'gemini_content'
              );
              const isFirstAssistantMessage = 
                (h.type === 'gemini' || h.type === 'gemini_content') && 
                index === firstAssistantMessageIndex;

              return (
                <HistoryItemDisplay
                  terminalWidth={mainAreaWidth}
                  availableTerminalHeight={staticAreaMaxItemHeight}
                  key={h.id}
                  item={h}
                  isPending={false}
                  config={config}
                  commands={slashCommands}
                  isFirstAssistantMessage={isFirstAssistantMessage}
                />
              );
            }),
          ]}
        >
          {(item) => item}
        </Static>
        <OverflowProvider>
          <Box ref={pendingHistoryItemRef} flexDirection="column">
            {pendingHistoryItems.map((item) => (
              <HistoryItemDisplay
                key={item.id}
                availableTerminalHeight={
                  constrainHeight ? availableTerminalHeight : undefined
                }
                terminalWidth={mainAreaWidth}
                item={item}
                isPending={true}
                config={config}
                isFocused={!isEditorDialogOpen}
              />
            ))}
            <ShowMoreLines constrainHeight={constrainHeight} />
          </Box>
        </OverflowProvider>

        <Box flexDirection="column" ref={mainControlsRef}>
          {/* Move UpdateNotification to render update notification above input area */}
          {updateInfo && <UpdateNotification message={updateInfo.message} />}
          {startupWarnings.length > 0 && (
            <LeftBorderPanel
              accentColor={Colors.AccentYellow}
              width="100%"
              marginLeft={1}
              marginTop={1}
              marginBottom={1}
              contentProps={{
                flexDirection: 'column',
                padding: 1,
              }}
            >
              {startupWarnings.map((warning, index) => (
                <Text key={index} color={Colors.AccentYellow}>
                  {warning}
                </Text>
              ))}
            </LeftBorderPanel>
          )}
          {showWelcomeBackDialog && welcomeBackInfo?.hasHistory && (
            <WelcomeBackDialog
              welcomeBackInfo={welcomeBackInfo}
              onSelect={handleWelcomeBackSelection}
              onClose={handleWelcomeBackClose}
            />
          )}
          {showWorkspaceMigrationDialog ? (
            <WorkspaceMigrationDialog
              workspaceExtensions={workspaceExtensions}
              onOpen={onWorkspaceMigrationDialogOpen}
              onClose={onWorkspaceMigrationDialogClose}
            />
          ) : shouldShowIdePrompt && currentIDE ? (
            <IdeIntegrationNudge
              ide={currentIDE}
              onComplete={handleIdePromptComplete}
            />
          ) : isFolderTrustDialogOpen ? (
            <FolderTrustDialog
              onSelect={handleFolderTrustSelect}
              isRestarting={isRestarting}
            />
          ) : isHfPickerOpen ? (
            <HfModelPickerDialog
              token={
                ((settings.merged as any)?.contentGenerator?.huggingface?.token as string | undefined) ||
                process.env['HF_TOKEN']
              }
              onSelect={handleHfModelSelect}
              onCancel={handleHfCancel}
            />
          ) : isHfFilePickerOpen && selectedHfModelId ? (
            <HfModelFilePickerDialog
              modelId={selectedHfModelId}
              token={
                ((settings.merged as any)?.contentGenerator?.huggingface?.token as string | undefined) ||
                process.env['HF_TOKEN']
              }
              onSelect={handleHfFileSelect}
              onBack={handleHfFilePickerBack}
              onCancel={handleHfFilePickerCancel}
              downloadsByFilename={hfDownloadsByFilename}
            />
          ) : quitConfirmationRequest ? (
            <QuitConfirmationDialog
              onSelect={(choice) => {
                const result = handleQuitConfirmationSelect(choice);
                if (result?.shouldQuit) {
                  quitConfirmationRequest.onConfirm(true, result.action);
                } else {
                  quitConfirmationRequest.onConfirm(false);
                }
              }}
            />
          ) : shellConfirmationRequest ? (
            <ShellConfirmationDialog request={shellConfirmationRequest} />
          ) : confirmationRequest ? (
            <Box flexDirection="column">
              {confirmationRequest.prompt}
              <Box paddingY={1}>
                <RadioButtonSelect
                  isFocused={!!confirmationRequest}
                  items={[
                    { label: 'Yes', value: true },
                    { label: 'No', value: false },
                  ]}
                  onSelect={(value: boolean) => {
                    confirmationRequest.onConfirm(value);
                  }}
                />
              </Box>
            </Box>
          ) : isThemeDialogOpen ? (
            <Box flexDirection="column">
              {themeError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{themeError}</Text>
                </Box>
              )}
              <ThemeDialog
                onSelect={handleThemeSelect}
                onHighlight={handleThemeHighlight}
                settings={settings}
                availableTerminalHeight={
                  constrainHeight
                    ? terminalHeight - staticExtraHeight
                    : undefined
                }
                terminalWidth={mainAreaWidth}
              />
            </Box>
          ) : isSettingsDialogOpen ? (
            <Box flexDirection="column">
              <SettingsDialog
                settings={settings}
                onSelect={() => closeSettingsDialog()}
                onRestartRequest={() => process.exit(0)}
              />
            </Box>
          ) : isSubagentCreateDialogOpen ? (
            <Box flexDirection="column">
              <AgentCreationWizard
                onClose={closeSubagentCreateDialog}
                config={config}
              />
            </Box>
          ) : isAgentsManagerDialogOpen ? (
            <Box flexDirection="column">
              <AgentsManagerDialog
                onClose={closeAgentsManagerDialog}
                config={config}
              />
            </Box>
          ) : isAuthenticating ? (
            <>
              <AuthInProgress
                onTimeout={() => {
                  setAuthError('Authentication timed out. Please try again.');
                  cancelAuthentication();
                  openAuthDialog();
                }}
              />
              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={filteredConsoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}
            </>
          ) : authDialogVisible ? (
            <Box flexDirection="column">
              {authFlowStage === 'login' ? (
                <OAuthDeviceFlow
                  onSuccess={(accessToken, user) => {
                    // Store the OAuth token and user info in state
                    setKolosalOAuthTokenState(accessToken);
                    setKolosalOAuthUser(user || null);
                    setKolosalOAuthToken(accessToken);
                    
                    // Persist the token in settings
                    settings.setValue(SettingScope.User, 'kolosalOAuthToken', accessToken);
                    
                    // Move to model picker stage
                    setAuthFlowStage('kolosal-model-picker');
                  }}
                  onCancel={() => setAuthFlowStage('selection')}
                />
              ) : authFlowStage === 'kolosal-model-picker' ? (
                <KolosalModelPickerDialog
                  accessToken={kolosalOAuthToken || ''}
                  userEmail={kolosalOAuthUser?.email}
                  onSelect={async (selectedModel) => {
                    if (!kolosalOAuthToken) return;

                    const kolosalBaseUrl = KOLOSAL_API_BASE_URL;
                    
                    try {
                      // Fetch all models to save them
                      const allModels = await fetchKolosalModels(kolosalOAuthToken);
                      
                      // Get current saved models
                      const currentSavedModels = (settings.merged.model?.savedModels ?? []) as SavedModelEntry[];
                      
                      // Build array of all Kolosal models to save
                      let updatedSavedModels = [...currentSavedModels];
                      allModels.forEach((model: KolosalModel) => {
                        const modelEntry: SavedModelEntry = {
                          id: `kolosal-${model.id}`,
                          label: `${model.name} (Kolosal Cloud)`,
                          provider: 'openai-compatible',
                          baseUrl: kolosalBaseUrl,
                          authType: AuthType.USE_OPENAI,
                          apiKey: kolosalOAuthToken,
                          runtimeModelId: model.id,
                        };
                        updatedSavedModels = upsertSavedModelEntry(updatedSavedModels, modelEntry);
                      });
                      
                      // Save all models at once
                      settings.setValue(SettingScope.User, 'model.savedModels', updatedSavedModels);

                      // Set environment variables for the selected model
                      setOpenAIApiKey(kolosalOAuthToken);
                      setOpenAIBaseUrl(kolosalBaseUrl);
                      setOpenAIModel(selectedModel.id);
                      
                      // Save to settings for persistence
                      settings.setValue(SettingScope.User, 'openaiBaseUrl', kolosalBaseUrl);
                      settings.setValue(SettingScope.User, 'model.name', selectedModel.id);

                      // Set the selected model as current (use runtimeModelId, not prefixed id)
                      await config.setModel(selectedModel.id);
                      setCurrentModel(selectedModel.id);
                      
                      // Set provider to openai-compatible
                      settings.setValue(SettingScope.User, 'contentGenerator.provider', 'openai-compatible');
                      
                      // Close the dialog properly like handleAuthSelect does
                      await handleAuthSelect(AuthType.USE_OPENAI, SettingScope.User);
                    } catch (error) {
                      console.error('Failed to setup Kolosal Cloud models:', error);
                    }
                  }}
                  onCancel={() => setAuthFlowStage('selection')}
                />
              ) : authFlowStage === 'openai' ? (
                <AuthDialog
                  onSelect={handleAuthSelect}
                  onCancel={() => setAuthFlowStage('selection')}
                  settings={settings}
                  initialErrorMessage={authError}
                  onModelConfigured={async ({ model, baseUrl, apiKey }) => {
                    if (!model) {
                      return;
                    }
                    upsertSavedModel({
                      id: model,
                      label: model,
                      provider: 'openai-compatible',
                      baseUrl: baseUrl || undefined,
                      authType: AuthType.USE_OPENAI,
                      apiKey: apiKey || undefined,
                    });
                    try {
                      await config.setModel(model);
                      setCurrentModel(model);
                    } catch (error) {
                      console.error('Failed to select authenticated model:', error);
                    }
                  }}
                />
              ) : (
                <AuthSelectionDialog
                  defaultChoice={defaultAuthSelectionChoice}
                  initialErrorMessage={authError}
                  onSelect={(choice) => {
                    void handleAuthSelectionChoice(choice);
                  }}
                  onCancel={() => {
                    setAuthFlowStage('selection');
                    handleAuthCancel();
                  }}
                  canCancel={hasExistingModelOrAuth}
                />
              )}
            </Box>
          ) : isEditorDialogOpen ? (
            <Box flexDirection="column">
              {editorError && (
                <Box marginBottom={1}>
                  <Text color={Colors.AccentRed}>{editorError}</Text>
                </Box>
              )}
              <EditorSettingsDialog
                onSelect={handleEditorSelect}
                settings={settings}
                onExit={exitEditorDialog}
              />
            </Box>
          ) : isModelSelectionDialogOpen ? (
            <ModelSelectionDialog
              availableModels={getAvailableModelsForCurrentAuth()}
              currentModel={currentModel}
              onSelect={handleModelSelect}
              onCancel={handleModelSelectionClose}
              onDelete={handleModelDeleteRequest}
            />
          ) : isModelDeleteDialogOpen && modelToDelete ? (
            <ModelDeleteConfirmationDialog
              model={modelToDelete}
              onSelect={handleModelDeleteConfirm}
            />
          ) : isVisionSwitchDialogOpen ? (
            <ModelSwitchDialog onSelect={handleVisionSwitchSelect} />
          ) : showPrivacyNotice ? (
            <PrivacyNotice
              onExit={() => setShowPrivacyNotice(false)}
              config={config}
            />
          ) : (
            <>
              <LoadingIndicator
                thought={
                  streamingState === StreamingState.WaitingForConfirmation ||
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : thought
                }
                currentLoadingPhrase={
                  config.getAccessibility()?.disableLoadingPhrases ||
                  config.getScreenReader()
                    ? undefined
                    : currentLoadingPhrase
                }
                elapsedTime={elapsedTime}
              />

              {/* Display queued messages below loading indicator */}
              {messageQueue.length > 0 && (
                <Box flexDirection="column" marginTop={1}>
                  {messageQueue
                    .slice(0, MAX_DISPLAYED_QUEUED_MESSAGES)
                    .map((message, index) => {
                      // Ensure multi-line messages are collapsed for the preview.
                      // Replace all whitespace (including newlines) with a single space.
                      const preview = message.replace(/\s+/g, ' ');

                      return (
                        // Ensure the Box takes full width so truncation calculates correctly
                        <Box key={index} paddingLeft={2} width="100%">
                          {/* Use wrap="truncate" to ensure it fits the terminal width and doesn't wrap */}
                          <Text dimColor wrap="truncate">
                            {preview}
                          </Text>
                        </Box>
                      );
                    })}
                  {messageQueue.length > MAX_DISPLAYED_QUEUED_MESSAGES && (
                    <Box paddingLeft={2}>
                      <Text dimColor>
                        ... (+
                        {messageQueue.length - MAX_DISPLAYED_QUEUED_MESSAGES}
                        more)
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              <Box
                marginTop={1}
                justifyContent="space-between"
                width="100%"
                flexDirection={isNarrow ? 'column' : 'row'}
                alignItems={isNarrow ? 'flex-start' : 'center'}
              >
                <Box>
                  {process.env['GEMINI_SYSTEM_MD'] && (
                    <Text color={Colors.AccentRed}>|⌐■_■| </Text>
                  )}
                  {ctrlCPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      Press Ctrl+C again to confirm exit.
                    </Text>
                  ) : ctrlDPressedOnce ? (
                    <Text color={Colors.AccentYellow}>
                      Press Ctrl+D again to exit.
                    </Text>
                  ) : showEscapePrompt ? (
                    <Text color={Colors.Gray}>Press Esc again to clear.</Text>
                  ) : (
                    <ContextSummaryDisplay
                      ideContext={ideContextState}
                      geminiMdFileCount={geminiMdFileCount}
                      contextFileNames={contextFileNames}
                      mcpServers={config.getMcpServers()}
                      blockedMcpServers={config.getBlockedMcpServers()}
                      showToolDescriptions={showToolDescriptions}
                    />
                  )}
                </Box>
                <Box paddingTop={isNarrow ? 1 : 0}>
                  {showAutoAcceptIndicator !== ApprovalMode.DEFAULT &&
                    !shellModeActive && (
                      <AutoAcceptIndicator
                        approvalMode={showAutoAcceptIndicator}
                      />
                    )}
                  {shellModeActive && <ShellModeIndicator />}
                </Box>
              </Box>

              {showErrorDetails && (
                <OverflowProvider>
                  <Box flexDirection="column">
                    <DetailedMessagesDisplay
                      messages={filteredConsoleMessages}
                      maxHeight={
                        constrainHeight ? debugConsoleMaxHeight : undefined
                      }
                      width={inputWidth}
                    />
                    <ShowMoreLines constrainHeight={constrainHeight} />
                  </Box>
                </OverflowProvider>
              )}

              {isInputActive && (
                <Box marginLeft={1} flexDirection="column">
                  <InputPrompt
                    buffer={buffer}
                    inputWidth={inputWidth}
                    suggestionsWidth={suggestionsWidth}
                    onSubmit={handleFinalSubmit}
                    userMessages={userMessages}
                    onClearScreen={handleClearScreen}
                    config={config}
                    slashCommands={slashCommands}
                    commandContext={commandContext}
                    shellModeActive={shellModeActive}
                    setShellModeActive={setShellModeActive}
                    onEscapePromptChange={handleEscapePromptChange}
                    focus={isFocused}
                    vimHandleInput={vimHandleInput}
                    placeholder={placeholder}
                  />
                </Box>
              )}
            </>
          )}

          {initError && streamingState !== StreamingState.Responding && (
            <LeftBorderPanel
              accentColor={Colors.AccentRed}
              width="100%"
              marginLeft={1}
              marginTop={1}
              marginBottom={1}
              contentProps={{
                flexDirection: 'column',
                padding: 1,
              }}
            >
              {history.find(
                (item) =>
                  item.type === 'error' && item.text?.includes(initError),
              )?.text ? (
                <Text color={Colors.AccentRed}>
                  {
                    history.find(
                      (item) =>
                        item.type === 'error' && item.text?.includes(initError),
                    )?.text
                  }
                </Text>
              ) : (
                <>
                  <Text color={Colors.AccentRed}>
                    Initialization Error: {initError}
                  </Text>
                  <Text color={Colors.AccentRed}>
                    {' '}
                    Please check API key and configuration.
                  </Text>
                </>
              )}
            </LeftBorderPanel>
          )}
          {!settings.merged.ui?.hideFooter && (
            <Footer
              model={currentModel}
              targetDir={config.getTargetDir()}
              debugMode={config.getDebugMode()}
              branchName={branchName}
              debugMessage={debugMessage}
              corgiMode={corgiMode}
              errorCount={errorCount}
              showErrorDetails={showErrorDetails}
              showMemoryUsage={
                config.getDebugMode() ||
                settings.merged.ui?.showMemoryUsage ||
                false
              }
              promptTokenCount={sessionStats.lastPromptTokenCount}
              nightly={nightly}
              vimMode={vimModeEnabled ? vimMode : undefined}
              isTrustedFolder={isTrustedFolderState}
            />
          )}
        </Box>
      </Box>
    </StreamingContext.Provider>
  );
};

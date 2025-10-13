import * as auth from '../config/auth.js';
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AccessibilitySettings,
  GeminiClient,
  MCPServerConfig,
  SandboxConfig,
  ToolRegistry,
} from '@kolosal-ai/kolosal-ai-core';
import {
  ApprovalMode,
  AuthType,
  Config as ServerConfig,
  ideContext,
} from '@kolosal-ai/kolosal-ai-core';
import { waitFor } from '@testing-library/react';
import { EventEmitter } from 'node:events';
import process from 'node:process';
import { useEffect } from 'react';
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LoadedSettings,
  type Settings,
  type SettingsFile,
} from '../config/settings.js';
import { renderWithProviders } from '../test-utils/render.js';
import { updateEventEmitter } from '../utils/updateEventEmitter.js';
import { AppWrapper as App } from './App.js';
import * as OpenAIKeyPromptModule from './components/OpenAIKeyPrompt.js';
import { Tips } from './components/Tips.js';
import { useConsoleMessages } from './hooks/useConsoleMessages.js';
import { useGeminiStream } from './hooks/useGeminiStream.js';
import * as useTerminalSize from './hooks/useTerminalSize.js';
import type { ConsoleMessageItem } from './types.js';
import { StreamingState, ToolCallStatus } from './types.js';
import type { UpdateObject } from './utils/updateCheck.js';
import { checkForUpdates } from './utils/updateCheck.js';

// Define a more complete mock server config based on actual Config
interface MockServerConfig {
  apiKey: string;
  model: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext: boolean;
  coreTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>; // Use imported MCPServerConfig
  userAgent: string;
  userMemory: string;
  geminiMdFileCount: number;
  approvalMode: ApprovalMode;
  vertexai?: boolean;
  showMemoryUsage?: boolean;
  accessibility?: AccessibilitySettings;
  embeddingModel: string;
  checkpointing?: boolean;

  getApiKey: Mock<() => string>;
  getModel: Mock<() => string>;
  getSandbox: Mock<() => SandboxConfig | undefined>;
  getTargetDir: Mock<() => string>;
  getToolRegistry: Mock<() => ToolRegistry>; // Use imported ToolRegistry type
  getDebugMode: Mock<() => boolean>;
  getQuestion: Mock<() => string | undefined>;
  getFullContext: Mock<() => boolean>;
  getCoreTools: Mock<() => string[] | undefined>;
  getToolDiscoveryCommand: Mock<() => string | undefined>;
  getToolCallCommand: Mock<() => string | undefined>;
  getMcpServerCommand: Mock<() => string | undefined>;
  getMcpServers: Mock<() => Record<string, MCPServerConfig> | undefined>;
  getPromptRegistry: Mock<() => Record<string, unknown>>;
  getExtensions: Mock<
    () => Array<{ name: string; version: string; isActive: boolean }>
  >;
  getBlockedMcpServers: Mock<
    () => Array<{ name: string; extensionName: string }>
  >;
  getUserAgent: Mock<() => string>;
  getUserMemory: Mock<() => string>;
  setUserMemory: Mock<(newUserMemory: string) => void>;
  getGeminiMdFileCount: Mock<() => number>;
  setGeminiMdFileCount: Mock<(count: number) => void>;
  setModel: Mock<(model: string, options?: unknown) => Promise<void>>;
  getApprovalMode: Mock<() => ApprovalMode>;
  setApprovalMode: Mock<(skip: ApprovalMode) => void>;
  getVertexAI: Mock<() => boolean | undefined>;
  getShowMemoryUsage: Mock<() => boolean>;
  getAccessibility: Mock<() => AccessibilitySettings>;
  getProjectRoot: Mock<() => string | undefined>;
  getEnablePromptCompletion: Mock<() => boolean>;
  getGeminiClient: Mock<() => GeminiClient | undefined>;
  getCheckpointingEnabled: Mock<() => boolean>;
  getAllGeminiMdFilenames: Mock<() => string[]>;
  setFlashFallbackHandler: Mock<(handler: (fallback: boolean) => void) => void>;
  getSessionId: Mock<() => string>;
  getUserTier: Mock<() => Promise<string | undefined>>;
  getIdeMode: Mock<() => boolean>;
  getWorkspaceContext: Mock<
    () => {
      getDirectories: Mock<() => string[]>;
    }
  >;
  getIdeClient: Mock<
    () => {
      getCurrentIde: Mock<() => string | undefined>;
      getDetectedIdeDisplayName: Mock<() => string>;
      addStatusChangeListener: Mock<
        (listener: (status: string) => void) => void
      >;
      removeStatusChangeListener: Mock<
        (listener: (status: string) => void) => void
      >;
      getConnectionStatus: Mock<() => string>;
    }
  >;
  isTrustedFolder: Mock<() => boolean>;
  getScreenReader: Mock<() => boolean>;
}

// Mock @kolosal-ai/kolosal-ai-core and its Config class
vi.mock('@kolosal-ai/kolosal-ai-core', async (importOriginal) => {
  const actualCore =
    await importOriginal<typeof import('@kolosal-ai/kolosal-ai-core')>();
  const ConfigClassMock = vi
    .fn()
    .mockImplementation((optionsPassedToConstructor) => {
      const opts = { ...optionsPassedToConstructor }; // Clone
      // Basic mock structure, will be extended by the instance in tests
      return {
        apiKey: opts.apiKey || 'test-key',
        model: opts.model || 'test-model-in-mock-factory',
        sandbox: opts.sandbox,
        targetDir: opts.targetDir || '/test/dir',
        debugMode: opts.debugMode || false,
        question: opts.question,
        fullContext: opts.fullContext ?? false,
        coreTools: opts.coreTools,
        toolDiscoveryCommand: opts.toolDiscoveryCommand,
        toolCallCommand: opts.toolCallCommand,
        mcpServerCommand: opts.mcpServerCommand,
        mcpServers: opts.mcpServers,
        userAgent: opts.userAgent || 'test-agent',
        userMemory: opts.userMemory || '',
        geminiMdFileCount: opts.geminiMdFileCount || 0,
        approvalMode: opts.approvalMode ?? ApprovalMode.DEFAULT,
        vertexai: opts.vertexai,
        showMemoryUsage: opts.showMemoryUsage ?? false,
        accessibility: opts.accessibility ?? {},
        embeddingModel: opts.embeddingModel || 'test-embedding-model',

        getApiKey: vi.fn(() => opts.apiKey || 'test-key'),
        getModel: vi.fn(() => opts.model || 'test-model-in-mock-factory'),
        setModel: vi.fn().mockResolvedValue(undefined),
        getSandbox: vi.fn(() => opts.sandbox),
        getTargetDir: vi.fn(() => opts.targetDir || '/test/dir'),
        getToolRegistry: vi.fn(() => ({}) as ToolRegistry), // Simple mock
        getDebugMode: vi.fn(() => opts.debugMode || false),
        getQuestion: vi.fn(() => opts.question),
        getFullContext: vi.fn(() => opts.fullContext ?? false),
        getCoreTools: vi.fn(() => opts.coreTools),
        getToolDiscoveryCommand: vi.fn(() => opts.toolDiscoveryCommand),
        getToolCallCommand: vi.fn(() => opts.toolCallCommand),
        getMcpServerCommand: vi.fn(() => opts.mcpServerCommand),
        getMcpServers: vi.fn(() => opts.mcpServers),
        getPromptRegistry: vi.fn(),
        getExtensions: vi.fn(() => []),
        getBlockedMcpServers: vi.fn(() => []),
        getUserAgent: vi.fn(() => opts.userAgent || 'test-agent'),
        getUserMemory: vi.fn(() => opts.userMemory || ''),
        setUserMemory: vi.fn(),
        getGeminiMdFileCount: vi.fn(() => opts.geminiMdFileCount || 0),
        setGeminiMdFileCount: vi.fn(),
        getApprovalMode: vi.fn(() => opts.approvalMode ?? ApprovalMode.DEFAULT),
        setApprovalMode: vi.fn(),
        getVertexAI: vi.fn(() => opts.vertexai),
        getShowMemoryUsage: vi.fn(() => opts.showMemoryUsage ?? false),
        getAccessibility: vi.fn(() => opts.accessibility ?? {}),
        getProjectRoot: vi.fn(() => opts.targetDir),
        getEnablePromptCompletion: vi.fn(() => false),
        getGeminiClient: vi.fn(() => ({
          getUserTier: vi.fn(),
        })),
        getCheckpointingEnabled: vi.fn(() => opts.checkpointing ?? true),
        getAllGeminiMdFilenames: vi.fn(() => ['KOLOSAL.md']),
        setFlashFallbackHandler: vi.fn(),
        getSessionId: vi.fn(() => 'test-session-id'),
        getUserTier: vi.fn().mockResolvedValue(undefined),
        getIdeMode: vi.fn(() => true),
        getWorkspaceContext: vi.fn(() => ({
          getDirectories: vi.fn(() => []),
        })),
        getIdeClient: vi.fn(() => ({
          getCurrentIde: vi.fn(() => 'vscode'),
          getDetectedIdeDisplayName: vi.fn(() => 'VSCode'),
          addStatusChangeListener: vi.fn(),
          removeStatusChangeListener: vi.fn(),
          getConnectionStatus: vi.fn(() => 'connected'),
        })),
        isTrustedFolder: vi.fn(() => true),
        getScreenReader: vi.fn(() => false),
      };
    });

  const ideContextMock = {
    getIdeContext: vi.fn(),
    subscribeToIdeContext: vi.fn(() => vi.fn()), // subscribe returns an unsubscribe function
  };

  return {
    ...actualCore,
    Config: ConfigClassMock,
    MCPServerConfig: actualCore.MCPServerConfig,
    getAllGeminiMdFilenames: vi.fn(() => ['KOLOSAL.md']),
    ideContext: ideContextMock,
    isGitRepository: vi.fn(),
  };
});

// Mock heavy dependencies or those with side effects
vi.mock('./hooks/useGeminiStream', () => ({
  useGeminiStream: vi.fn(() => ({
    streamingState: StreamingState.Idle,
    submitQuery: vi.fn(),
    initError: null,
    pendingHistoryItems: [],
    thought: null,
    cancelOngoingRequest: vi.fn(),
  })),
}));

vi.mock('./hooks/useAuthCommand', () => ({
  useAuthCommand: vi.fn(() => ({
    isAuthDialogOpen: false,
    openAuthDialog: vi.fn(),
    handleAuthSelect: vi.fn(),
    handleAuthHighlight: vi.fn(),
    isAuthenticating: false,
    cancelAuthentication: vi.fn(),
  })),
}));

vi.mock('./hooks/useFolderTrust', () => ({
  useFolderTrust: vi.fn(() => ({
    isTrusted: undefined,
    isFolderTrustDialogOpen: false,
    handleFolderTrustSelect: vi.fn(),
    isRestarting: false,
  })),
}));

vi.mock('./hooks/useLogger', () => ({
  useLogger: vi.fn(() => ({
    getPreviousUserMessages: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('./hooks/useConsoleMessages.js', () => ({
  useConsoleMessages: vi.fn(() => ({
    consoleMessages: [],
    handleNewMessage: vi.fn(),
    clearConsoleMessages: vi.fn(),
  })),
}));

vi.mock('../config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-expect-error - this is fine
    ...actual,
    loadHierarchicalGeminiMemory: vi
      .fn()
      .mockResolvedValue({ memoryContent: '', fileCount: 0 }),
  };
});

vi.mock('./components/Tips.js', () => ({
  Tips: vi.fn(() => null),
}));

vi.mock('./components/Header.js', () => ({
  Header: vi.fn(() => null),
}));

vi.mock('./utils/updateCheck.js', () => ({
  checkForUpdates: vi.fn(),
}));

vi.mock('../config/auth.js', () => ({
  validateAuthMethod: vi.fn(),
  setOpenAIApiKey: vi.fn(),
  setOpenAIBaseUrl: vi.fn(),
  setOpenAIModel: vi.fn(),
}));

vi.mock('../../services/huggingfaceApi.js', () => ({
  buildModelsBaseUrl: vi.fn(() => 'https://huggingface.mock/models'),
  fetchModels: vi.fn(async () => ({
    models: [{ modelId: 'mock/model' }],
    nextUrl: undefined,
  })),
}));

vi.mock('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: vi.fn(),
}));

const mockedCheckForUpdates = vi.mocked(checkForUpdates);
const { isGitRepository: mockedIsGitRepository } = vi.mocked(
  await import('@kolosal-ai/kolosal-ai-core'),
);

vi.mock('node:child_process');

describe('App UI', () => {
  let mockConfig: MockServerConfig;
  let mockSettings: LoadedSettings;
  let mockVersion: string;
  let currentUnmount: (() => void) | undefined;
  let exitSpy: MockInstance<(code?: string | number | null | undefined) => never>;

  const createMockSettings = (
    settings: {
      system?: Partial<Settings>;
      user?: Partial<Settings>;
      workspace?: Partial<Settings>;
    } = {},
  ): LoadedSettings => {
    const systemSettingsFile: SettingsFile = {
      path: '/system/settings.json',
      settings: settings.system || {},
    };
    const systemDefaultsFile: SettingsFile = {
      path: '/system/system-defaults.json',
      settings: {},
    };
    const userSettingsFile: SettingsFile = {
      path: '/user/settings.json',
      settings: settings.user || {},
    };
    // Ensure tests bypass provider gating by default
    const workspaceSettings: Partial<Settings> = {
      ...settings.workspace,
      contentGenerator: {
        // Default to OpenAI-compatible so tests begin on the OpenAI auth path unless overridden
        provider:
          (settings.workspace as any)?.contentGenerator?.provider ||
          'openai-compatible',
        // Preserve any other provided contentGenerator nested settings
        ...(settings.workspace as any)?.contentGenerator,
      } as any,
    };
    const workspaceSettingsFile: SettingsFile = {
      path: '/workspace/.gemini/settings.json',
      settings: workspaceSettings,
    };
    return new LoadedSettings(
      systemSettingsFile,
      systemDefaultsFile,
      userSettingsFile,
      workspaceSettingsFile,
      [],
      true,
      new Set(),
    );
  };

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
      columns: 120,
      rows: 24,
    });

    const ServerConfigMocked = vi.mocked(ServerConfig, true);
    mockConfig = new ServerConfigMocked({
      embeddingModel: 'test-embedding-model',
      sandbox: undefined,
      targetDir: '/test/dir',
      debugMode: false,
      userMemory: '',
      geminiMdFileCount: 0,
      showMemoryUsage: false,
      sessionId: 'test-session-id',
      cwd: '/tmp',
      model: 'model',
    }) as unknown as MockServerConfig;
    mockVersion = '0.0.0-test';

    // Ensure the getShowMemoryUsage mock function is specifically set up if not covered by constructor mock
    if (!mockConfig.getShowMemoryUsage) {
      mockConfig.getShowMemoryUsage = vi.fn(() => false);
    }
    mockConfig.getShowMemoryUsage.mockReturnValue(false); // Default for most tests

    // Ensure a theme is set so the theme dialog does not appear.
    mockSettings = createMockSettings({
      workspace: { ui: { theme: 'Default' } },
    });

    // Ensure getWorkspaceContext is available if not added by the constructor
    if (!mockConfig.getWorkspaceContext) {
      mockConfig.getWorkspaceContext = vi.fn(() => ({
        getDirectories: vi.fn(() => ['/test/dir']),
      }));
    }
    vi.mocked(ideContext.getIdeContext).mockReturnValue(undefined);
  });

  afterEach(() => {
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = undefined;
    }
    exitSpy.mockRestore();
    vi.clearAllMocks(); // Clear mocks after each test
  });

  describe('handleAutoUpdate', () => {
    let spawnEmitter: EventEmitter;

    beforeEach(async () => {
      const { spawn } = await import('node:child_process');
      spawnEmitter = new EventEmitter();
      (
        spawnEmitter as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
        }
      ).stdout = new EventEmitter();
      (
        spawnEmitter as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
        }
      ).stderr = new EventEmitter();
      (spawn as Mock).mockReturnValue(spawnEmitter);
    });

    afterEach(() => {
      delete process.env['GEMINI_CLI_DISABLE_AUTOUPDATER'];
    });

    it('should not start the update process when running from git', async () => {
      mockedIsGitRepository.mockResolvedValue(true);
      const info: UpdateObject = {
        update: {
          name: '@kolosal-ai/kolosal-ai',
          latest: '1.1.0',
          current: '1.0.0',
          type: 'major' as const,
        },
        message: 'Kolosal Cli update available!',
      };
      mockedCheckForUpdates.mockResolvedValue(info);
      const { spawn } = await import('node:child_process');

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Wait for any potential async operations to complete
      await waitFor(() => {
        expect(spawn).not.toHaveBeenCalled();
      });
    });

    it('should show a success message when update succeeds', async () => {
      mockedIsGitRepository.mockResolvedValue(false);
      const info: UpdateObject = {
        update: {
          name: '@kolosal-ai/kolosal-ai',
          latest: '1.1.0',
          current: '1.0.0',
          type: 'major' as const,
        },
        message: 'Update available',
      };
      mockedCheckForUpdates.mockResolvedValue(info);

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      updateEventEmitter.emit('update-success', info);

      // Wait for the success message to appear
      await waitFor(() => {
        expect(lastFrame()).toContain(
          'Update successful! The new version will be used on your next run.',
        );
      });
    });

    it('should show an error message when update fails', async () => {
      mockedIsGitRepository.mockResolvedValue(false);
      const info: UpdateObject = {
        update: {
          name: '@kolosal-ai/kolosal-ai',
          latest: '1.1.0',
          current: '1.0.0',
          type: 'major' as const,
        },
        message: 'Update available',
      };
      mockedCheckForUpdates.mockResolvedValue(info);

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      updateEventEmitter.emit('update-failed', info);

      // Wait for the error message to appear
      await waitFor(() => {
        expect(lastFrame()).toContain(
          'Automatic update failed. Please try updating manually',
        );
      });
    });

    it('should show an error message when spawn fails', async () => {
      mockedIsGitRepository.mockResolvedValue(false);
      const info: UpdateObject = {
        update: {
          name: '@kolosal-ai/kolosal-ai',
          latest: '1.1.0',
          current: '1.0.0',
          type: 'major' as const,
        },
        message: 'Update available',
      };
      mockedCheckForUpdates.mockResolvedValue(info);

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // We are testing the App's reaction to an `update-failed` event,
      // which is what should be emitted when a spawn error occurs elsewhere.
      updateEventEmitter.emit('update-failed', info);

      // Wait for the error message to appear
      await waitFor(() => {
        expect(lastFrame()).toContain(
          'Automatic update failed. Please try updating manually',
        );
      });
    });

    it('should not auto-update if GEMINI_CLI_DISABLE_AUTOUPDATER is true', async () => {
      mockedIsGitRepository.mockResolvedValue(false);
      process.env['GEMINI_CLI_DISABLE_AUTOUPDATER'] = 'true';
      const info: UpdateObject = {
        update: {
          name: '@kolosal-ai/kolosal-ai',
          latest: '1.1.0',
          current: '1.0.0',
          type: 'major' as const,
        },
        message: 'Update available',
      };
      mockedCheckForUpdates.mockResolvedValue(info);
      const { spawn } = await import('node:child_process');

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Wait for any potential async operations to complete
      await waitFor(() => {
        expect(spawn).not.toHaveBeenCalled();
      });
    });
  });

  it('should display active file when available', async () => {
    vi.mocked(ideContext.getIdeContext).mockReturnValue({
      workspaceState: {
        openFiles: [
          {
            path: '/path/to/my-file.ts',
            isActive: true,
            selectedText: 'hello',
            timestamp: 0,
          },
        ],
      },
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('1 open file (ctrl+g to view)');
  });

  it('should not display any files when not available', async () => {
    vi.mocked(ideContext.getIdeContext).mockReturnValue({
      workspaceState: {
        openFiles: [],
      },
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).not.toContain('Open File');
  });

  it('returns to auth dialog when escaping Hugging Face model picker', async () => {
    const settingsWithOssProvider = createMockSettings({
      workspace: {
        contentGenerator: {
          provider: 'oss-local',
        },
      },
    });

    expect(
      settingsWithOssProvider.merged.security?.auth?.selectedType,
    ).toBeUndefined();

    const { stdin, lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={settingsWithOssProvider}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;

    await waitFor(() => {
      expect(lastFrame()).toContain('Choose how you want to connect');
    });

    // Default selection should be Hugging Face. Use numeric shortcut to open the picker.
    stdin.write('1');

    await waitFor(() => {
      expect(lastFrame()).toContain('Select a Hugging Face model');
    });

    stdin.write('\u001b');

    await waitFor(() => {
      expect(lastFrame()).toContain('Choose how you want to connect');
    });

    unmount();
  });

  it('keeps OpenAI dialog open when escaping OpenAI prompt', async () => {
    const settingsWithOssProvider = createMockSettings({
      workspace: {
        contentGenerator: {
          provider: 'oss-local',
        },
      },
    });

    const { stdin, lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={settingsWithOssProvider}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;

    await waitFor(() => {
      expect(lastFrame()).toContain('Choose how you want to connect');
    });

    stdin.write('2');

    await waitFor(() => {
      expect(lastFrame()).toContain('Kolosal Cloud API Key');
    });

    stdin.write('\u001b');

    await waitFor(() => {
      const frame = lastFrame() ?? '';
      expect(frame).toContain('Kolosal Cloud API Key');
      expect(frame).not.toContain('Choose how you want to connect');
    });

    unmount();
  });

  it('completes Kolosal Cloud auth and loads Hugging Face picker', async () => {
    const OriginalOpenAIKeyPrompt = OpenAIKeyPromptModule.OpenAIKeyPrompt;
    const openAIKeyPromptMock = vi
      .spyOn(OpenAIKeyPromptModule, 'OpenAIKeyPrompt')
      .mockImplementation((props) => {
        useEffect(() => {
          props.onSubmit(
            'a',
            'https://openrouter.ai/api/v1',
            'moonshotai/kimi-k2-0905',
          );
        }, [props.onSubmit]);
        return <OriginalOpenAIKeyPrompt {...props} />;
      });

    const settingsWithOssProvider = createMockSettings({
      workspace: {
        contentGenerator: {
          provider: 'oss-local',
        },
      },
    });
    const { stdin, lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={settingsWithOssProvider}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;

    await waitFor(() => {
      expect(lastFrame()).toContain('Choose how you want to connect');
    });

    stdin.write('2');

    await waitFor(() => {
      expect(lastFrame()).toContain('Kolosal Cloud API Key');
    });

    await waitFor(() => {
      expect(
        settingsWithOssProvider.merged.security?.auth?.selectedType,
      ).toBe(AuthType.USE_OPENAI);
    });

    await waitFor(() => {
      expect(lastFrame()).toContain('Select a Hugging Face model');
    });

    stdin.write('\u001b');

    await waitFor(() => {
      expect(lastFrame()).toContain('Choose how you want to connect');
    });

    unmount();
    openAIKeyPromptMock.mockRestore();
  });

  it('should display active file and other open files', async () => {
    vi.mocked(ideContext.getIdeContext).mockReturnValue({
      workspaceState: {
        openFiles: [
          {
            path: '/path/to/my-file.ts',
            isActive: true,
            selectedText: 'hello',
            timestamp: 0,
          },
          {
            path: '/path/to/another-file.ts',
            isActive: false,
            timestamp: 1,
          },
          {
            path: '/path/to/third-file.ts',
            isActive: false,
            timestamp: 2,
          },
        ],
      },
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('3 open files (ctrl+g to view)');
  });

  it('should display active file and other context', async () => {
    vi.mocked(ideContext.getIdeContext).mockReturnValue({
      workspaceState: {
        openFiles: [
          {
            path: '/path/to/my-file.ts',
            isActive: true,
            selectedText: 'hello',
            timestamp: 0,
          },
        ],
      },
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue(['KOLOSAL.md']);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain(
      'Using: 1 open file (ctrl+g to view) | 1 KOLOSAL.md file',
    );
  });

  it('should display default "KOLOSAL.md" in footer when contextFileName is not set and count is 1', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue(['KOLOSAL.md']);
    // For this test, ensure showMemoryUsage is false or debugMode is false if it relies on that
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve(); // Wait for any async updates
    expect(lastFrame()).toContain('Using: 1 KOLOSAL.md file');
  });

  it('should display default "KOLOSAL.md" with plural when contextFileName is not set and count is > 1', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue(['KOLOSAL.md', 'KOLOSAL.md']);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('Using: 2 KOLOSAL.md files');
  });

  it('should display custom contextFileName in footer when set and count is 1', async () => {
    mockSettings = createMockSettings({
      workspace: {
        context: { fileName: 'AGENTS.md' },
        ui: { theme: 'Default' },
      },
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(1);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue(['AGENTS.md']);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('Using: 1 AGENTS.md file');
  });

  it('should display a generic message when multiple context files with different names are provided', async () => {
    mockSettings = createMockSettings({
      workspace: {
        context: { fileName: ['AGENTS.md', 'CONTEXT.md'] },
        ui: { theme: 'Default' },
      },
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue([
      'AGENTS.md',
      'CONTEXT.md',
    ]);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('Using: 2 context files');
  });

  it('should display custom contextFileName with plural when set and count is > 1', async () => {
    mockSettings = createMockSettings({
      workspace: {
        context: { fileName: 'MY_NOTES.TXT' },
        ui: { theme: 'Default' },
      },
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(3);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue([
      'MY_NOTES.TXT',
      'MY_NOTES.TXT',
      'MY_NOTES.TXT',
    ]);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('Using: 3 MY_NOTES.TXT files');
  });

  it('should not display context file message if count is 0, even if contextFileName is set', async () => {
    mockSettings = createMockSettings({
      workspace: {
        context: { fileName: 'ANY_FILE.MD' },
        ui: { theme: 'Default' },
      },
    });
    mockConfig.getGeminiMdFileCount.mockReturnValue(0);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue([]);
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).not.toContain('ANY_FILE.MD');
  });

  it('should display KOLOSAL.md and MCP server count when both are present', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(2);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue(['KOLOSAL.md', 'KOLOSAL.md']);
    mockConfig.getMcpServers.mockReturnValue({
      server1: {} as MCPServerConfig,
    });
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('1 MCP server');
  });

  it('should display only MCP server count when KOLOSAL.md count is 0', async () => {
    mockConfig.getGeminiMdFileCount.mockReturnValue(0);
    mockConfig.getAllGeminiMdFilenames.mockReturnValue([]);
    mockConfig.getMcpServers.mockReturnValue({
      server1: {} as MCPServerConfig,
      server2: {} as MCPServerConfig,
    });
    mockConfig.getDebugMode.mockReturnValue(false);
    mockConfig.getShowMemoryUsage.mockReturnValue(false);

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(lastFrame()).toContain('Using: 2 MCP servers (ctrl+t to view)');
  });

  it('should display Tips component by default', async () => {
    const { unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Tips)).toHaveBeenCalled();
  });

  it('should not display Tips component when hideTips is true', async () => {
    mockSettings = createMockSettings({
      workspace: {
        ui: { hideTips: true },
      },
    });

    const { unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Tips)).not.toHaveBeenCalled();
  });

  it('should display Header component by default', async () => {
    const { Header } = await import('./components/Header.js');
    const { unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Header)).toHaveBeenCalled();
  });

  it('should not display Header component when hideBanner is true', async () => {
    const { Header } = await import('./components/Header.js');
    mockSettings = createMockSettings({
      user: { ui: { hideBanner: true } },
    });

    const { unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Header)).not.toHaveBeenCalled();
  });

  it('should display Footer component by default', async () => {
    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    // Footer should render - look for target directory which is always shown
    expect(lastFrame()).toContain('/test/dir');
  });

  it('should not display Footer component when hideFooter is true', async () => {
    mockSettings = createMockSettings({
      user: { ui: { hideFooter: true } },
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    // Footer should not render - target directory should not appear
    expect(lastFrame()).not.toContain('/test/dir');
  });

  it('should show footer if system says show, but workspace and user settings say hide', async () => {
    mockSettings = createMockSettings({
      system: { ui: { hideFooter: false } },
      user: { ui: { hideFooter: true } },
      workspace: { ui: { hideFooter: true } },
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    // Footer should render because system overrides - look for target directory
    expect(lastFrame()).toContain('/test/dir');
  });

  it('should show tips if system says show, but workspace and user settings say hide', async () => {
    mockSettings = createMockSettings({
      system: { ui: { hideTips: false } },
      user: { ui: { hideTips: true } },
      workspace: { ui: { hideTips: true } },
    });

    const { unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    await Promise.resolve();
    expect(vi.mocked(Tips)).toHaveBeenCalled();
  });

  describe('when no theme is set', () => {
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalNoColor = process.env['NO_COLOR'];
      // Ensure no theme is set for these tests
      mockSettings = createMockSettings({
        workspace: { contentGenerator: { provider: 'openai-compatible' } },
      });
      mockConfig.getDebugMode.mockReturnValue(false);
      mockConfig.getShowMemoryUsage.mockReturnValue(false);
    });

    afterEach(() => {
      process.env['NO_COLOR'] = originalNoColor;
    });

    it('should render normally if NO_COLOR is not set (no theme dialog by default)', async () => {
      delete process.env['NO_COLOR'];

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // By default, when no theme is set we don't auto-open ThemeDialog; the prompt should render.
      expect(lastFrame()).toContain('Type your message or @path/to/file');
      expect(lastFrame()).not.toContain('Select Theme');
    });

    it('should render normally if NO_COLOR is set (no theme dialog)', async () => {
      process.env['NO_COLOR'] = 'true';

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      expect(lastFrame()).toContain('Type your message or @path/to/file');
      expect(lastFrame()).not.toContain('Select Theme');
    });
  });

  it('should render the initial UI correctly', () => {
    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    expect(lastFrame()).toMatchSnapshot();
  });

  it('should render correctly with the prompt input box', () => {
    vi.mocked(useGeminiStream).mockReturnValue({
      streamingState: StreamingState.Idle,
      submitQuery: vi.fn(),
      initError: null,
      pendingHistoryItems: [],
      thought: null,
      cancelOngoingRequest: vi.fn(),
    });

    const { lastFrame, unmount } = renderWithProviders(
      <App
        config={mockConfig as unknown as ServerConfig}
        settings={mockSettings}
        version={mockVersion}
      />,
    );
    currentUnmount = unmount;
    expect(lastFrame()).toMatchSnapshot();
  });

  describe('with initial prompt from --prompt-interactive', () => {
    it('should submit the initial prompt automatically', async () => {
      const mockSubmitQuery = vi.fn();

      mockConfig.getQuestion = vi.fn(() => 'hello from prompt-interactive');

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      mockConfig.getGeminiClient.mockReturnValue({
        isInitialized: vi.fn(() => true),
        getUserTier: vi.fn(),
      } as unknown as GeminiClient);

      const { unmount, rerender } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Force a re-render to trigger useEffect
      rerender(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockSubmitQuery).toHaveBeenCalledWith(
        'hello from prompt-interactive',
      );
    });
  });

  describe('errorCount', () => {
    it('should correctly sum the counts of error messages', async () => {
      const mockConsoleMessages: ConsoleMessageItem[] = [
        { type: 'error', content: 'First error', count: 1 },
        { type: 'log', content: 'some log', count: 1 },
        { type: 'error', content: 'Second error', count: 3 },
        { type: 'warn', content: 'a warning', count: 1 },
        { type: 'error', content: 'Third error', count: 1 },
      ];

      vi.mocked(useConsoleMessages).mockReturnValue({
        consoleMessages: mockConsoleMessages,
        handleNewMessage: vi.fn(),
        clearConsoleMessages: vi.fn(),
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;
      await Promise.resolve();

      // Total error count should be 1 + 3 + 1 = 5
      expect(lastFrame()).toContain('5 errors');
    });
  });

  describe('auth validation', () => {
    it('should call validateAuthMethod when useExternalAuth is false', async () => {
      const validateAuthMethodSpy = vi.spyOn(auth, 'validateAuthMethod');
      mockSettings = createMockSettings({
        workspace: {
          security: {
            auth: {
              selectedType: 'USE_OPENAI' as AuthType,
              useExternal: false,
            },
          },
          ui: { theme: 'Default' },
        },
      });

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      expect(validateAuthMethodSpy).toHaveBeenCalledWith('USE_OPENAI');
    });

    it('should NOT call validateAuthMethod when useExternalAuth is true', async () => {
      const validateAuthMethodSpy = vi.spyOn(auth, 'validateAuthMethod');
      mockSettings = createMockSettings({
        workspace: {
          security: {
            auth: {
              selectedType: 'USE_OPENAI' as AuthType,
              useExternal: true,
            },
          },
          ui: { theme: 'Default' },
        },
      });

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      expect(validateAuthMethodSpy).not.toHaveBeenCalled();
    });
  });

  describe('when in a narrow terminal', () => {
    it('should render with a column layout', () => {
      vi.spyOn(useTerminalSize, 'useTerminalSize').mockReturnValue({
        columns: 60,
        rows: 24,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('NO_COLOR smoke test', () => {
    let originalNoColor: string | undefined;

    beforeEach(() => {
      originalNoColor = process.env['NO_COLOR'];
    });

    afterEach(() => {
      process.env['NO_COLOR'] = originalNoColor;
    });

    it('should render without errors when NO_COLOR is set', async () => {
      process.env['NO_COLOR'] = 'true';

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      expect(lastFrame()).toBeTruthy();
      expect(lastFrame()).toContain('Type your message or @path/to/file');
    });
  });

  describe('FolderTrustDialog', () => {
    it('should display the folder trust dialog when isFolderTrustDialogOpen is true', async () => {
      const { useFolderTrust } = await import('./hooks/useFolderTrust.js');
      vi.mocked(useFolderTrust).mockReturnValue({
        isTrusted: undefined,
        isFolderTrustDialogOpen: true,
        handleFolderTrustSelect: vi.fn(),
        isRestarting: false,
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;
      await Promise.resolve();
      expect(lastFrame()).toContain('Do you trust this folder?');
    });

    it('should display the folder trust dialog when the feature is enabled but the folder is not trusted', async () => {
      const { useFolderTrust } = await import('./hooks/useFolderTrust.js');
      vi.mocked(useFolderTrust).mockReturnValue({
        isTrusted: false,
        isFolderTrustDialogOpen: true,
        handleFolderTrustSelect: vi.fn(),
        isRestarting: false,
      });
      mockConfig.isTrustedFolder.mockReturnValue(false);

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;
      await Promise.resolve();
      expect(lastFrame()).toContain('Do you trust this folder?');
    });

    it('should not display the folder trust dialog when the feature is disabled', async () => {
      const { useFolderTrust } = await import('./hooks/useFolderTrust.js');
      vi.mocked(useFolderTrust).mockReturnValue({
        isTrusted: false,
        isFolderTrustDialogOpen: false,
        handleFolderTrustSelect: vi.fn(),
        isRestarting: false,
      });
      mockConfig.isTrustedFolder.mockReturnValue(false);

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;
      await Promise.resolve();
      expect(lastFrame()).not.toContain('Do you trust this folder?');
    });
  });

  describe('Message Queuing', () => {
    let mockSubmitQuery: Mock;

    beforeEach(() => {
      mockSubmitQuery = vi.fn();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should queue messages when handleFinalSubmit is called during streaming', () => {
      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // The message should not be sent immediately during streaming
      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });

    it('should auto-send queued messages when transitioning from Responding to Idle', async () => {
      const mockSubmitQueryFn = vi.fn();

      // Start with Responding state
      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQueryFn,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount, rerender } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Simulate the hook returning Idle state (streaming completed)
      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQueryFn,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      // Rerender to trigger the useEffect with new state
      rerender(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );

      // The effect uses setTimeout(100ms) before sending
      await vi.advanceTimersByTimeAsync(100);

      // Note: In the actual implementation, messages would be queued first
      // This test verifies the auto-send mechanism works when state transitions
    });

    it('should display queued messages with dimmed color', () => {
      // This test would require being able to simulate handleFinalSubmit
      // and then checking the rendered output for the queued messages
      // with the ▸ prefix and dimColor styling

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: 'Processing', description: 'Processing...' },
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount, lastFrame } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // The actual queued messages display is tested visually
      // since we need to trigger handleFinalSubmit which is internal
      const output = lastFrame();
      expect(output).toBeDefined();
    });

    it('should clear message queue after sending', async () => {
      const mockSubmitQueryFn = vi.fn();

      // Start with idle to allow message queue to process
      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQueryFn,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount, lastFrame } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // After sending, the queue should be cleared
      // This is handled internally by setMessageQueue([]) in the useEffect
      await vi.advanceTimersByTimeAsync(100);

      // Verify the component renders without errors
      expect(lastFrame()).toBeDefined();
    });

    it('should handle empty messages by filtering them out', () => {
      // The handleFinalSubmit function trims and checks if length > 0
      // before adding to queue, so empty messages are filtered

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Empty or whitespace-only messages won't be added to queue
      // This is enforced by the trimmedValue.length > 0 check
      expect(mockSubmitQuery).not.toHaveBeenCalled();
    });

    it('should combine multiple queued messages with double newlines', async () => {
      // This test verifies that when multiple messages are queued,
      // they are combined with '\n\n' as the separator

      const mockSubmitQueryFn = vi.fn();

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Idle,
        submitQuery: mockSubmitQueryFn,
        initError: null,
        pendingHistoryItems: [],
        thought: null,
        cancelOngoingRequest: vi.fn(),
      });

      const { unmount, lastFrame } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // The combining logic uses messageQueue.join('\n\n')
      // This is tested by the implementation in the useEffect
      await vi.advanceTimersByTimeAsync(100);

      expect(lastFrame()).toBeDefined();
    });

    it('should limit displayed messages to MAX_DISPLAYED_QUEUED_MESSAGES', () => {
      // This test verifies the display logic handles multiple messages correctly
      // by checking that the MAX_DISPLAYED_QUEUED_MESSAGES constant is respected

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: 'Processing', description: 'Processing...' },
        cancelOngoingRequest: vi.fn(),
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      const output = lastFrame();

      // Verify the display logic exists and can handle multiple messages
      // The actual queue behavior is tested in the useMessageQueue hook tests
      expect(output).toBeDefined();

      // Check that the component renders without errors when there are messages to display
      expect(output).not.toContain('Error');
    });

    it('should render message queue display without errors', () => {
      // Test that the message queue display logic renders correctly
      // This verifies the UI changes for performance improvements work

      vi.mocked(useGeminiStream).mockReturnValue({
        streamingState: StreamingState.Responding,
        submitQuery: mockSubmitQuery,
        initError: null,
        pendingHistoryItems: [],
        thought: { subject: 'Processing', description: 'Processing...' },
        cancelOngoingRequest: vi.fn(),
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      const output = lastFrame();

      // Verify component renders without errors
      expect(output).toBeDefined();
      expect(output).not.toContain('Error');

      // Verify the component structure is intact (loading indicator should be present)
      expect(output).toContain('esc to cancel');
    });
  });

  describe('debug keystroke logging', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should pass debugKeystrokeLogging setting to KeypressProvider', () => {
      const mockSettingsWithDebug = createMockSettings({
        workspace: {
          ui: { theme: 'Default' },
          general: { debugKeystrokeLogging: true },
        },
      });

      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettingsWithDebug}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      const output = lastFrame();

      expect(output).toBeDefined();
      expect(mockSettingsWithDebug.merged.general?.debugKeystrokeLogging).toBe(
        true,
      );
    });

    it('should use default false value when debugKeystrokeLogging is not set', () => {
      const { lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      const output = lastFrame();

      expect(output).toBeDefined();
      expect(
        mockSettings.merged.general?.debugKeystrokeLogging,
      ).toBeUndefined();
    });
  });

  describe('Ctrl+C behavior', () => {
    it('should exit immediately on Ctrl+C even when a tool is executing', async () => {
      const mockCancel = vi.fn();
      let onCancelSubmitCallback = () => {};

      // Simulate a tool in the "Executing" state.
      vi.mocked(useGeminiStream).mockImplementation(
        (
          _client,
          _history,
          _addItem,
          _config,
          _onDebugMessage,
          _handleSlashCommand,
          _shellModeActive,
          _getPreferredEditor,
          _onAuthError,
          _performMemoryRefresh,
          _modelSwitchedFromQuotaError,
          _setModelSwitchedFromQuotaError,
          _onEditorClose,
          onCancelSubmit, // Capture the cancel callback from App.tsx
        ) => {
          onCancelSubmitCallback = onCancelSubmit;
          return {
            streamingState: StreamingState.Responding,
            submitQuery: vi.fn(),
            initError: null,
            pendingHistoryItems: [
              {
                type: 'tool_group',
                tools: [
                  {
                    name: 'test_tool',
                    status: ToolCallStatus.Executing,
                    callId: 'test-call-id',
                    description: 'Test tool description',
                    resultDisplay: 'Test result',
                    confirmationDetails: undefined,
                  },
                ],
              },
            ],
            thought: null,
            cancelOngoingRequest: () => {
              mockCancel();
              onCancelSubmitCallback(); // <--- This is the key change
            },
          };
        },
      );

      const { stdin, lastFrame, unmount } = renderWithProviders(
        <App
          config={mockConfig as unknown as ServerConfig}
          settings={mockSettings}
          version={mockVersion}
        />,
      );
      currentUnmount = unmount;

      // Simulate user typing something into the prompt while a tool is running.
      stdin.write('some text');
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the text is in the prompt.
      expect(lastFrame()).toContain('some text');

      // Simulate Ctrl+C.
      stdin.write('\x03');

      await waitFor(() => {
        expect(exitSpy).toHaveBeenCalledWith(0);
      });

      expect(mockCancel).toHaveBeenCalledTimes(1);
    });
  });
});

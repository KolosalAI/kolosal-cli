/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir, platform } from 'node:os';
import * as dotenv from 'dotenv';
import {
  GEMINI_CONFIG_DIR as GEMINI_DIR,
  getErrorMessage,
  Storage,
} from '@kolosal-ai/kolosal-ai-core';
import stripJsonComments from 'strip-json-comments';
import { DefaultLight } from '../ui/themes/default-light.js';
import { DefaultDark } from '../ui/themes/default.js';
import { isWorkspaceTrusted } from './trustedFolders.js';
import type { Settings, MemoryImportFormat } from './settingsSchema.js';
import { mergeWith } from 'lodash-es';
import {
  mergeSavedModelEntries,
  type SavedModelEntry,
} from './savedModels.js';

export type { Settings, MemoryImportFormat };

export const SETTINGS_DIRECTORY_NAME = '.kolosal';
export const USER_SETTINGS_PATH = Storage.getGlobalSettingsPath();
export const USER_SETTINGS_DIR = path.dirname(USER_SETTINGS_PATH);
export const DEFAULT_EXCLUDED_ENV_VARS = ['DEBUG', 'DEBUG_MODE'];

export function getSystemSettingsPath(): string {
  if (process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH']) {
    return process.env['QWEN_CODE_SYSTEM_SETTINGS_PATH'];
  }
  if (platform() === 'darwin') {
    return '/Library/Application Support/QwenCode/settings.json';
  } else if (platform() === 'win32') {
    return 'C:\\ProgramData\\kolosal-ai\\settings.json';
  } else {
    return '/etc/kolosal-ai/settings.json';
  }
}

export function getSystemDefaultsPath(): string {
  if (process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH']) {
    return process.env['QWEN_CODE_SYSTEM_DEFAULTS_PATH'];
  }
  return path.join(
    path.dirname(getSystemSettingsPath()),
    'system-defaults.json',
  );
}

export type { DnsResolutionOrder } from './settingsSchema.js';

export enum SettingScope {
  User = 'User',
  Workspace = 'Workspace',
  System = 'System',
  SystemDefaults = 'SystemDefaults',
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

export interface SettingsError {
  message: string;
  path: string;
}

export interface SettingsFile {
  settings: Settings;
  path: string;
}

function setNestedProperty(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  if (!lastKey) return;

  let current: Record<string, unknown> = obj;
  for (const key of keys) {
    if (current[key] === undefined) {
      current[key] = {};
    }
    const next = current[key];
    if (typeof next === 'object' && next !== null) {
      current = next as Record<string, unknown>;
    } else {
      // This path is invalid, so we stop.
      return;
    }
  }
  current[lastKey] = value;
}

function mergeSettings(
  system: Settings,
  systemDefaults: Settings,
  user: Settings,
  workspace: Settings,
  isTrusted: boolean,
): Settings {
  const safeWorkspace = isTrusted ? workspace : ({} as Settings);

  // folderTrust is not supported at workspace level.
  const { security, ...restOfWorkspace } = safeWorkspace;
  const safeWorkspaceWithoutFolderTrust = security
    ? {
        ...restOfWorkspace,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        security: (({ folderTrust, ...rest }) => rest)(security),
      }
    : {
        ...restOfWorkspace,
        security: {},
      };

  // Settings are merged with the following precedence (last one wins for
  // single values):
  // 1. System Defaults
  // 2. User Settings
  // 3. Workspace Settings
  // 4. System Settings (as overrides)
  //
  // For properties that are arrays (e.g., includeDirectories), the arrays
  // are concatenated. For objects (e.g., customThemes), they are merged.
  return {
    ...systemDefaults,
    ...user,
    ...safeWorkspaceWithoutFolderTrust,
    ...system,
    general: {
      ...(systemDefaults.general || {}),
      ...(user.general || {}),
      ...(safeWorkspaceWithoutFolderTrust.general || {}),
      ...(system.general || {}),
    },
    ui: {
      ...(systemDefaults.ui || {}),
      ...(user.ui || {}),
      ...(safeWorkspaceWithoutFolderTrust.ui || {}),
      ...(system.ui || {}),
      customThemes: {
        ...(systemDefaults.ui?.customThemes || {}),
        ...(user.ui?.customThemes || {}),
        ...(safeWorkspaceWithoutFolderTrust.ui?.customThemes || {}),
        ...(system.ui?.customThemes || {}),
      },
    },
    ide: {
      ...(systemDefaults.ide || {}),
      ...(user.ide || {}),
      ...(safeWorkspaceWithoutFolderTrust.ide || {}),
      ...(system.ide || {}),
    },
    privacy: {
      ...(systemDefaults.privacy || {}),
      ...(user.privacy || {}),
      ...(safeWorkspaceWithoutFolderTrust.privacy || {}),
      ...(system.privacy || {}),
    },
    telemetry: {
      ...(systemDefaults.telemetry || {}),
      ...(user.telemetry || {}),
      ...(safeWorkspaceWithoutFolderTrust.telemetry || {}),
      ...(system.telemetry || {}),
    },
    security: {
      ...(systemDefaults.security || {}),
      ...(user.security || {}),
      ...(safeWorkspaceWithoutFolderTrust.security || {}),
      ...(system.security || {}),
    },
    mcp: {
      ...(systemDefaults.mcp || {}),
      ...(user.mcp || {}),
      ...(safeWorkspaceWithoutFolderTrust.mcp || {}),
      ...(system.mcp || {}),
    },
    mcpServers: {
      ...(systemDefaults.mcpServers || {}),
      ...(user.mcpServers || {}),
      ...(safeWorkspaceWithoutFolderTrust.mcpServers || {}),
      ...(system.mcpServers || {}),
    },
    tools: {
      ...(systemDefaults.tools || {}),
      ...(user.tools || {}),
      ...(safeWorkspaceWithoutFolderTrust.tools || {}),
      ...(system.tools || {}),
    },
    context: {
      ...(systemDefaults.context || {}),
      ...(user.context || {}),
      ...(safeWorkspaceWithoutFolderTrust.context || {}),
      ...(system.context || {}),
      includeDirectories: [
        ...(systemDefaults.context?.includeDirectories || []),
        ...(user.context?.includeDirectories || []),
        ...(safeWorkspaceWithoutFolderTrust.context?.includeDirectories || []),
        ...(system.context?.includeDirectories || []),
      ],
    },
    model: {
      ...(systemDefaults.model || {}),
      ...(user.model || {}),
      ...(safeWorkspaceWithoutFolderTrust.model || {}),
      ...(system.model || {}),
      chatCompression: {
        ...(systemDefaults.model?.chatCompression || {}),
        ...(user.model?.chatCompression || {}),
        ...(safeWorkspaceWithoutFolderTrust.model?.chatCompression || {}),
        ...(system.model?.chatCompression || {}),
      },
      savedModels: mergeSavedModelEntries([
        systemDefaults.model?.savedModels as SavedModelEntry[] | undefined,
        user.model?.savedModels as SavedModelEntry[] | undefined,
        safeWorkspaceWithoutFolderTrust.model
          ?.savedModels as SavedModelEntry[] | undefined,
        system.model?.savedModels as SavedModelEntry[] | undefined,
      ]),
    },
    advanced: {
      ...(systemDefaults.advanced || {}),
      ...(user.advanced || {}),
      ...(safeWorkspaceWithoutFolderTrust.advanced || {}),
      ...(system.advanced || {}),
      excludedEnvVars: [
        ...new Set([
          ...(systemDefaults.advanced?.excludedEnvVars || []),
          ...(user.advanced?.excludedEnvVars || []),
          ...(safeWorkspaceWithoutFolderTrust.advanced?.excludedEnvVars || []),
          ...(system.advanced?.excludedEnvVars || []),
        ]),
      ],
    },
    experimental: {
      ...(systemDefaults.experimental || {}),
      ...(user.experimental || {}),
      ...(safeWorkspaceWithoutFolderTrust.experimental || {}),
      ...(system.experimental || {}),
    },
    contentGenerator: {
      ...(systemDefaults.contentGenerator || {}),
      ...(user.contentGenerator || {}),
      ...(safeWorkspaceWithoutFolderTrust.contentGenerator || {}),
      ...(system.contentGenerator || {}),
    },
    systemPromptMappings: {
      ...(systemDefaults.systemPromptMappings || {}),
      ...(user.systemPromptMappings || {}),
      ...(safeWorkspaceWithoutFolderTrust.systemPromptMappings || {}),
      ...(system.systemPromptMappings || {}),
    },
    extensions: {
      ...(systemDefaults.extensions || {}),
      ...(user.extensions || {}),
      ...(safeWorkspaceWithoutFolderTrust.extensions || {}),
      ...(system.extensions || {}),
      disabled: [
        ...new Set([
          ...(systemDefaults.extensions?.disabled || []),
          ...(user.extensions?.disabled || []),
          ...(safeWorkspaceWithoutFolderTrust.extensions?.disabled || []),
          ...(system.extensions?.disabled || []),
        ]),
      ],
      workspacesWithMigrationNudge: [
        ...new Set([
          ...(systemDefaults.extensions?.workspacesWithMigrationNudge || []),
          ...(user.extensions?.workspacesWithMigrationNudge || []),
          ...(safeWorkspaceWithoutFolderTrust.extensions
            ?.workspacesWithMigrationNudge || []),
          ...(system.extensions?.workspacesWithMigrationNudge || []),
        ]),
      ],
    },
  };
}

export class LoadedSettings {
  constructor(
    system: SettingsFile,
    systemDefaults: SettingsFile,
    user: SettingsFile,
    workspace: SettingsFile,
    errors: SettingsError[],
    isTrusted: boolean,
  ) {
    this.system = system;
    this.systemDefaults = systemDefaults;
    this.user = user;
    this.workspace = workspace;
    this.errors = errors;
    this.isTrusted = isTrusted;
    this._merged = this.computeMergedSettings();
  }

  readonly system: SettingsFile;
  readonly systemDefaults: SettingsFile;
  readonly user: SettingsFile;
  readonly workspace: SettingsFile;
  readonly errors: SettingsError[];
  readonly isTrusted: boolean;

  private _merged: Settings;

  get merged(): Settings {
    return this._merged;
  }

  private computeMergedSettings(): Settings {
    return mergeSettings(
      this.system.settings,
      this.systemDefaults.settings,
      this.user.settings,
      this.workspace.settings,
      this.isTrusted,
    );
  }

  forScope(scope: SettingScope): SettingsFile {
    switch (scope) {
      case SettingScope.User:
        return this.user;
      case SettingScope.Workspace:
        return this.workspace;
      case SettingScope.System:
        return this.system;
      case SettingScope.SystemDefaults:
        return this.systemDefaults;
      default:
        throw new Error(`Invalid scope: ${scope}`);
    }
  }

  setValue(scope: SettingScope, key: string, value: unknown): void {
    const settingsFile = this.forScope(scope);
    setNestedProperty(settingsFile.settings, key, value);
    this._merged = this.computeMergedSettings();
    saveSettings(settingsFile);
  }
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName]!;
    }
    return match;
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}

function findEnvFile(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  while (true) {
    // prefer gemini-specific .env under GEMINI_DIR
    const geminiEnvPath = path.join(currentDir, GEMINI_DIR, '.env');
    if (fs.existsSync(geminiEnvPath)) {
      return geminiEnvPath;
    }
    const envPath = path.join(currentDir, '.env');
    if (fs.existsSync(envPath)) {
      return envPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || !parentDir) {
      // check .env under home as fallback, again preferring gemini-specific .env
      const homeGeminiEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
      if (fs.existsSync(homeGeminiEnvPath)) {
        return homeGeminiEnvPath;
      }
      const homeEnvPath = path.join(homedir(), '.env');
      if (fs.existsSync(homeEnvPath)) {
        return homeEnvPath;
      }
      return null;
    }
    currentDir = parentDir;
  }
}



export function loadEnvironment(settings?: Settings): void {
  const envFilePath = findEnvFile(process.cwd());

  // If no settings provided, try to load workspace settings for exclusions
  let resolvedSettings = settings;
  if (!resolvedSettings) {
    const workspaceSettingsPath = new Storage(
      process.cwd(),
    ).getWorkspaceSettingsPath();
    try {
      if (fs.existsSync(workspaceSettingsPath)) {
        const workspaceContent = fs.readFileSync(
          workspaceSettingsPath,
          'utf-8',
        );
        const parsedWorkspaceSettings = JSON.parse(
          stripJsonComments(workspaceContent),
        ) as Settings;
        resolvedSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
      }
    } catch (_e) {
      // Ignore errors loading workspace settings
    }
  }

  if (envFilePath) {
    // Manually parse and load environment variables to handle exclusions correctly.
    // This avoids modifying environment variables that were already set from the shell.
    try {
      const envFileContent = fs.readFileSync(envFilePath, 'utf-8');
      const parsedEnv = dotenv.parse(envFileContent);

      const excludedVars =
        resolvedSettings?.advanced?.excludedEnvVars ||
        DEFAULT_EXCLUDED_ENV_VARS;
      const isProjectEnvFile = !envFilePath.includes(GEMINI_DIR);

      for (const key in parsedEnv) {
        if (Object.hasOwn(parsedEnv, key)) {
          // If it's a project .env file, skip loading excluded variables.
          if (isProjectEnvFile && excludedVars.includes(key)) {
            continue;
          }

          // Load variable only if it's not already set in the environment.
          if (!Object.hasOwn(process.env, key)) {
            process.env[key] = parsedEnv[key];
          }
        }
      }
    } catch (_e) {
      // Errors are ignored to match the behavior of `dotenv.config({ quiet: true })`.
    }
  }
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 */
export function loadSettings(workspaceDir: string): LoadedSettings {
  let systemSettings: Settings = {};
  let systemDefaultSettings: Settings = {};
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];
  const systemSettingsPath = getSystemSettingsPath();
  const systemDefaultsPath = getSystemDefaultsPath();

  // Resolve paths to their canonical representation to handle symlinks
  const resolvedWorkspaceDir = path.resolve(workspaceDir);
  const resolvedHomeDir = path.resolve(homedir());

  let realWorkspaceDir = resolvedWorkspaceDir;
  try {
    // fs.realpathSync gets the "true" path, resolving any symlinks
    realWorkspaceDir = fs.realpathSync(resolvedWorkspaceDir);
  } catch (_e) {
    // This is okay. The path might not exist yet, and that's a valid state.
  }

  // We expect homedir to always exist and be resolvable.
  const realHomeDir = fs.realpathSync(resolvedHomeDir);

  const workspaceSettingsPath = new Storage(
    workspaceDir,
  ).getWorkspaceSettingsPath();

  const loadSettings = (filePath: string): Settings => {
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const rawSettings: unknown = JSON.parse(stripJsonComments(content));

        if (
          typeof rawSettings !== 'object' ||
          rawSettings === null ||
          Array.isArray(rawSettings)
        ) {
          settingsErrors.push({
            message: 'Settings file is not a valid JSON object.',
            path: filePath,
          });
          return {};
        }

        return rawSettings as Settings;
      }
    } catch (error: unknown) {
      settingsErrors.push({
        message: getErrorMessage(error),
        path: filePath,
      });
    }
    return {};
  };

  systemSettings = loadSettings(systemSettingsPath);
  systemDefaultSettings = loadSettings(systemDefaultsPath);
  userSettings = loadSettings(USER_SETTINGS_PATH);

  if (realWorkspaceDir !== realHomeDir) {
    workspaceSettings = loadSettings(workspaceSettingsPath);
  }

  // Support legacy theme names
  if (userSettings.ui?.theme === 'VS') {
    userSettings.ui.theme = DefaultLight.name;
  } else if (userSettings.ui?.theme === 'VS2015') {
    userSettings.ui.theme = DefaultDark.name;
  }
  if (workspaceSettings.ui?.theme === 'VS') {
    workspaceSettings.ui.theme = DefaultLight.name;
  } else if (workspaceSettings.ui?.theme === 'VS2015') {
    workspaceSettings.ui.theme = DefaultDark.name;
  }

  // For the initial trust check, we can only use user and system settings.
  const initialTrustCheckSettings = mergeWith({}, systemSettings, userSettings);
  const isTrusted =
    isWorkspaceTrusted(initialTrustCheckSettings as Settings) ?? true;

  // Create a temporary merged settings object to pass to loadEnvironment.
  const tempMergedSettings = mergeSettings(
    systemSettings,
    systemDefaultSettings,
    userSettings,
    workspaceSettings,
    isTrusted,
  );

  // loadEnviroment depends on settings so we have to create a temp version of
  // the settings to avoid a cycle
  loadEnvironment(tempMergedSettings);

  // Now that the environment is loaded, resolve variables in the settings.
  systemSettings = resolveEnvVarsInObject(systemSettings);
  userSettings = resolveEnvVarsInObject(userSettings);
  workspaceSettings = resolveEnvVarsInObject(workspaceSettings);

  // Hydrate environment variables from settings if provided (user/workspace/system precedence).
  // This avoids requiring users to put secrets into shell env or .env when they prefer settings.json.
  try {
    const mergedForEnv = mergeSettings(
      systemSettings,
      systemDefaultSettings,
      userSettings,
      workspaceSettings,
      isTrusted,
    );
    
    // Get credentials from the current model's saved entry if available
    const currentModelName = mergedForEnv.model?.name;
    const savedModels = (mergedForEnv.model?.savedModels ?? []) as SavedModelEntry[];
    const currentModelEntry = currentModelName 
      ? savedModels.find(m => m.id === currentModelName)
      : undefined;
    
    // Prefer credentials from saved model entry, fall back to global settings
    const apiKey = currentModelEntry?.apiKey || mergedForEnv.openaiApiKey;
    const baseUrl = currentModelEntry?.baseUrl || mergedForEnv.openaiBaseUrl;
    
    if (!process.env['OPENAI_API_KEY'] && apiKey) {
      process.env['OPENAI_API_KEY'] = String(apiKey);
    }
    if (!process.env['OPENAI_BASE_URL'] && baseUrl) {
      process.env['OPENAI_BASE_URL'] = String(baseUrl);
    }
    // Prefer HF token from settings if environment is empty
    const hfToken = (mergedForEnv as any)?.contentGenerator?.huggingface?.token;
    if (!process.env['HF_TOKEN'] && hfToken) {
      process.env['HF_TOKEN'] = String(hfToken);
    }
    if (!process.env['GEMINI_MODEL'] && mergedForEnv.model?.name) {
      process.env['GEMINI_MODEL'] = String(mergedForEnv.model.name);
    }
    if (!process.env['OPENAI_MODEL'] && mergedForEnv.model?.name) {
      process.env['OPENAI_MODEL'] = String(mergedForEnv.model.name);
    }
  } catch (_e) {
    // Best-effort: if hydration fails, continue with existing env.
  }

  // Create LoadedSettings first
  const loadedSettings = new LoadedSettings(
    {
      path: systemSettingsPath,
      settings: systemSettings,
    },
    {
      path: systemDefaultsPath,
      settings: systemDefaultSettings,
    },
    {
      path: USER_SETTINGS_PATH,
      settings: userSettings,
    },
    {
      path: workspaceSettingsPath,
      settings: workspaceSettings,
    },
    settingsErrors,
    isTrusted,
  );

  return loadedSettings;
}

export function saveSettings(settingsFile: SettingsFile): void {
  try {
    // Ensure the directory exists
    const dirPath = path.dirname(settingsFile.path);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    fs.writeFileSync(
      settingsFile.path,
      JSON.stringify(settingsFile.settings, null, 2),
      'utf-8',
    );
  } catch (error) {
    console.error('Error saving user settings file:', error);
  }
}

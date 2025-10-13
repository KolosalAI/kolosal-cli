#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { setTimeout } from 'node:timers/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerConfig {
  /** Port for kolosal-server to run on */
  port: number;
  /** Host for kolosal-server to bind to */
  host: string;
  /** Maximum startup time in milliseconds */
  startupTimeoutMs: number;
  /** Health check interval in milliseconds */
  healthCheckIntervalMs: number;
  /** Maximum health check retries */
  maxHealthCheckRetries: number;
  /** Enable debug logging */
  debug: boolean;
  /** Server arguments */
  serverArgs: string[];
  /** Automatically start the server */
  autoStart: boolean;
  /** Graceful shutdown timeout */
  shutdownTimeoutMs: number;
}

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  port: 8087,
  host: '127.0.0.1',
  startupTimeoutMs: 30000,
  healthCheckIntervalMs: 1000,
  maxHealthCheckRetries: 30,
  debug: false,
  serverArgs: [],
  autoStart: false, // Disabled by default, can be enabled via settings
  shutdownTimeoutMs: 5000,
};

export enum ServerStatus {
  STOPPED = 'stopped',
  STARTING = 'starting',
  RUNNING = 'running',
  STOPPING = 'stopping',
  ERROR = 'error',
}

export interface ServerHealth {
  status: ServerStatus;
  pid?: number;
  port?: number;
  uptime?: number;
  lastHealthCheck?: Date;
  error?: string;
}

/**
 * Manages the kolosal-server background process lifecycle
 */
export class KolosalServerManager {
  private process: ChildProcess | null = null;
  private status: ServerStatus = ServerStatus.STOPPED;
  private config: ServerConfig;
  private startTime: number = 0;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;
  private serverExecutablePath: string;

  constructor(config: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_SERVER_CONFIG, ...config };
    this.serverExecutablePath = this.findServerExecutable();
  }

  /**
   * Find the kolosal-server executable in the distribution
   */
  private findServerExecutable(): string {
    // Check if we're in development or production
    const possiblePaths = [
      // From CLI package dist to main project dist
      join(__dirname, '..', '..', '..', '..', '..', 'dist', 'mac', 'kolosal-app', 'bin', 'kolosal-server'),
      // From CLI package to main project dist (development)
      join(__dirname, '..', '..', '..', '..', 'dist', 'mac', 'kolosal-app', 'bin', 'kolosal-server'),
      // Direct paths for development
      join(__dirname, '..', '..', '..', 'dist', 'mac', 'kolosal-app', 'bin', 'kolosal-server'),
      // Production paths (in packaged app)
      join(__dirname, '..', '..', 'bin', 'kolosal-server'),
      join(__dirname, '..', 'bin', 'kolosal-server'),
      // Development paths
      join(__dirname, '..', '..', '..', 'kolosal-server', 'build', 'Release', 'kolosal-server'),
      // Fallback to system PATH
      'kolosal-server'
    ];

    this.debug(`Looking for kolosal-server executable...`);
    this.debug(`__dirname: ${__dirname}`);

    for (const path of possiblePaths) {
      this.debug(`Checking path: ${path}`);
      if (path !== 'kolosal-server' && existsSync(path)) {
        this.debug(`Found executable at: ${path}`);
        return path;
      }
    }

    this.debug('No executable found, falling back to system PATH');
    // Default to system PATH
    return 'kolosal-server';
  }

  /**
   * Resolve the configuration file path to pass to kolosal-server.
   * Users can override via KOLOSAL_SERVER_CONFIG env or serverArgs entries.
   */
  private resolveConfigArgs(): string[] {
    // Respect explicit configuration passed by the caller
    const hasExplicitConfig = this.config.serverArgs.some((arg, index, arr) => {
      if (arg === '--config' || arg === '-c') {
        return true;
      }
      if (arg.startsWith('--config=')) {
        return true;
      }
      if (arg.startsWith('-c') && arg.length > 2) {
        return true;
      }
      // Handle pair style: ['--config', 'path']
      if ((arg === '--config' || arg === '-c') && typeof arr[index + 1] === 'string') {
        return true;
      }
      return false;
    });

    if (hasExplicitConfig) {
      return [];
    }

  const envConfig = process.env['KOLOSAL_SERVER_CONFIG']?.trim();
    if (envConfig && existsSync(envConfig)) {
      this.debug(`Using kolosal-server config from KOLOSAL_SERVER_CONFIG: ${envConfig}`);
      return ['--config', envConfig];
    }

    const candidates: string[] = [];

    if (this.serverExecutablePath !== 'kolosal-server') {
      const execDir = dirname(this.serverExecutablePath);
      candidates.push(join(execDir, '..', 'Resources', 'config.yaml'));
      if (process.platform === 'darwin') {
        candidates.push(join(execDir, '..', 'Resources', 'config.macos.yaml'));
      }
      candidates.push(join(execDir, '..', 'config.yaml'));
    }

    const devConfigName = process.platform === 'darwin' ? 'config.macos.yaml' : 'config.yaml';
    candidates.push(join(__dirname, '..', '..', '..', '..', '..', 'kolosal-server', 'configs', devConfigName));
    candidates.push(join(process.cwd(), 'kolosal-server', 'configs', devConfigName));

    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        this.debug(`Resolved kolosal-server config: ${candidate}`);
        return ['--config', candidate];
      }
    }

    this.debug('No kolosal-server config override detected');
    return [];
  }

  /**
   * Start the kolosal-server process
   */
  async start(): Promise<void> {
    if (this.status !== ServerStatus.STOPPED) {
      throw new Error(`Cannot start server in ${this.status} state`);
    }

    this.debug('Starting kolosal-server...');
    this.status = ServerStatus.STARTING;
    this.startTime = Date.now();

    try {
      await this.spawnServerProcess();
      await this.waitForServerReady();
      this.startHealthChecking();
      this.status = ServerStatus.RUNNING;
      this.debug(`kolosal-server started successfully on ${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.status = ServerStatus.ERROR;
      this.cleanup();
      throw new Error(`Failed to start kolosal-server: ${error}`);
    }
  }

  /**
   * Stop the kolosal-server process
   */
  async stop(): Promise<void> {
    if (this.status === ServerStatus.STOPPED) {
      return;
    }

    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    await this.shutdownPromise;
    this.shutdownPromise = null;
  }

  /**
   * Get current server health status
   */
  getHealth(): ServerHealth {
    return {
      status: this.status,
      pid: this.process?.pid,
      port: this.status === ServerStatus.RUNNING ? this.config.port : undefined,
      uptime: this.status === ServerStatus.RUNNING ? Date.now() - this.startTime : undefined,
      lastHealthCheck: new Date(),
    };
  }

  /**
   * Check if the server is running and healthy
   */
  async isHealthy(): Promise<boolean> {
    if (this.status !== ServerStatus.RUNNING || !this.process) {
      return false;
    }

    try {
      const response = await this.makeHealthRequest();
      return response;
    } catch (error) {
      this.debug(`Health check failed: ${error}`);
      return false;
    }
  }

  /**
   * Get the server URL
   */
  getServerUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Spawn the server process
   */
  private async spawnServerProcess(): Promise<void> {
    const args = [
      '--port', this.config.port.toString(),
      '--host', this.config.host,
      '--log-level', this.config.debug ? 'DEBUG' : 'INFO',
      ...this.resolveConfigArgs(),
      ...this.config.serverArgs
    ];

    // Set library path for macOS
    const env = { ...process.env };
    if (process.platform === 'darwin') {
      const libPath = join(dirname(this.serverExecutablePath), '..', 'lib');
      env['DYLD_LIBRARY_PATH'] = libPath + (env['DYLD_LIBRARY_PATH'] ? ':' + env['DYLD_LIBRARY_PATH'] : '');
    }

    this.debug(`Spawning: ${this.serverExecutablePath} ${args.join(' ')}`);
    this.debug(`Environment DYLD_LIBRARY_PATH: ${env['DYLD_LIBRARY_PATH']}`);
    this.debug(`Server executable exists: ${existsSync(this.serverExecutablePath)}`);

    this.process = spawn(this.serverExecutablePath, args, {
      env,
      stdio: this.config.debug ? 'inherit' : 'pipe',
      detached: false
    });

    let processErrorOccurred = false;

    this.process.on('error', (error) => {
      processErrorOccurred = true;
      this.debug(`Server process error: ${error}`);
      this.status = ServerStatus.ERROR;
      this.cleanup();
    });

    this.process.on('exit', (code, signal) => {
      this.debug(`Server process exited with code ${code}, signal ${signal}`);
      if (this.status === ServerStatus.RUNNING) {
        this.status = ServerStatus.ERROR;
      } else if (this.status === ServerStatus.STOPPING) {
        this.status = ServerStatus.STOPPED;
      }
      this.cleanup();
    });

    // Give the process a moment to start
    await setTimeout(500);

    if (processErrorOccurred) {
      throw new Error('Server process failed to spawn');
    }

    if (!this.process || this.process.killed || this.process.exitCode !== null) {
      throw new Error(`Server process failed to start - killed: ${this.process?.killed}, exitCode: ${this.process?.exitCode}`);
    }
  }

  /**
   * Wait for the server to be ready to accept connections
   */
  private async waitForServerReady(): Promise<void> {
    const startTime = Date.now();
    let retries = 0;

    while (retries < this.config.maxHealthCheckRetries) {
      if (Date.now() - startTime > this.config.startupTimeoutMs) {
        throw new Error(`Server startup timeout after ${this.config.startupTimeoutMs}ms`);
      }

      try {
        const isReady = await this.makeHealthRequest();
        if (isReady) {
          return;
        }
      } catch (error) {
        // Expected during startup
      }

      retries++;
      await setTimeout(this.config.healthCheckIntervalMs);
    }

    throw new Error(`Server failed to become ready after ${retries} attempts`);
  }

  /**
   * Make a health check request to the server
   */
  private async makeHealthRequest(): Promise<boolean> {
    return new Promise((resolve) => {
      const request = http.request({
        hostname: this.config.host,
        port: this.config.port,
        path: '/health',
        method: 'GET',
        timeout: 3000
      }, (response) => {
        if (response.statusCode === 200) {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => {
            try {
              const healthData = JSON.parse(data);
              const isHealthy = healthData.status === 'healthy';
              this.debug(`Health check response: ${isHealthy ? 'healthy' : 'unhealthy'} - ${data.substring(0, 100)}`);
              resolve(isHealthy);
            } catch (error) {
              this.debug(`Health check JSON parse error: ${error}`);
              resolve(false);
            }
          });
        } else {
          this.debug(`Health check failed with status ${response.statusCode}`);
          resolve(false);
        }
      });

      request.on('error', (error) => {
        this.debug(`Health check request error: ${error.message}`);
        resolve(false);
      });
      request.on('timeout', () => {
        this.debug('Health check request timeout');
        request.destroy();
        resolve(false);
      });

      request.end();
    });
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(async () => {
      const healthy = await this.isHealthy();
      if (!healthy && this.status === ServerStatus.RUNNING) {
        this.debug('Server health check failed, marking as error');
        this.status = ServerStatus.ERROR;
        this.cleanup();
      }
    }, this.config.healthCheckIntervalMs * 5); // Check every 5 seconds
  }

  /**
   * Perform graceful shutdown
   */
  private async performShutdown(): Promise<void> {
    this.debug('Stopping kolosal-server...');
    this.status = ServerStatus.STOPPING;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.process && !this.process.killed) {
      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Wait for graceful shutdown
      const shutdownStart = Date.now();
      while (this.process && !this.process.killed && Date.now() - shutdownStart < this.config.shutdownTimeoutMs) {
        await setTimeout(100);
      }

      // Force kill if still running
      if (this.process && !this.process.killed) {
        this.debug('Forcing server shutdown...');
        this.process.kill('SIGKILL');
      }
    }

    this.cleanup();
    this.status = ServerStatus.STOPPED;
    this.debug('kolosal-server stopped');
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.process = null;
  }

  /**
   * Debug logging
   */
  private debug(message: string): void {
    if (this.config.debug) {
      console.log(`[KolosalServerManager] ${message}`);
    }
  }
}

// Global server manager instance
let globalServerManager: KolosalServerManager | null = null;

/**
 * Get or create the global server manager instance
 */
export function getServerManager(config?: Partial<ServerConfig>): KolosalServerManager {
  if (!globalServerManager) {
    globalServerManager = new KolosalServerManager(config);
  }
  return globalServerManager;
}

/**
 * Start the kolosal-server if auto-start is enabled
 */
export async function startServerIfEnabled(config?: Partial<ServerConfig>): Promise<KolosalServerManager | null> {
  const finalConfig = { ...DEFAULT_SERVER_CONFIG, ...config };
  
  if (!finalConfig.autoStart) {
    return null;
  }

  const manager = getServerManager(finalConfig);
  
  try {
    console.log('Starting kolosal-server in background...');
    await manager.start();
    console.log(`✅ kolosal-server started successfully on ${finalConfig.host}:${finalConfig.port}`);
    return manager;
  } catch (error) {
    console.warn(`Warning: Could not start kolosal-server: ${error}`);
    return null;
  }
}

/**
 * Stop the global server manager if it exists
 */
export async function stopGlobalServer(): Promise<void> {
  if (globalServerManager) {
    await globalServerManager.stop();
  }
}
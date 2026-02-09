import chalk from "chalk";
import { ChildProcess } from "child_process";
import { randomBytes } from "crypto";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import chokidar from "chokidar";
import treeKill from "tree-kill";
import { CloudflareTunnel } from "../tunnel/cloudflare.js";
import { findFreePort } from "../utils/ports.js";
import { startMetro, MetroCommand } from "../utils/metro.js";
import {
  ExpoAirConfig,
  ExtraTunnelConfig,
  getPackageRoot,
  isInstalledFromNpm,
  hasPrebuiltWidgetBundle,
  resolveProjectRoot,
  validateExpoProject,
  updateInfoPlist,
  writeLocalConfig,
  readExpoAirConfig,
  updateEnvFile,
  maskSecret,
  appendSecret,
} from "../utils/common.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Kill a process and all its children (process tree)
 */
export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    treeKill(pid, "SIGTERM", (err?: Error) => {
      // Resolve even on error - process may already be dead
      if (err) {
        console.log(chalk.gray(`    (process ${pid} already terminated)`));
      }
      resolve();
    });
  });
}

export interface DevEnvironmentOptions {
  /** Port for prompt server (default: 3847) */
  port?: number;
  /** Port for widget Metro server (default: 8082) */
  widgetPort?: number;
  /** Port for app Metro server (default: 8081) */
  metroPort?: number;
  /** Path to Expo project */
  project?: string;
  /** Enable tunnels (default: true) */
  tunnel?: boolean;
  /** Enable prompt server (default: true) */
  server?: boolean;
  /** Run widget Metro server (default: auto-detect based on npm install) */
  runWidgetMetro?: boolean;
  /** Metro command to use: 'npm' or 'npx' (default: 'npm') */
  metroCommand?: MetroCommand;
  /** Watch prompt server files and restart on changes (default: false) */
  watchServer?: boolean;
}

export interface DevEnvironmentPorts {
  promptServer: number;
  widgetMetro: number | null;
  appMetro: number;
}

export interface TunnelUrls {
  promptServer: string | null;
  widgetMetro: string | null;
  appMetro: string | null;
}

export interface ExtraTunnelState {
  config: ExtraTunnelConfig;
  tunnel: CloudflareTunnel;
  url: string | null;
}

export interface DevEnvironmentState {
  ports: DevEnvironmentPorts;
  tunnelUrls: TunnelUrls;
  projectRoot: string;
  widgetDir: string;
  widgetProcess: ChildProcess | null;
  appProcess: ChildProcess | null;
  promptServer: { start: () => Promise<void>; stop: () => Promise<void> } | null;
  promptTunnel: CloudflareTunnel | null;
  widgetTunnel: CloudflareTunnel | null;
  appTunnel: CloudflareTunnel | null;
  isRunningWidgetMetro: boolean;
  extraTunnels: ExtraTunnelState[];
  envFile: string | null;
  serverWatcher: chokidar.FSWatcher | null;
  serverSecret: string | null;
}

/**
 * DevEnvironment orchestrates the development environment:
 * - Port allocation
 * - Metro servers (widget and app)
 * - Prompt server
 * - Cloudflare tunnels
 * - Config file updates
 * - Graceful shutdown
 */
export class DevEnvironment {
  private state: DevEnvironmentState;
  private options: Required<DevEnvironmentOptions>;
  private shutdownHandler: (() => Promise<void>) | null = null;

  constructor(options: DevEnvironmentOptions = {}) {
    // Determine if we should run widget Metro
    const shouldRunWidgetMetro =
      options.runWidgetMetro !== undefined
        ? options.runWidgetMetro
        : !(isInstalledFromNpm() && hasPrebuiltWidgetBundle());

    this.options = {
      port: options.port ?? 3847,
      widgetPort: options.widgetPort ?? 8082,
      metroPort: options.metroPort ?? 8081,
      project: options.project ?? undefined,
      tunnel: options.tunnel ?? true,
      server: options.server ?? true,
      runWidgetMetro: shouldRunWidgetMetro,
      metroCommand: options.metroCommand ?? "npm",
      watchServer: options.watchServer ?? false,
    } as Required<DevEnvironmentOptions>;

    this.state = {
      ports: {
        promptServer: this.options.port,
        widgetMetro: null,
        appMetro: this.options.metroPort,
      },
      tunnelUrls: {
        promptServer: null,
        widgetMetro: null,
        appMetro: null,
      },
      projectRoot: "",
      widgetDir: "",
      widgetProcess: null,
      appProcess: null,
      promptServer: null,
      promptTunnel: null,
      widgetTunnel: null,
      appTunnel: null,
      isRunningWidgetMetro: this.options.runWidgetMetro,
      extraTunnels: [],
      envFile: null,
      serverWatcher: null,
      serverSecret: null,
    };
  }

  /**
   * Allocate ports for all services
   */
  async allocatePorts(): Promise<DevEnvironmentPorts> {
    console.log(chalk.gray("  Checking port availability..."));

    const allocatedPorts: number[] = [];

    // Prompt server port
    const promptPort = await findFreePort(this.options.port);
    allocatedPorts.push(promptPort);
    if (promptPort !== this.options.port) {
      console.log(
        chalk.yellow(`  ⚠ Port ${this.options.port} busy, using ${promptPort} for prompt server`)
      );
    }

    // Widget Metro port (only if running widget Metro)
    let widgetPort: number | null = null;
    if (this.state.isRunningWidgetMetro) {
      widgetPort = await findFreePort(this.options.widgetPort, 10, allocatedPorts);
      allocatedPorts.push(widgetPort);
      if (widgetPort !== this.options.widgetPort) {
        console.log(
          chalk.yellow(
            `  ⚠ Port ${this.options.widgetPort} busy, using ${widgetPort} for widget Metro`
          )
        );
      }
    }

    // App Metro port
    const metroPort = await findFreePort(this.options.metroPort, 10, allocatedPorts);
    if (metroPort !== this.options.metroPort) {
      console.log(
        chalk.yellow(`  ⚠ Port ${this.options.metroPort} busy, using ${metroPort} for app Metro`)
      );
    }

    this.state.ports = {
      promptServer: promptPort,
      widgetMetro: widgetPort,
      appMetro: metroPort,
    };

    return this.state.ports;
  }

  /**
   * Resolve and validate project directory
   */
  resolveProject(options: { exitOnError?: boolean } = {}): string {
    const { exitOnError = false } = options;

    this.state.projectRoot = resolveProjectRoot(this.options.project);
    const packageRoot = getPackageRoot();
    this.state.widgetDir = path.join(packageRoot, "widget");

    // Log if using example app
    const exampleDir = path.join(packageRoot, "example");
    if (this.state.projectRoot === exampleDir && !this.options.project) {
      console.log(chalk.gray(`  Using example app: ${this.state.projectRoot}\n`));
    }

    // Validate project directory
    if (!validateExpoProject(this.state.projectRoot)) {
      if (exitOnError) {
        console.log(chalk.red(`\n  ✗ No Expo app found at ${this.state.projectRoot}`));
        console.log(chalk.gray(`    Use --project to specify the app directory\n`));
        process.exit(1);
      } else {
        console.log(chalk.yellow(`  ⚠ No Expo app found at ${this.state.projectRoot}`));
        console.log(chalk.gray(`    Use --project to specify the app directory\n`));
      }
    }

    // Verify widget directory exists
    if (!fs.existsSync(this.state.widgetDir)) {
      if (exitOnError) {
        console.log(chalk.red(`\n  ✗ Widget directory not found: ${this.state.widgetDir}`));
        process.exit(1);
      }
    }

    return this.state.projectRoot;
  }

  /**
   * Start Metro bundler servers
   */
  async startMetroServers(): Promise<void> {
    console.log(chalk.gray("\n  Starting Metro bundlers..."));

    // Start widget Metro server if needed
    if (this.state.isRunningWidgetMetro && this.state.ports.widgetMetro) {
      console.log(chalk.blue(`  Starting widget Metro...`));
      this.state.widgetProcess = await startMetro({
        name: "Widget",
        cwd: this.state.widgetDir,
        port: this.state.ports.widgetMetro,
        command: this.options.metroCommand,
      });
    } else {
      console.log(chalk.green(`  ✓ Using pre-built widget bundle`));
    }

    // Start app Metro server
    this.state.appProcess = await startMetro({
      name: "App",
      cwd: this.state.projectRoot,
      port: this.state.ports.appMetro,
      command: this.options.metroCommand,
    });
  }

  /**
   * Start the prompt WebSocket server
   */
  async startPromptServer(): Promise<void> {
    if (!this.options.server) {
      console.log(chalk.yellow(`  ⚠ WebSocket server skipped (--no-server)`));
      console.log(chalk.gray(`    Run separately: npx expo-air server`));
      return;
    }

    console.log(chalk.gray("\n  Starting prompt server..."));
    this.state.serverSecret = randomBytes(32).toString("hex");
    const { PromptServer } = await import("../server/promptServer.js");
    this.state.promptServer = new PromptServer(this.state.ports.promptServer, this.state.projectRoot, this.state.serverSecret);
    await this.state.promptServer.start();
    console.log(chalk.green(`  ✓ Prompt server started on port ${this.state.ports.promptServer} (authenticated)`));

    // Start watching for changes if in watch mode
    if (this.options.watchServer) {
      this.startServerWatcher();
    }
  }

  /**
   * Start watching prompt server files for changes (dev mode only)
   */
  private startServerWatcher(): void {
    // Watch the server directory - works from both source and compiled
    const packageRoot = getPackageRoot();
    const serverDir = path.join(packageRoot, "cli", "server");
    const distServerDir = path.join(packageRoot, "cli", "dist", "server");

    // Determine which directory to watch
    const watchDir = fs.existsSync(serverDir) ? serverDir : distServerDir;

    if (!fs.existsSync(watchDir)) {
      console.log(chalk.yellow(`  ⚠ Watch mode: server directory not found`));
      return;
    }

    console.log(chalk.blue(`  👀 Watching prompt server for changes...`));

    let isRestarting = false;
    let restartTimeout: NodeJS.Timeout | null = null;

    this.state.serverWatcher = chokidar.watch(watchDir, {
      ignored: /(^|[\/\\])\../, // ignore dotfiles
      persistent: true,
      ignoreInitial: true,
    });

    this.state.serverWatcher.on("change", async (filePath) => {
      // Debounce rapid changes
      if (restartTimeout) {
        clearTimeout(restartTimeout);
      }

      restartTimeout = setTimeout(async () => {
        if (isRestarting) return;
        isRestarting = true;

        const fileName = path.basename(filePath);
        console.log(chalk.yellow(`\n  🔄 Detected change in ${fileName}, restarting prompt server...`));

        try {
          // Stop current server
          if (this.state.promptServer) {
            await this.state.promptServer.stop();
          }

          // Clear module cache for ESM (using dynamic import with cache bust)
          const cacheBust = `?update=${Date.now()}`;
          const { PromptServer } = await import(`../server/promptServer.js${cacheBust}`);

          // Create and start new server
          const newServer = new PromptServer(this.state.ports.promptServer, this.state.projectRoot, this.state.serverSecret);
          await newServer.start();
          this.state.promptServer = newServer;

          console.log(chalk.green(`  ✓ Prompt server restarted successfully`));
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(chalk.red(`  ✗ Failed to restart prompt server: ${message}`));
        }

        isRestarting = false;
      }, 300); // 300ms debounce
    });
  }

  /**
   * Start Cloudflare tunnels for remote access
   * @returns true if all tunnels started successfully, false if rate limited
   */
  async startTunnels(): Promise<boolean> {
    if (!this.options.tunnel) {
      return true;
    }

    console.log(chalk.gray("\n  Starting tunnels (Cloudflare)..."));

    let rateLimitHit = false;

    // Prompt server tunnel
    this.state.promptTunnel = new CloudflareTunnel();
    try {
      const info = await this.state.promptTunnel.start(this.state.ports.promptServer);
      const wsUrl = info.url.replace("https://", "wss://");
      this.state.tunnelUrls.promptServer = appendSecret(wsUrl, this.state.serverSecret);
      console.log(chalk.green(`  ✓ Prompt tunnel ready`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("rate limit") || message.includes("429")) {
        rateLimitHit = true;
      }
      console.log(chalk.red(`  ✗ Prompt tunnel failed`));
    }

    // Widget Metro tunnel (only if running widget Metro and not rate limited)
    if (
      !rateLimitHit &&
      this.state.isRunningWidgetMetro &&
      this.state.widgetProcess &&
      this.state.ports.widgetMetro
    ) {
      this.state.widgetTunnel = new CloudflareTunnel();
      try {
        const info = await this.state.widgetTunnel.start(this.state.ports.widgetMetro);
        this.state.tunnelUrls.widgetMetro = info.url;
        console.log(chalk.green(`  ✓ Widget tunnel ready`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("rate limit") || message.includes("429")) {
          rateLimitHit = true;
        }
        console.log(chalk.red(`  ✗ Widget tunnel failed`));
      }
    }

    // App Metro tunnel
    if (!rateLimitHit) {
      this.state.appTunnel = new CloudflareTunnel();
      try {
        const info = await this.state.appTunnel.start(this.state.ports.appMetro);
        this.state.tunnelUrls.appMetro = info.url;
        console.log(chalk.green(`  ✓ App tunnel ready`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("rate limit") || message.includes("429")) {
          rateLimitHit = true;
        }
        console.log(chalk.red(`  ✗ App tunnel failed`));
      }
    }

    return !rateLimitHit;
  }

  /**
   * Start extra tunnels configured in .expo-air.json
   * @returns true if all tunnels started successfully, false if rate limited
   */
  async startExtraTunnels(): Promise<boolean> {
    if (!this.options.tunnel) {
      return true;
    }

    // Read config
    const config = readExpoAirConfig(this.state.projectRoot);
    if (!config?.extraTunnels || config.extraTunnels.length === 0) {
      return true;
    }

    // Store env file path for later
    if (config.envFile) {
      this.state.envFile = path.join(this.state.projectRoot, config.envFile);
    }

    console.log(chalk.gray(`\n  Starting extra tunnels (${config.extraTunnels.length} configured)...`));

    let rateLimitHit = false;

    for (const tunnelConfig of config.extraTunnels) {
      if (rateLimitHit) break;

      const tunnel = new CloudflareTunnel();
      try {
        const info = await tunnel.start(tunnelConfig.port);
        this.state.extraTunnels.push({
          config: tunnelConfig,
          tunnel,
          url: info.url,
        });
        console.log(chalk.green(`  ✓ ${tunnelConfig.name} tunnel ready (port ${tunnelConfig.port})`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("rate limit") || message.includes("429")) {
          rateLimitHit = true;
        }
        console.log(chalk.red(`  ✗ ${tunnelConfig.name} tunnel failed (port ${tunnelConfig.port})`));
        // Still add to state for cleanup
        this.state.extraTunnels.push({
          config: tunnelConfig,
          tunnel,
          url: null,
        });
      }
    }

    return !rateLimitHit;
  }

  /**
   * Write extra tunnel URLs to the configured env file
   */
  writeEnvFileWithTunnelUrls(): void {
    if (!this.state.envFile || this.state.extraTunnels.length === 0) {
      return;
    }

    // Build updates object
    const updates: Record<string, string> = {};
    for (const extraTunnel of this.state.extraTunnels) {
      if (extraTunnel.url) {
        updates[extraTunnel.config.envVar] = extraTunnel.url;
      }
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    updateEnvFile(this.state.envFile, updates);
    console.log(chalk.green(`  ✓ Updated ${path.basename(this.state.envFile)} with tunnel URLs`));
  }

  /**
   * Show rate limit warning message
   */
  showRateLimitWarning(exitOnError = false): void {
    if (exitOnError) {
      console.log(chalk.red(`\n  ✗ Cloudflare rate limit reached (429 Too Many Requests)`));
    } else {
      console.log(chalk.yellow(`\n  ⚠ Cloudflare rate limit reached (429 Too Many Requests)`));
    }
    console.log(chalk.gray(`    This happens when too many tunnel requests are made.`));
    console.log(chalk.gray(`    Options:`));
    console.log(chalk.white(`      1. Wait a few minutes and try again`));
    console.log(chalk.white(`      2. Use --no-tunnel to run without tunnels`));
    if (exitOnError) {
      console.log(chalk.white(`      3. Device must be on same WiFi as your computer\n`));
    } else {
      console.log(chalk.white(`      3. Connect device via USB for local development\n`));
    }

    if (exitOnError) {
      process.exit(1);
    }
  }

  /**
   * Update config files with tunnel URLs
   */
  updateConfigFiles(): void {
    const { promptServer, widgetMetro, appMetro } = this.state.tunnelUrls;

    // Build local server URL with secret when tunnels are not used
    const localServerUrl = this.state.serverSecret
      ? appendSecret(`ws://localhost:${this.state.ports.promptServer}`, this.state.serverSecret)
      : null;

    if (!promptServer && !localServerUrl && !widgetMetro && !appMetro) {
      return;
    }

    const localConfig: Partial<ExpoAirConfig> = {};
    if (promptServer) localConfig.serverUrl = promptServer;
    else if (localServerUrl) localConfig.serverUrl = localServerUrl;
    if (widgetMetro) localConfig.widgetMetroUrl = widgetMetro;
    if (appMetro) localConfig.appMetroUrl = appMetro;

    // Write to .expo-air.local.json
    writeLocalConfig(this.state.projectRoot, localConfig);

    // Update Info.plist
    const plistUpdated = updateInfoPlist(this.state.projectRoot, localConfig, { silent: true });
    if (plistUpdated) {
      console.log(chalk.green(`  ✓ Updated config with tunnel URLs`));
    } else {
      console.log(chalk.green(`  ✓ Updated .expo-air.local.json with tunnel URLs`));
    }
  }

  /**
   * Display connection info
   */
  displayConnectionInfo(): void {
    const { promptServer, widgetMetro, appMetro } = this.state.tunnelUrls;

    console.log(chalk.gray("\n  ─────────────────────────────────────────────"));
    console.log(chalk.gray("  Local (same WiFi):"));

    if (this.options.server) {
      console.log(chalk.white(`    Prompt Server: ws://localhost:${this.state.ports.promptServer}`));
    }
    if (this.state.widgetProcess && this.state.ports.widgetMetro) {
      console.log(chalk.white(`    Widget Metro:  http://localhost:${this.state.ports.widgetMetro}`));
    } else {
      console.log(chalk.white(`    Widget:        (pre-built bundle)`));
    }
    console.log(chalk.white(`    App Metro:     http://localhost:${this.state.ports.appMetro}`));

    // Show extra tunnels (local)
    for (const extraTunnel of this.state.extraTunnels) {
      console.log(chalk.white(`    ${extraTunnel.config.name}:`.padEnd(15) + `http://localhost:${extraTunnel.config.port}`));
    }

    const hasRemoteTunnels = promptServer || widgetMetro || appMetro || this.state.extraTunnels.some(t => t.url);
    if (hasRemoteTunnels) {
      console.log(chalk.gray("\n  Remote (anywhere):"));
      if (promptServer) {
        console.log(chalk.white(`    Prompt Server: ${maskSecret(promptServer)}`));
      }
      if (widgetMetro) {
        console.log(chalk.white(`    Widget Metro:  ${widgetMetro}`));
      }
      if (appMetro) {
        console.log(chalk.white(`    App Metro:     ${appMetro}`));
      }
      // Show extra tunnels (remote)
      for (const extraTunnel of this.state.extraTunnels) {
        if (extraTunnel.url) {
          console.log(chalk.white(`    ${extraTunnel.config.name}:`.padEnd(15) + extraTunnel.url));
        }
      }
    }
    console.log(chalk.gray("  ─────────────────────────────────────────────"));
  }

  /**
   * Set up graceful shutdown handlers
   */
  setupShutdownHandlers(message = "Shutting down...", completionMessage?: string): void {
    this.shutdownHandler = async () => {
      console.log(chalk.gray(`\n  ${message}`));

      // Kill Metro process trees (not just parent) to release all ports
      if (this.state.widgetProcess?.pid) {
        await killProcessTree(this.state.widgetProcess.pid);
      }
      if (this.state.appProcess?.pid) {
        await killProcessTree(this.state.appProcess.pid);
      }
      if (this.state.promptTunnel) {
        await this.state.promptTunnel.stop();
      }
      if (this.state.widgetTunnel) {
        await this.state.widgetTunnel.stop();
      }
      if (this.state.appTunnel) {
        await this.state.appTunnel.stop();
      }
      // Stop extra tunnels
      for (const extraTunnel of this.state.extraTunnels) {
        await extraTunnel.tunnel.stop();
      }
      // Stop server watcher
      if (this.state.serverWatcher) {
        await this.state.serverWatcher.close();
      }
      if (this.state.promptServer) {
        await this.state.promptServer.stop();
      }

      if (completionMessage) {
        console.log(chalk.green(`  ${completionMessage}`));
      }

      process.exit(0);
    };

    process.on("SIGINT", this.shutdownHandler);
    process.on("SIGTERM", this.shutdownHandler);
  }

  /**
   * Get the current state
   */
  getState(): DevEnvironmentState {
    return this.state;
  }

  /**
   * Get project root
   */
  getProjectRoot(): string {
    return this.state.projectRoot;
  }

  /**
   * Get allocated ports
   */
  getPorts(): DevEnvironmentPorts {
    return this.state.ports;
  }

  /**
   * Get tunnel URLs
   */
  getTunnelUrls(): TunnelUrls {
    return this.state.tunnelUrls;
  }

  /**
   * Get the server authentication secret
   */
  getServerSecret(): string | null {
    return this.state.serverSecret;
  }

  /**
   * Manually stop all services (useful for programmatic control)
   */
  async stop(): Promise<void> {
    if (this.shutdownHandler) {
      await this.shutdownHandler();
    }
  }
}

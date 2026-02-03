import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { CloudflareTunnel } from "../tunnel/cloudflare.js";
import plist from "plist";

interface ExpoAirConfig {
  autoShow?: boolean;
  serverUrl?: string;
  widgetMetroUrl?: string;
  appMetroUrl?: string;
  ui?: {
    bubbleSize?: number;
    bubbleColor?: string;
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Directly update Info.plist with tunnel URLs.
 * This allows URL changes without running `npx expo prebuild`.
 * Just rebuild the app (Cmd+R in Xcode) after this.
 */
function updateInfoPlist(projectRoot: string, config: Partial<ExpoAirConfig>): boolean {
  // Find the ios directory
  const iosDir = path.join(projectRoot, "ios");
  if (!fs.existsSync(iosDir)) {
    console.log(chalk.yellow(`  ⚠ No ios directory found at ${iosDir}`));
    return false;
  }

  // Find the project name by looking for Info.plist
  const entries = fs.readdirSync(iosDir, { withFileTypes: true });
  let infoPlistPath: string | null = null;

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "Pods") {
      const potentialPath = path.join(iosDir, entry.name, "Info.plist");
      if (fs.existsSync(potentialPath)) {
        infoPlistPath = potentialPath;
        break;
      }
    }
  }

  if (!infoPlistPath) {
    console.log(chalk.yellow(`  ⚠ Could not find Info.plist in ios directory`));
    return false;
  }

  try {
    // Read and parse the plist
    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");
    const plistData = plist.parse(plistContent) as Record<string, unknown>;

    // Get or create ExpoAir dictionary
    const expoAir = (plistData.ExpoAir as Record<string, unknown>) || {};

    // Update with new tunnel URLs
    if (config.serverUrl) expoAir.serverUrl = config.serverUrl;
    if (config.widgetMetroUrl) expoAir.widgetMetroUrl = config.widgetMetroUrl;
    if (config.appMetroUrl) expoAir.appMetroUrl = config.appMetroUrl;

    // Write back
    plistData.ExpoAir = expoAir;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedPlist = plist.build(plistData as any);
    fs.writeFileSync(infoPlistPath, updatedPlist);

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(chalk.yellow(`  ⚠ Failed to update Info.plist: ${message}`));
    return false;
  }
}

interface StartOptions {
  port: string;
  build: boolean;
  tunnel: boolean;
  server: boolean;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-air\n"));
  console.log(chalk.gray("  Starting full development environment...\n"));

  const port = parseInt(options.port, 10);
  const widgetPort = parseInt(options.widgetPort || "8082", 10);
  const metroPort = parseInt(options.metroPort || "8081", 10);

  // Resolve project directory
  let projectRoot = options.project ? path.resolve(options.project) : process.cwd();

  // If running from the expo-air package root, default to example/
  // __dirname is cli/dist/commands/ (compiled), so ../../.. gets to package root
  const exampleDir = path.resolve(__dirname, "../../..", "example");
  if (!options.project && fs.existsSync(path.join(exampleDir, "app.json"))) {
    // Check if we're in the package root (not in example already)
    if (!fs.existsSync(path.join(projectRoot, "app.json"))) {
      projectRoot = exampleDir;
      console.log(chalk.gray(`  Using example app: ${projectRoot}\n`));
    }
  }

  // Validate project directory
  if (!fs.existsSync(path.join(projectRoot, "app.json")) && !fs.existsSync(path.join(projectRoot, "app.config.js"))) {
    console.log(chalk.yellow(`  ⚠ No Expo app found at ${projectRoot}`));
    console.log(chalk.gray(`    Use --project to specify the app directory\n`));
  }

  // Find widget directory (relative to CLI)
  // __dirname is cli/dist/commands/ (compiled), so ../../.. gets to package root
  const widgetDir = path.resolve(__dirname, "../../..", "widget");

  // Helper to start a Metro server
  const startMetro = async (
    name: string,
    cwd: string,
    metroPortNum: number
  ): Promise<ChildProcess | null> => {
    try {
      const proc = spawn("npm", ["start", "--", "--port", String(metroPortNum)], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FORCE_COLOR: "1" },
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 5000);

        proc.on("error", (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        proc.stdout?.on("data", (data) => {
          const str = data.toString();
          if (str.includes("Metro") || str.includes("Bundler") || str.includes("Starting")) {
            clearTimeout(timeout);
            resolve();
          }
        });

        proc.stderr?.on("data", (data) => {
          const str = data.toString();
          if (str.includes("Metro") || str.includes("Bundler")) {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      console.log(chalk.green(`  ✓ ${name} Metro started on port ${metroPortNum}`));
      return proc;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  ⚠ ${name} Metro: ${message}`));
      console.log(chalk.gray(`    Run manually: cd ${path.basename(cwd)} && npm start`));
      return null;
    }
  };

  // Start widget Metro server
  const widgetProcess = await startMetro("Widget", widgetDir, widgetPort);

  // Start main app Metro server
  const appProcess = await startMetro("App", projectRoot, metroPort);

  // Start prompt server (unless --no-server)
  let server: { start: () => Promise<void>; stop: () => Promise<void> } | null = null;
  if (options.server) {
    const { PromptServer } = await import("../server/promptServer.js");
    server = new PromptServer(port, projectRoot);
    await server.start();
    console.log(chalk.green(`  ✓ Prompt server started on port ${port}`));
    console.log(chalk.gray(`    Project root: ${projectRoot}`));
  } else {
    console.log(chalk.yellow(`  ⚠ WebSocket server skipped (--no-server)`));
    console.log(chalk.gray(`    Run separately: npx expo-air server`));
  }

  // Start tunnels if enabled
  let promptTunnel: CloudflareTunnel | null = null;
  let widgetTunnel: CloudflareTunnel | null = null;
  let appTunnel: CloudflareTunnel | null = null;
  let promptTunnelUrl: string | null = null;
  let widgetTunnelUrl: string | null = null;
  let appTunnelUrl: string | null = null;

  if (options.tunnel) {
    console.log(chalk.gray("  Starting tunnels (Cloudflare)..."));

    // Start prompt server tunnel
    promptTunnel = new CloudflareTunnel();
    try {
      const info = await promptTunnel.start(port);
      // Convert https to wss for WebSocket
      promptTunnelUrl = info.url.replace("https://", "wss://");
      console.log(chalk.green(`  ✓ Prompt tunnel:  ${promptTunnelUrl}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Prompt tunnel failed: ${message}`));
    }

    // Start widget Metro tunnel
    widgetTunnel = new CloudflareTunnel();
    try {
      const info = await widgetTunnel.start(widgetPort);
      widgetTunnelUrl = info.url;
      console.log(chalk.green(`  ✓ Widget tunnel:  ${widgetTunnelUrl}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ Widget tunnel failed: ${message}`));
    }

    // Start main app Metro tunnel
    appTunnel = new CloudflareTunnel();
    try {
      const info = await appTunnel.start(metroPort);
      appTunnelUrl = info.url;
      console.log(chalk.green(`  ✓ App tunnel:     ${appTunnelUrl}`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.red(`  ✗ App tunnel failed: ${message}`));
    }

    // Update config files with tunnel URLs
    if (promptTunnelUrl || widgetTunnelUrl || appTunnelUrl) {
      // 1. Write to .expo-air.local.json (gitignored, for reference)
      const localConfigPath = path.join(projectRoot, ".expo-air.local.json");
      const localConfig: Partial<ExpoAirConfig> = {};

      if (promptTunnelUrl) localConfig.serverUrl = promptTunnelUrl;
      if (widgetTunnelUrl) localConfig.widgetMetroUrl = widgetTunnelUrl;
      if (appTunnelUrl) localConfig.appMetroUrl = appTunnelUrl;

      fs.writeFileSync(localConfigPath, JSON.stringify(localConfig, null, 2) + "\n");
      console.log(chalk.green(`  ✓ Updated .expo-air.local.json with tunnel URLs`));

      // 2. Directly update Info.plist (no prebuild needed!)
      const infoPlistUpdated = updateInfoPlist(projectRoot, localConfig);
      if (infoPlistUpdated) {
        console.log(chalk.green(`  ✓ Updated Info.plist - just rebuild (Cmd+R), no prebuild needed!`));
      }
    }
  }

  if (options.build) {
    // TODO: Phase 4 - Build and install app
    console.log(chalk.yellow("  ⚠ Build not yet implemented (Phase 4)"));
  }

  // Show connection info
  console.log(chalk.gray("\n  ─────────────────────────────────────────────"));
  console.log(chalk.gray("  Local (same WiFi):"));
  if (options.server) {
    console.log(chalk.white(`    Prompt Server: ws://localhost:${port}`));
  }
  console.log(chalk.white(`    Widget Metro:  http://localhost:${widgetPort}`));
  console.log(chalk.white(`    App Metro:     http://localhost:${metroPort}`));
  if (promptTunnelUrl || widgetTunnelUrl || appTunnelUrl) {
    console.log(chalk.gray("\n  Remote (anywhere):"));
    if (promptTunnelUrl) {
      console.log(chalk.white(`    Prompt Server: ${promptTunnelUrl}`));
    }
    if (widgetTunnelUrl) {
      console.log(chalk.white(`    Widget Metro:  ${widgetTunnelUrl}`));
    }
    if (appTunnelUrl) {
      console.log(chalk.white(`    App Metro:     ${appTunnelUrl}`));
    }
  }
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  if (options.server) {
    console.log(chalk.yellow("\n  Waiting for prompts...\n"));
  } else {
    console.log(chalk.yellow("\n  Running... (Ctrl+C to stop)\n"));
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(chalk.gray("\n  Shutting down..."));
    if (widgetProcess) {
      widgetProcess.kill();
    }
    if (appProcess) {
      appProcess.kill();
    }
    if (promptTunnel) {
      await promptTunnel.stop();
    }
    if (widgetTunnel) {
      await widgetTunnel.stop();
    }
    if (appTunnel) {
      await appTunnel.stop();
    }
    if (server) {
      await server.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

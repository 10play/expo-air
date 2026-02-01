import chalk from "chalk";
import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { CloudflareTunnel } from "../tunnel/cloudflare.js";

interface ExpoFlowConfig {
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

interface StartOptions {
  port: string;
  build: boolean;
  tunnel: boolean;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
}

export async function startCommand(options: StartOptions): Promise<void> {
  console.log(chalk.blue("\n  expo-flow\n"));
  console.log(chalk.gray("  Starting full development environment...\n"));

  const port = parseInt(options.port, 10);
  const widgetPort = parseInt(options.widgetPort || "8082", 10);
  const metroPort = parseInt(options.metroPort || "8081", 10);

  // Resolve project directory
  let projectRoot = options.project ? path.resolve(options.project) : process.cwd();

  // If running from the expo-flow package root, default to example/
  // __dirname is cli/commands/, so ../.. gets to package root
  const exampleDir = path.resolve(__dirname, "../..", "example");
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
  // __dirname is cli/commands/, so ../.. gets to package root
  const widgetDir = path.resolve(__dirname, "../..", "widget");

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

  // Start prompt server
  const { PromptServer } = await import("../server/promptServer.js");
  const server = new PromptServer(port, projectRoot);
  await server.start();
  console.log(chalk.green(`  ✓ Prompt server started on port ${port}`));
  console.log(chalk.gray(`    Project root: ${projectRoot}`));

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

    // Update .expo-flow.json with tunnel URLs
    if (promptTunnelUrl || widgetTunnelUrl || appTunnelUrl) {
      const configPath = path.join(projectRoot, ".expo-flow.json");
      let config: ExpoFlowConfig = {};

      try {
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        }
      } catch {
        // Ignore parse errors, start fresh
      }

      // Update with tunnel URLs
      if (promptTunnelUrl) {
        config.serverUrl = promptTunnelUrl;
      }
      if (widgetTunnelUrl) {
        config.widgetMetroUrl = widgetTunnelUrl;
      }
      if (appTunnelUrl) {
        config.appMetroUrl = appTunnelUrl;
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
      console.log(chalk.green(`  ✓ Updated ${path.basename(configPath)} with tunnel URLs`));
    }
  }

  if (options.build) {
    // TODO: Phase 4 - Build and install app
    console.log(chalk.yellow("  ⚠ Build not yet implemented (Phase 4)"));
  }

  // Show connection info
  console.log(chalk.gray("\n  ─────────────────────────────────────────────"));
  console.log(chalk.gray("  Local (same WiFi):"));
  console.log(chalk.white(`    Prompt Server: ws://localhost:${port}`));
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
  console.log(chalk.yellow("\n  Waiting for prompts...\n"));

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
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

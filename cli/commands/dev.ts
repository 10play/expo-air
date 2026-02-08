import chalk from "chalk";
import { spawn, execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { DevEnvironment } from "../runner/devEnvironment.js";
import { writeLocalConfig, updateInfoPlist, getPackageRoot } from "../utils/common.js";

export interface DevOptions {
  port: string;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
}

export async function devCommand(options: DevOptions): Promise<void> {
  console.log(chalk.blue("\n  🛠  expo-air dev\n"));
  console.log(chalk.gray("  Starting SDK development environment (simulator)...\n"));

  const env = new DevEnvironment({
    port: parseInt(options.port, 10),
    widgetPort: options.widgetPort ? parseInt(options.widgetPort, 10) : undefined,
    metroPort: options.metroPort ? parseInt(options.metroPort, 10) : undefined,
    project: options.project,
    tunnel: false,
    server: true,
    runWidgetMetro: true,
    metroCommand: "npm",
    watchServer: true,
  });

  // Allocate ports
  await env.allocatePorts();

  // Resolve project directory
  env.resolveProject({ exitOnError: true });

  // Remove prebuilt widget bundle so Metro is used for development
  const packageRoot = getPackageRoot();
  const prebuiltBundle = join(packageRoot, "ios", "widget.jsbundle");
  if (existsSync(prebuiltBundle)) {
    unlinkSync(prebuiltBundle);
    console.log(chalk.green("  ✓ Removed prebuilt widget bundle (will use Metro)"));
  }

  // Check if Pods still reference the deleted bundle and need a refresh
  const iosDir = join(env.getProjectRoot(), "ios");
  const podsDir = join(iosDir, "Pods");
  if (existsSync(podsDir)) {
    try {
      execSync("grep -rq 'widget\\.jsbundle' Pods/", {
        cwd: iosDir,
        stdio: ["pipe", "pipe", "pipe"],
      });
      // grep succeeded = stale reference exists, run pod install
      console.log(chalk.blue("  ⟳ Refreshing pods (stale bundle reference)..."));
      execSync("pod install", {
        cwd: iosDir,
        stdio: "inherit",
      });
      console.log(chalk.green("  ✓ Pods refreshed"));
    } catch {
      // grep failed = no stale references, no pod install needed
    }
  }

  // Start Metro servers (widget + app)
  await env.startMetroServers();

  // Start prompt server (with watch mode)
  await env.startPromptServer();

  const ports = env.getPorts();
  const projectRoot = env.getProjectRoot();

  // Write local config with localhost URLs so the app knows where to find the servers
  const localConfig: Record<string, string> = {
    serverUrl: `ws://localhost:${ports.promptServer}`,
  };
  if (ports.widgetMetro) {
    localConfig.widgetMetroUrl = `http://localhost:${ports.widgetMetro}`;
  }
  localConfig.appMetroUrl = `http://localhost:${ports.appMetro}`;
  writeLocalConfig(projectRoot, localConfig);
  const plistUpdated = updateInfoPlist(projectRoot, localConfig, { silent: true });
  if (plistUpdated) {
    console.log(chalk.green(`  ✓ Updated config with local server URLs`));
  } else {
    console.log(chalk.green(`  ✓ Updated .expo-air.local.json with local server URLs`));
  }

  // Build and run on iOS simulator

  console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
  console.log(chalk.blue("  📱 Building for iOS Simulator..."));
  console.log(chalk.blue("  ─────────────────────────────────────────────\n"));

  const buildProcess = spawn(
    "npx",
    ["expo", "run:ios", "--port", String(ports.appMetro)],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...(process.env as Record<string, string>),
        FORCE_COLOR: "1",
      },
    }
  );

  await new Promise<void>((resolve, reject) => {
    buildProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Simulator build failed with code ${code}`));
      }
    });
    buildProcess.on("error", reject);
  });

  // Build succeeded
  const state = env.getState();

  console.log(chalk.green("\n  🛠  Dev environment ready!\n"));
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.gray("  Servers:"));
  console.log(chalk.white(`    Prompt:  ws://localhost:${ports.promptServer}`));
  if (state.widgetProcess && ports.widgetMetro) {
    console.log(chalk.white(`    Widget:  http://localhost:${ports.widgetMetro}`));
  }
  console.log(chalk.white(`    App:     http://localhost:${ports.appMetro}`));
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.yellow("\n  Waiting for prompts... (Ctrl+C to stop)\n"));

  // Set up graceful shutdown
  env.setupShutdownHandlers("Shutting down dev environment...");
}

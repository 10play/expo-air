import chalk from "chalk";
import { spawn, execSync, type ChildProcess } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { DevEnvironment, killProcessTree } from "../runner/devEnvironment.js";
import { writeLocalConfig, updateInfoPlist, updateAndroidManifest, getPackageRoot, appendSecret, resolveAndroidJavaHome, detectPackageManager, getExecCommand } from "../utils/common.js";

export interface DevOptions {
  port: string;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
  device?: string;
  platform?: "ios" | "android";
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
    metroCommand: "run-script",
    watchServer: true,
  });

  // Track the build process so we can kill it on shutdown
  let buildProcess: ChildProcess | null = null;
  let isShuttingDown = false;

  // Set up graceful shutdown early so Ctrl+C works at any point
  // (during build, during runtime, etc.)
  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(chalk.gray("\n  Shutting down dev environment..."));

    // Kill the build/run process tree if still running
    if (buildProcess?.pid) {
      await killProcessTree(buildProcess.pid);
    }

    // Kill all managed processes (Metro, prompt server, watchers)
    const state = env.getState();
    if (state.widgetProcess?.pid) {
      await killProcessTree(state.widgetProcess.pid);
    }
    if (state.appProcess?.pid) {
      await killProcessTree(state.appProcess.pid);
    }
    if (state.serverWatcher) {
      await state.serverWatcher.close();
    }
    if (state.promptServer) {
      await state.promptServer.stop();
    }

    console.log(chalk.green("  ✓ Dev environment stopped.\n"));
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Allocate ports
  await env.allocatePorts();

  // Resolve project directory
  env.resolveProject({ exitOnError: true });

  // Remove prebuilt widget bundle so Metro is used for development
  const isAndroid = options.platform === "android";
  const packageRoot = getPackageRoot();
  const prebuiltBundle = isAndroid
    ? join(packageRoot, "android", "src", "main", "assets", "widget.android.bundle")
    : join(packageRoot, "ios", "widget.jsbundle");
  if (existsSync(prebuiltBundle)) {
    unlinkSync(prebuiltBundle);
    console.log(chalk.green("  ✓ Removed prebuilt widget bundle (will use Metro)"));
  }

  // Check if Pods still reference the deleted bundle and need a refresh (iOS only)
  if (!isAndroid) {
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
  }

  // Start Metro servers (widget + app)
  await env.startMetroServers();

  // Start prompt server (with watch mode)
  await env.startPromptServer();

  const ports = env.getPorts();
  const projectRoot = env.getProjectRoot();

  // Write local config with URLs so the app knows where to find the servers
  // Android emulator uses 10.0.2.2 to reach the host machine
  const host = isAndroid ? "10.0.2.2" : "localhost";
  const localConfig: Record<string, string> = {
    serverUrl: appendSecret(`ws://${host}:${ports.promptServer}`, env.getServerSecret()),
  };
  if (ports.widgetMetro) {
    localConfig.widgetMetroUrl = `http://${host}:${ports.widgetMetro}`;
  }
  localConfig.appMetroUrl = `http://${host}:${ports.appMetro}`;
  writeLocalConfig(projectRoot, localConfig);
  if (isAndroid) {
    const manifestUpdated = updateAndroidManifest(projectRoot, localConfig, { silent: true });
    if (manifestUpdated) {
      console.log(chalk.green(`  ✓ Updated AndroidManifest.xml with local server URLs`));
    } else {
      console.log(chalk.green(`  ✓ Updated .expo-air.local.json with local server URLs`));
    }
  } else {
    const plistUpdated = updateInfoPlist(projectRoot, localConfig, { silent: true });
    if (plistUpdated) {
      console.log(chalk.green(`  ✓ Updated config with local server URLs`));
    } else {
      console.log(chalk.green(`  ✓ Updated .expo-air.local.json with local server URLs`));
    }
  }

  // Build and run on simulator/emulator
  const platformLabel = isAndroid ? "Android Emulator" : "iOS Simulator";

  console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
  console.log(chalk.blue(`  📱 Building for ${platformLabel}...`));
  console.log(chalk.blue("  ─────────────────────────────────────────────\n"));

  const runCommand = isAndroid ? "run:android" : "run:ios";
  const runArgs = ["expo", runCommand, "--port", String(ports.appMetro)];
  if (options.device) {
    runArgs.push("--device", options.device);
  } else {
    // Interactive device picker
    runArgs.push("--device");
  }

  const buildEnv: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FORCE_COLOR: "1",
  };

  // Android builds require Java 17+. Auto-detect Android Studio's JDK if JAVA_HOME is not set or too old.
  if (isAndroid) {
    const javaHome = resolveAndroidJavaHome();
    if (javaHome) {
      buildEnv.JAVA_HOME = javaHome;
    }
  }

  const pm = detectPackageManager(projectRoot);
  const exec = getExecCommand(pm);

  buildProcess = spawn(
    exec.cmd,
    [...exec.args, ...runArgs],
    {
      cwd: projectRoot,
      stdio: "inherit",
      env: buildEnv,
    }
  );

  const bp = buildProcess;
  await new Promise<void>((resolve, reject) => {
    bp.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${platformLabel} build failed with code ${code}`));
      }
    });
    bp.on("error", reject);
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
}

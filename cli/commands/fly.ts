import chalk from "chalk";
import { spawn } from "child_process";
import { DevEnvironment } from "../runner/devEnvironment.js";
import { detectAllDevices, selectDevice, ConnectedDevice } from "../utils/devices.js";
import { getGitBranchSuffix, maskSecret, resolveAndroidJavaHome } from "../utils/common.js";

export interface FlyOptions {
  port: string;
  tunnel: boolean;
  widgetPort?: string;
  metroPort?: string;
  project?: string;
  device?: string;
  dev?: boolean;
}

export async function flyCommand(options: FlyOptions): Promise<void> {
  console.log(chalk.blue("\n  ✈️  expo-air fly\n"));
  console.log(chalk.gray("  One command to rule them all...\n"));

  // Step 1: Check for connected devices
  console.log(chalk.gray("  Detecting connected devices..."));
  const devices = detectAllDevices();

  if (devices.length === 0) {
    console.log(chalk.red("\n  ✗ No device connected\n"));
    console.log(chalk.gray("  To use expo-air fly:"));
    console.log(chalk.white("    1. Connect your iPhone/iPad or Android device with a cable"));
    console.log(chalk.white("    2. Unlock your device and trust this computer"));
    console.log(chalk.white("    3. Run this command again\n"));
    console.log(chalk.gray("  Tip: Use a real device for the best experience.\n"));
    process.exit(1);
  }

  // Show detected devices
  console.log(chalk.green(`  ✓ Found ${devices.length} device(s):`));
  devices.forEach((device) => {
    const platformIcon = device.platform === "ios" ? "🍎" : "🤖";
    const connIcon = device.type === "usb" ? "🔌" : "📶";
    console.log(chalk.white(`    ${platformIcon} ${connIcon} ${device.name}`));
  });

  // Select device
  const selectedDevice = selectDevice(devices, options.device) as ConnectedDevice;
  if (options.device && selectedDevice.udid !== options.device && !selectedDevice.name.toLowerCase().includes(options.device.toLowerCase())) {
    console.log(chalk.yellow(`\n  ⚠ Device "${options.device}" not found, using ${selectedDevice.name}`));
  }

  // Create development environment
  // In fly command:
  // - Widget Metro only runs in dev mode
  // - Uses npx expo start (not npm start)
  // - Watch mode enabled in dev mode for prompt server hot reload
  const env = new DevEnvironment({
    port: parseInt(options.port, 10),
    widgetPort: options.widgetPort ? parseInt(options.widgetPort, 10) : undefined,
    metroPort: options.metroPort ? parseInt(options.metroPort, 10) : undefined,
    project: options.project,
    tunnel: options.tunnel,
    server: true, // fly always has server
    runWidgetMetro: options.dev ?? false, // Only in dev mode
    metroCommand: "npx", // fly uses npx expo start
    watchServer: options.dev ?? false, // Watch prompt server in dev mode
  });

  // Allocate ports
  await env.allocatePorts();

  // Resolve project directory (exit on error for fly command)
  env.resolveProject({ exitOnError: true });

  // Start Metro servers
  await env.startMetroServers();

  // Start prompt server
  await env.startPromptServer();

  // Start tunnels
  const tunnelsOk = await env.startTunnels();
  if (!tunnelsOk) {
    env.showRateLimitWarning(true); // Exit on rate limit for fly
  }

  // Start extra tunnels (configured in .expo-air.json)
  const extraTunnelsOk = await env.startExtraTunnels();
  if (!extraTunnelsOk) {
    env.showRateLimitWarning(true);
  }

  // Update config files
  env.updateConfigFiles();

  // Update env file with extra tunnel URLs
  env.writeEnvFileWithTunnelUrls();

  // Step 5: Build and install on device
  const ports = env.getPorts();
  const projectRoot = env.getProjectRoot();

  // In dev mode, generate bundle suffix from git branch
  // This allows multiple worktrees to install separate apps on the same device
  let branchSuffix: string | null = null;
  if (options.dev) {
    branchSuffix = getGitBranchSuffix(projectRoot);
    if (branchSuffix) {
      console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
      console.log(chalk.blue(`  🚀 Building and installing on ${selectedDevice.name}`));
      console.log(chalk.gray(`     Device ID: ${selectedDevice.udid}`));
      console.log(chalk.cyan(`     Branch suffix: ${branchSuffix}`));
      console.log(chalk.gray(`     Bundle ID will use: EXPO_AIR_BUNDLE_SUFFIX=${branchSuffix}`));
      console.log(chalk.blue("  ─────────────────────────────────────────────\n"));
    } else {
      console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
      console.log(chalk.blue(`  🚀 Building and installing on ${selectedDevice.name}`));
      console.log(chalk.gray(`     Device ID: ${selectedDevice.udid}`));
      console.log(chalk.yellow(`     ⚠ Could not detect git branch for bundle suffix`));
      console.log(chalk.blue("  ─────────────────────────────────────────────\n"));
    }
  } else {
    console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
    console.log(chalk.blue(`  🚀 Building and installing on ${selectedDevice.name}`));
    console.log(chalk.gray(`     Device ID: ${selectedDevice.udid}`));
    console.log(chalk.blue("  ─────────────────────────────────────────────\n"));
  }

  // Build environment variables
  const buildEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    FORCE_COLOR: "1",
    CI: "1",
  };

  // Add branch suffix env vars in dev mode
  // Note: These env vars are read by app.config.js but the bundle ID change
  // only takes effect after running `npx expo prebuild --clean`. Without prebuild,
  // only the app name shown in logs will include the branch suffix.
  if (options.dev && branchSuffix) {
    buildEnv.EXPO_AIR_BUNDLE_SUFFIX = branchSuffix;
    buildEnv.EXPO_AIR_APP_NAME_SUFFIX = branchSuffix;
  }

  const isAndroid = selectedDevice.platform === "android";

  // Android builds require Java 17+
  if (isAndroid) {
    const javaHome = resolveAndroidJavaHome();
    if (javaHome) {
      buildEnv.JAVA_HOME = javaHome;
    }
  }

  const buildArgs = isAndroid
    ? [
        "expo",
        "run:android",
        "--device",
        selectedDevice.udid,
        "--port",
        String(ports.appMetro),
      ]
    : [
        "expo",
        "run:ios",
        "--device",
        selectedDevice.udid,
        "--port",
        String(ports.appMetro),
      ];

  const buildProcess = spawn("npx", buildArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    env: buildEnv,
  });

  // Wait for build to complete
  await new Promise<void>((resolve, reject) => {
    buildProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed with code ${code}`));
      }
    });

    buildProcess.on("error", reject);
  });

  // Build succeeded!
  const state = env.getState();
  const tunnelUrls = env.getTunnelUrls();

  console.log(chalk.green("\n  ✈️  Takeoff successful!\n"));
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.gray("  Your app is now running on:"));
  console.log(chalk.white(`    📱 ${selectedDevice.name}`));
  console.log(chalk.gray("\n  Servers:"));
  console.log(chalk.white(`    Prompt:  ws://localhost:${ports.promptServer}`));
  if (state.widgetProcess && ports.widgetMetro) {
    console.log(chalk.white(`    Widget:  http://localhost:${ports.widgetMetro}`));
  } else {
    console.log(chalk.white(`    Widget:  (pre-built bundle)`));
  }
  console.log(chalk.white(`    App:     http://localhost:${ports.appMetro}`));

  if (tunnelUrls.promptServer) {
    console.log(chalk.gray("\n  Remote access (tunnels):"));
    console.log(chalk.white(`    Prompt:  ${maskSecret(tunnelUrls.promptServer)}`));
    if (tunnelUrls.widgetMetro) {
      console.log(chalk.white(`    Widget:  ${tunnelUrls.widgetMetro}`));
    }
    if (tunnelUrls.appMetro) {
      console.log(chalk.white(`    App:     ${tunnelUrls.appMetro}`));
    }
  }
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.yellow("\n  Waiting for prompts... (Ctrl+C to land)\n"));

  // Set up graceful shutdown
  env.setupShutdownHandlers("🛬 Landing...", "✓ Safe landing. See you next flight!\n");
}

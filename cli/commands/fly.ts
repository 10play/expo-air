import chalk from "chalk";
import { spawn, execSync, ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as net from "net";
import { fileURLToPath } from "url";
import { CloudflareTunnel } from "../tunnel/cloudflare.js";
import plist from "plist";
import { findFreePort } from "../utils/ports.js";

/**
 * Check if a port is listening (Metro is ready)
 */
function waitForPort(port: number, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const tryConnect = () => {
      const socket = new net.Socket();

      socket.setTimeout(1000);

      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });

      socket.on("timeout", () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });

      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 500);
        }
      });

      socket.connect(port, "127.0.0.1");
    };

    tryConnect();
  });
}

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

interface ConnectedDevice {
  udid: string;
  name: string;
  type: "usb" | "wifi";
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get package root directory - works both from source and compiled code
 * Source: cli/commands -> 2 levels up
 * Compiled: cli/dist/commands -> 3 levels up
 */
function getPackageRoot(): string {
  const fromSource = path.resolve(__dirname, "../..");
  const fromCompiled = path.resolve(__dirname, "../../..");

  // Check which one has the widget directory
  if (fs.existsSync(path.join(fromSource, "widget"))) {
    return fromSource;
  }
  return fromCompiled;
}

function detectConnectedDevices(): ConnectedDevice[] {
  const devices: ConnectedDevice[] = [];

  try {
    // Use xcrun xctrace to list devices
    const output = execSync("xcrun xctrace list devices 2>/dev/null", {
      encoding: "utf-8",
      timeout: 10000,
    });

    // Parse output - looking for physical devices (not simulators)
    // Format: "Device Name (OS Version) (UDID)"
    const lines = output.split("\n");
    let inDevicesSection = false;

    for (const line of lines) {
      // Skip simulator section and offline devices
      if (line.includes("Simulator") || line.includes("Offline")) {
        inDevicesSection = false;
        continue;
      }

      // Start of devices section
      if (line.includes("== Devices ==")) {
        inDevicesSection = true;
        continue;
      }

      if (inDevicesSection && line.trim()) {
        // Match pattern: "Device Name (17.0) (00008XXX-XXXX)"
        const match = line.match(/^(.+?)\s+\([\d.]+\)\s+\(([A-F0-9-]+)\)/i);
        if (match) {
          const [, name, udid] = match;
          // Filter out Macs and only keep iPhones/iPads
          if (!name.toLowerCase().includes("mac") && udid.length > 20) {
            devices.push({
              udid: udid.trim(),
              name: name.trim(),
              type: "usb", // xctrace shows USB-connected devices primarily
            });
          }
        }
      }
    }
  } catch {
    // If xctrace fails, try system_profiler for USB devices
    try {
      const usbOutput = execSync(
        'system_profiler SPUSBDataType 2>/dev/null | grep -A 5 "iPhone\\|iPad"',
        { encoding: "utf-8", timeout: 10000 }
      );

      if (usbOutput.includes("iPhone") || usbOutput.includes("iPad")) {
        // Found a device via USB, but we don't have the UDID easily
        // Return a placeholder - expo will auto-detect
        devices.push({
          udid: "auto",
          name: "iOS Device (USB)",
          type: "usb",
        });
      }
    } catch {
      // No devices found
    }
  }

  return devices;
}

function updateInfoPlist(projectRoot: string, config: Partial<ExpoAirConfig>): boolean {
  const iosDir = path.join(projectRoot, "ios");
  if (!fs.existsSync(iosDir)) {
    return false;
  }

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
    return false;
  }

  try {
    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");
    const plistData = plist.parse(plistContent) as Record<string, unknown>;
    const expoAir = (plistData.ExpoAir as Record<string, unknown>) || {};

    if (config.serverUrl) expoAir.serverUrl = config.serverUrl;
    if (config.widgetMetroUrl) expoAir.widgetMetroUrl = config.widgetMetroUrl;
    if (config.appMetroUrl) expoAir.appMetroUrl = config.appMetroUrl;

    plistData.ExpoAir = expoAir;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedPlist = plist.build(plistData as any);
    fs.writeFileSync(infoPlistPath, updatedPlist);
    return true;
  } catch {
    return false;
  }
}

interface FlyOptions {
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
  console.log(chalk.gray("  Detecting connected iOS devices..."));
  const devices = detectConnectedDevices();

  if (devices.length === 0) {
    console.log(chalk.red("\n  ✗ No iOS device connected via USB\n"));
    console.log(chalk.gray("  To use expo-air fly:"));
    console.log(chalk.white("    1. Connect your iPhone/iPad with a cable"));
    console.log(chalk.white("    2. Unlock your device and trust this computer"));
    console.log(chalk.white("    3. Run this command again\n"));
    console.log(chalk.gray("  Tip: Simulators are not supported for expo-air fly."));
    console.log(chalk.gray("       Use a real device for the best experience.\n"));
    process.exit(1);
  }

  // Show detected device(s)
  console.log(chalk.green(`  ✓ Found ${devices.length} device(s):`));
  devices.forEach((device) => {
    const icon = device.type === "usb" ? "🔌" : "📶";
    console.log(chalk.white(`    ${icon} ${device.name}`));
  });

  // Select device (use first one or specified)
  let selectedDevice = devices[0];
  if (options.device) {
    const found = devices.find(
      (d) => d.udid === options.device || d.name.toLowerCase().includes(options.device!.toLowerCase())
    );
    if (found) {
      selectedDevice = found;
    } else {
      console.log(chalk.yellow(`\n  ⚠ Device "${options.device}" not found, using ${selectedDevice.name}`));
    }
  }

  const requestedPort = parseInt(options.port, 10);
  const requestedMetroPort = parseInt(options.metroPort || "8081", 10);

  // Find available ports (passing already-allocated ports to avoid conflicts)
  console.log(chalk.gray("  Checking port availability..."));
  const port = await findFreePort(requestedPort);

  // Widget port only needed in dev mode
  let widgetPort: number | null = null;
  if (options.dev) {
    const requestedWidgetPort = parseInt(options.widgetPort || "8082", 10);
    widgetPort = await findFreePort(requestedWidgetPort, 10, [port]);
    if (widgetPort !== requestedWidgetPort) {
      console.log(chalk.yellow(`  ⚠ Port ${requestedWidgetPort} busy, using ${widgetPort} for widget Metro`));
    }
  }

  const metroPort = await findFreePort(requestedMetroPort, 10, widgetPort ? [port, widgetPort] : [port]);

  if (port !== requestedPort) {
    console.log(chalk.yellow(`  ⚠ Port ${requestedPort} busy, using ${port} for prompt server`));
  }
  if (metroPort !== requestedMetroPort) {
    console.log(chalk.yellow(`  ⚠ Port ${requestedMetroPort} busy, using ${metroPort} for app Metro`));
  }

  // Resolve project directory
  let projectRoot = options.project ? path.resolve(options.project) : process.cwd();

  const packageRoot = getPackageRoot();
  const exampleDir = path.join(packageRoot, "example");
  if (!options.project && fs.existsSync(path.join(exampleDir, "app.json"))) {
    if (!fs.existsSync(path.join(projectRoot, "app.json"))) {
      projectRoot = exampleDir;
      console.log(chalk.gray(`\n  Using example app: ${projectRoot}`));
    }
  }

  // Validate project directory
  if (!fs.existsSync(path.join(projectRoot, "app.json")) && !fs.existsSync(path.join(projectRoot, "app.config.js"))) {
    console.log(chalk.red(`\n  ✗ No Expo app found at ${projectRoot}`));
    console.log(chalk.gray(`    Use --project to specify the app directory\n`));
    process.exit(1);
  }

  const widgetDir = path.join(packageRoot, "widget");

  // Verify widget directory exists
  if (!fs.existsSync(widgetDir)) {
    console.log(chalk.red(`\n  ✗ Widget directory not found: ${widgetDir}`));
    console.log(chalk.gray(`    __dirname: ${__dirname}`));
    process.exit(1);
  }

  // Step 2: Start Metro servers
  console.log(chalk.gray("\n  Starting Metro bundlers..."));

  const startMetro = async (
    name: string,
    cwd: string,
    metroPortNum: number
  ): Promise<ChildProcess | null> => {
    try {
      const proc = spawn("npx", ["expo", "start", "--port", String(metroPortNum)], {
        cwd,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          FORCE_COLOR: "1",
          PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
        },
      });

      // Wait for initial Metro output
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => resolve(), 3000);

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

      // Wait for port to actually be listening (Metro fully ready)
      await waitForPort(metroPortNum, 30000);

      console.log(chalk.green(`  ✓ ${name} Metro started on port ${metroPortNum}`));
      return proc;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  ⚠ ${name} Metro: ${message}`));
      return null;
    }
  };

  // Start widget Metro server only in dev mode
  // Production mode always uses pre-built widget bundle
  let widgetProcess: ChildProcess | null = null;

  if (options.dev) {
    console.log(chalk.blue(`  Starting widget Metro (dev mode)...`));
    widgetProcess = await startMetro("Widget", widgetDir, widgetPort!);
  } else {
    console.log(chalk.green(`  ✓ Using pre-built widget bundle`));
  }

  const appProcess = await startMetro("App", projectRoot, metroPort);

  // Step 3: Start prompt server
  console.log(chalk.gray("\n  Starting prompt server..."));
  const { PromptServer } = await import("../server/promptServer.js");
  const server = new PromptServer(port, projectRoot);
  await server.start();
  console.log(chalk.green(`  ✓ Prompt server started on port ${port}`));

  // Step 4: Start tunnels
  let promptTunnel: CloudflareTunnel | null = null;
  let widgetTunnel: CloudflareTunnel | null = null;
  let appTunnel: CloudflareTunnel | null = null;
  let promptTunnelUrl: string | null = null;
  let widgetTunnelUrl: string | null = null;
  let appTunnelUrl: string | null = null;

  if (options.tunnel) {
    console.log(chalk.gray("\n  Starting tunnels (this enables remote access)..."));

    let rateLimitHit = false;

    promptTunnel = new CloudflareTunnel();
    try {
      const info = await promptTunnel.start(port);
      promptTunnelUrl = info.url.replace("https://", "wss://");
      console.log(chalk.green(`  ✓ Prompt tunnel ready`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("rate limit") || message.includes("429")) {
        rateLimitHit = true;
      }
      console.log(chalk.red(`  ✗ Prompt tunnel failed`));
    }

    // Start widget tunnel only in dev mode
    if (!rateLimitHit && options.dev && widgetProcess && widgetPort) {
      widgetTunnel = new CloudflareTunnel();
      try {
        const info = await widgetTunnel.start(widgetPort);
        widgetTunnelUrl = info.url;
        console.log(chalk.green(`  ✓ Widget tunnel ready`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("rate limit") || message.includes("429")) {
          rateLimitHit = true;
        }
        console.log(chalk.red(`  ✗ Widget tunnel failed`));
      }
    }

    if (!rateLimitHit) {
      appTunnel = new CloudflareTunnel();
      try {
        const info = await appTunnel.start(metroPort);
        appTunnelUrl = info.url;
        console.log(chalk.green(`  ✓ App tunnel ready`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("rate limit") || message.includes("429")) {
          rateLimitHit = true;
        }
        console.log(chalk.red(`  ✗ App tunnel failed`));
      }
    }

    // Exit on rate limit - tunnels are required for device communication
    if (rateLimitHit) {
      console.log(chalk.red(`\n  ✗ Cloudflare rate limit reached (429 Too Many Requests)`));
      console.log(chalk.gray(`    This happens when too many tunnel requests are made.`));
      console.log(chalk.gray(`    Options:`));
      console.log(chalk.white(`      1. Wait a few minutes and try again`));
      console.log(chalk.white(`      2. Use --no-tunnel to run without tunnels`));
      console.log(chalk.white(`      3. Device must be on same WiFi as your computer\n`));
      process.exit(1);
    }

    // Update config files
    if (promptTunnelUrl || widgetTunnelUrl || appTunnelUrl) {
      const localConfigPath = path.join(projectRoot, ".expo-air.local.json");
      const localConfig: Partial<ExpoAirConfig> = {};

      if (promptTunnelUrl) localConfig.serverUrl = promptTunnelUrl;
      if (widgetTunnelUrl) localConfig.widgetMetroUrl = widgetTunnelUrl;
      if (appTunnelUrl) localConfig.appMetroUrl = appTunnelUrl;

      fs.writeFileSync(localConfigPath, JSON.stringify(localConfig, null, 2) + "\n");
      updateInfoPlist(projectRoot, localConfig);
      console.log(chalk.green(`  ✓ Updated config with tunnel URLs`));
    }
  }

  // Step 5: Build and install on device
  console.log(chalk.blue("\n  ─────────────────────────────────────────────"));
  console.log(chalk.blue(`  🚀 Building and installing on ${selectedDevice.name}`));
  console.log(chalk.gray(`     Device ID: ${selectedDevice.udid}`));
  console.log(chalk.blue("  ─────────────────────────────────────────────\n"));

  const buildArgs = [
    "expo",
    "run:ios",
    "--device",
    selectedDevice.udid,
    "--port",
    String(metroPort),
  ];

  const buildProcess = spawn("npx", buildArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, FORCE_COLOR: "1", CI: "1" },
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
  console.log(chalk.green("\n  ✈️  Takeoff successful!\n"));
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.gray("  Your app is now running on:"));
  console.log(chalk.white(`    📱 ${selectedDevice.name}`));
  console.log(chalk.gray("\n  Servers:"));
  console.log(chalk.white(`    Prompt:  ws://localhost:${port}`));
  if (widgetProcess) {
    console.log(chalk.white(`    Widget:  http://localhost:${widgetPort}`));
  } else {
    console.log(chalk.white(`    Widget:  (pre-built bundle)`));
  }
  console.log(chalk.white(`    App:     http://localhost:${metroPort}`));
  if (promptTunnelUrl) {
    console.log(chalk.gray("\n  Remote access (tunnels):"));
    console.log(chalk.white(`    Prompt:  ${promptTunnelUrl}`));
    if (widgetTunnelUrl) console.log(chalk.white(`    Widget:  ${widgetTunnelUrl}`));
    if (appTunnelUrl) console.log(chalk.white(`    App:     ${appTunnelUrl}`));
  }
  console.log(chalk.gray("  ─────────────────────────────────────────────"));
  console.log(chalk.yellow("\n  Waiting for prompts... (Ctrl+C to land)\n"));

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log(chalk.gray("\n  🛬 Landing..."));
    if (widgetProcess) widgetProcess.kill();
    if (appProcess) appProcess.kill();
    if (promptTunnel) await promptTunnel.stop();
    if (widgetTunnel) await widgetTunnel.stop();
    if (appTunnel) await appTunnel.stop();
    await server.stop();
    console.log(chalk.green("  ✓ Safe landing. See you next flight!\n"));
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

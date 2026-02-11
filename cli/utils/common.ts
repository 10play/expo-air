import * as net from "net";
import * as path from "path";
import * as fs from "fs";
import { platform } from "os";
import chalk from "chalk";
import plist from "plist";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration for an extra tunnel (e.g., API server)
 */
export interface ExtraTunnelConfig {
  /** The local port to tunnel */
  port: number;
  /** A friendly name for the tunnel (for logging) */
  name: string;
  /** The environment variable to write the tunnel URL to */
  envVar: string;
}

/**
 * Configuration interface for expo-air
 */
export interface ExpoAirConfig {
  autoShow?: boolean;
  serverUrl?: string;
  widgetMetroUrl?: string;
  appMetroUrl?: string;
  ui?: {
    bubbleSize?: number;
    bubbleColor?: string;
  };
  /** Path to the env file to update with extra tunnel URLs (relative to project root) */
  envFile?: string;
  /** Additional tunnels for API servers and other services */
  extraTunnels?: ExtraTunnelConfig[];
}

/**
 * Check if a port is listening (service is ready)
 */
export function waitForPort(port: number, timeout = 30000): Promise<void> {
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

/**
 * Get package root directory - works both from source and compiled code
 * Source: cli/utils -> 2 levels up
 * Compiled: cli/dist/utils -> 3 levels up
 */
export function getPackageRoot(): string {
  const fromSource = path.resolve(__dirname, "../..");
  const fromCompiled = path.resolve(__dirname, "../../..");

  // Check which one has the widget directory
  if (fs.existsSync(path.join(fromSource, "widget"))) {
    return fromSource;
  }
  return fromCompiled;
}

/**
 * Check if running from an npm installation (inside node_modules)
 */
export function isInstalledFromNpm(): boolean {
  return __dirname.includes("node_modules");
}

/**
 * Check if pre-built widget bundle exists
 */
export function hasPrebuiltWidgetBundle(): boolean {
  const packageRoot = getPackageRoot();
  const bundlePath = path.join(packageRoot, "ios", "widget.jsbundle");
  return fs.existsSync(bundlePath);
}

/**
 * Resolve the project root directory
 * - Uses explicit project path if provided
 * - Falls back to example directory if in package root
 * - Otherwise uses current working directory
 */
export function resolveProjectRoot(projectOption?: string): string {
  let projectRoot = projectOption ? path.resolve(projectOption) : process.cwd();

  const packageRoot = getPackageRoot();
  const exampleDir = path.join(packageRoot, "example");

  if (!projectOption && fs.existsSync(path.join(exampleDir, "app.json"))) {
    // Check if we're in the package root (not in example already)
    if (!fs.existsSync(path.join(projectRoot, "app.json"))) {
      projectRoot = exampleDir;
    }
  }

  return projectRoot;
}

/**
 * Validate that a directory contains an Expo project
 */
export function validateExpoProject(projectRoot: string): boolean {
  return (
    fs.existsSync(path.join(projectRoot, "app.json")) ||
    fs.existsSync(path.join(projectRoot, "app.config.js"))
  );
}

/**
 * Directly update Info.plist with tunnel URLs.
 * This allows URL changes without running `npx expo prebuild`.
 * Just rebuild the app (Cmd+R in Xcode) after this.
 */
export function updateInfoPlist(
  projectRoot: string,
  config: Partial<ExpoAirConfig>,
  options: { silent?: boolean } = {}
): boolean {
  const iosDir = path.join(projectRoot, "ios");
  if (!fs.existsSync(iosDir)) {
    if (!options.silent) {
      console.log(chalk.yellow(`  No ios directory found at ${iosDir}`));
    }
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
    if (!options.silent) {
      console.log(chalk.yellow(`  Could not find Info.plist in ios directory`));
    }
    return false;
  }

  try {
    const plistContent = fs.readFileSync(infoPlistPath, "utf-8");
    const plistData = plist.parse(plistContent) as Record<string, unknown>;

    // Get or create ExpoAir dictionary
    const expoAir = (plistData.ExpoAir as Record<string, unknown>) || {};

    // Update with new tunnel URLs
    if (config.serverUrl) expoAir.serverUrl = config.serverUrl;
    if (config.widgetMetroUrl) expoAir.widgetMetroUrl = config.widgetMetroUrl;
    if (config.appMetroUrl) expoAir.appMetroUrl = config.appMetroUrl;

    // Sync UI settings from .expo-air.json
    const baseConfigPath = path.join(projectRoot, ".expo-air.json");
    if (fs.existsSync(baseConfigPath)) {
      const baseConfig = JSON.parse(fs.readFileSync(baseConfigPath, "utf-8"));
      if (baseConfig.autoShow !== undefined) expoAir.autoShow = baseConfig.autoShow;
      if (baseConfig.ui?.bubbleSize !== undefined) expoAir.bubbleSize = baseConfig.ui.bubbleSize;
      if (baseConfig.ui?.bubbleColor !== undefined) expoAir.bubbleColor = baseConfig.ui.bubbleColor;
    }

    // Write back
    plistData.ExpoAir = expoAir;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedPlist = plist.build(plistData as any);
    fs.writeFileSync(infoPlistPath, updatedPlist);

    return true;
  } catch (err) {
    if (!options.silent) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  Failed to update Info.plist: ${message}`));
    }
    return false;
  }
}

/**
 * Directly update AndroidManifest.xml with tunnel URLs.
 * This allows URL changes without running `npx expo prebuild`.
 * Same pattern as updateInfoPlist() for iOS.
 */
export function updateAndroidManifest(
  projectRoot: string,
  config: Partial<ExpoAirConfig>,
  options: { silent?: boolean } = {}
): boolean {
  const manifestPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml"
  );

  if (!fs.existsSync(manifestPath)) {
    if (!options.silent) {
      console.log(chalk.yellow(`  No AndroidManifest.xml found at ${manifestPath}`));
    }
    return false;
  }

  try {
    let content = fs.readFileSync(manifestPath, "utf-8");

    const metaDataEntries: Record<string, string> = {};
    if (config.serverUrl) metaDataEntries["expo.modules.expoair.SERVER_URL"] = config.serverUrl;
    if (config.widgetMetroUrl) metaDataEntries["expo.modules.expoair.WIDGET_METRO_URL"] = config.widgetMetroUrl;
    if (config.appMetroUrl) metaDataEntries["expo.modules.expoair.APP_METRO_URL"] = config.appMetroUrl;

    for (const [name, value] of Object.entries(metaDataEntries)) {
      const existingPattern = new RegExp(
        `<meta-data\\s+android:name="${name.replace(/\./g, "\\.")}"\\s+android:value="[^"]*"\\s*/>`,
        "g"
      );

      const metaTag = `<meta-data android:name="${name}" android:value="${value}" />`;

      if (existingPattern.test(content)) {
        // Replace existing entry
        content = content.replace(existingPattern, metaTag);
      } else {
        // Insert before closing </application> tag
        content = content.replace(
          "</application>",
          `        ${metaTag}\n    </application>`
        );
      }
    }

    fs.writeFileSync(manifestPath, content);
    return true;
  } catch (err) {
    if (!options.silent) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(chalk.yellow(`  Failed to update AndroidManifest.xml: ${message}`));
    }
    return false;
  }
}

/**
 * Write local config file with tunnel URLs
 */
export function writeLocalConfig(
  projectRoot: string,
  config: Partial<ExpoAirConfig>
): void {
  const localConfigPath = path.join(projectRoot, ".expo-air.local.json");
  fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2) + "\n");
}

/**
 * Read the .expo-air.json config file
 */
export function readExpoAirConfig(projectRoot: string): ExpoAirConfig | null {
  const configPath = path.join(projectRoot, ".expo-air.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content) as ExpoAirConfig;
  } catch {
    return null;
  }
}

/**
 * Update an env file with key-value pairs
 * Preserves existing values and adds/updates the specified keys
 */
export function updateEnvFile(
  envFilePath: string,
  updates: Record<string, string>
): void {
  let content = "";
  const existingVars: Record<string, string> = {};

  // Read existing env file if it exists
  if (fs.existsSync(envFilePath)) {
    content = fs.readFileSync(envFilePath, "utf-8");

    // Parse existing variables
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        existingVars[match[1]] = match[2];
      }
    }
  }

  // Update/add new variables
  const updatedVars = { ...existingVars, ...updates };

  // Rebuild the file, preserving comments and structure
  const lines = content.split("\n");
  const result: string[] = [];
  const handledKeys = new Set<string>();

  for (const line of lines) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match && updates[match[1]] !== undefined) {
      // Replace this line with updated value
      result.push(`${match[1]}=${updates[match[1]]}`);
      handledKeys.add(match[1]);
    } else {
      result.push(line);
    }
  }

  // Add any new keys that weren't in the original file
  const newKeys = Object.keys(updates).filter((k) => !handledKeys.has(k));
  if (newKeys.length > 0) {
    // Add a blank line if the file doesn't end with one
    if (result.length > 0 && result[result.length - 1].trim() !== "") {
      result.push("");
    }
    result.push("# expo-air extra tunnels (auto-generated)");
    for (const key of newKeys) {
      result.push(`${key}=${updates[key]}`);
    }
  }

  // Write the file
  const finalContent = result.join("\n").trim() + "\n";
  fs.writeFileSync(envFilePath, finalContent);
}

/**
 * Get the current git branch name, sanitized for use in bundle IDs.
 * Returns null if not in a git repo or if git command fails.
 *
 * Bundle IDs can only contain alphanumeric characters and hyphens.
 * The result is lowercased and truncated to 30 characters.
 */
/**
 * Mask the secret query parameter in a URL for safe logging.
 */
export function maskSecret(url: string): string {
  return url.replace(/([?&])secret=[^&]+/, "$1secret=***");
}

/**
 * Append a secret query parameter to a URL.
 */
export function appendSecret(url: string, secret: string | null): string {
  return secret ? `${url}?secret=${secret}` : url;
}

/**
 * Resolve JAVA_HOME for Android builds.
 * Android Gradle Plugin requires Java 17+.
 * Returns a valid JAVA_HOME path, or null if current env is fine.
 */
export function resolveAndroidJavaHome(): string | null {
  const currentJavaHome = process.env.JAVA_HOME;
  if (currentJavaHome) {
    try {
      const version = execSync(`"${path.join(currentJavaHome, "bin", "java")}" -version 2>&1`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      const match = version.match(/version "(\d+)/);
      if (match && parseInt(match[1], 10) >= 17) {
        return null; // Current JAVA_HOME is fine
      }
    } catch {
      // Can't check version, try to find a better one
    }
  }

  if (platform() === "darwin") {
    const asJdk = "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
    if (fs.existsSync(path.join(asJdk, "bin", "java"))) {
      return asJdk;
    }
  }

  if (process.env.ANDROID_STUDIO_JAVA_HOME && fs.existsSync(process.env.ANDROID_STUDIO_JAVA_HOME)) {
    return process.env.ANDROID_STUDIO_JAVA_HOME;
  }

  return null;
}

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

/**
 * Detect the package manager used in a project by checking lock files.
 */
export function detectPackageManager(projectRoot: string): PackageManager {
  let dir = projectRoot;
  while (true) {
    if (
      fs.existsSync(path.join(dir, "bun.lockb")) ||
      fs.existsSync(path.join(dir, "bun.lock"))
    ) {
      return "bun";
    }
    if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(dir, "yarn.lock"))) {
      return "yarn";
    }
    if (fs.existsSync(path.join(dir, "package-lock.json"))) {
      return "npm";
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "npm";
}

/**
 * Get the command and args prefix for executing a local package binary.
 * Equivalent of `npx` for each package manager.
 *
 * Usage: spawn(exec.cmd, [...exec.args, "expo", "prebuild", "--clean"])
 */
export function getExecCommand(pm: PackageManager): { cmd: string; args: string[] } {
  switch (pm) {
    case "bun": return { cmd: "bunx", args: [] };
    case "pnpm": return { cmd: "pnpm", args: ["exec"] };
    case "yarn": return { cmd: "yarn", args: [] };
    case "npm": return { cmd: "npx", args: [] };
  }
}

/**
 * Get the full install command string for a package.
 */
export function getInstallCommand(pm: PackageManager, pkg: string): string {
  switch (pm) {
    case "bun": return `bun add ${pkg}`;
    case "pnpm": return `pnpm add ${pkg}`;
    case "yarn": return `yarn add ${pkg}`;
    case "npm": return `npm install ${pkg}`;
  }
}

/**
 * Get command + args for running a package.json script with extra args.
 *
 * Usage: spawn(run.cmd, run.args)
 */
export function getRunScriptCommand(
  pm: PackageManager,
  script: string,
  extraArgs: string[]
): { cmd: string; args: string[] } {
  switch (pm) {
    case "npm": return { cmd: "npm", args: [script, "--", ...extraArgs] };
    case "yarn": return { cmd: "yarn", args: [script, ...extraArgs] };
    case "pnpm": return { cmd: "pnpm", args: [script, ...extraArgs] };
    case "bun": return { cmd: "bun", args: ["run", script, ...extraArgs] };
  }
}

export function getGitBranchSuffix(cwd?: string): string | null {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: cwd ?? process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (!branch || branch === "HEAD") {
      return null;
    }

    // Sanitize for bundle ID:
    // - Replace invalid characters with hyphens
    // - Collapse multiple hyphens
    // - Remove leading/trailing hyphens
    // - Lowercase
    // - Truncate to 30 chars
    const sanitized = branch
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 30);

    return sanitized || null;
  } catch {
    return null;
  }
}

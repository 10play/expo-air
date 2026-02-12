import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { detectPackageManager, getExecCommand } from "./packageManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    if (!validateExpoProject(projectRoot)) {
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
    fs.existsSync(path.join(projectRoot, "app.config.js")) ||
    fs.existsSync(path.join(projectRoot, "app.config.ts"))
  );
}

/**
 * Get the app's bundle identifier from the Xcode project or Expo config.
 * Tries pbxproj first, then resolves the Expo config (app.json, app.config.js, app.config.ts)
 * via `npx expo config`.
 */
export function getAppBundleId(projectRoot: string): string | null {
  // Try pbxproj first (most reliable for built apps)
  const iosDir = path.join(projectRoot, "ios");
  if (fs.existsSync(iosDir)) {
    const entries = fs.readdirSync(iosDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith(".xcodeproj")) {
        const pbxprojPath = path.join(iosDir, entry.name, "project.pbxproj");
        if (fs.existsSync(pbxprojPath)) {
          try {
            const pbxContent = fs.readFileSync(pbxprojPath, "utf-8");
            const match = pbxContent.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";]+)"?/);
            if (match?.[1]) return match[1];
          } catch {}
        }
      }
    }
  }

  // Try resolving via Expo config (handles app.json, app.config.js, app.config.ts)
  try {
    const pm = detectPackageManager(projectRoot);
    const exec = getExecCommand(pm);
    const output = execFileSync(exec.cmd, [...exec.args, "expo", "config", "--json", "--type", "public"], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15000,
    });
    const config = JSON.parse(output.toString());
    const bundleId = config?.ios?.bundleIdentifier;
    if (bundleId) return bundleId;
  } catch {}

  return null;
}

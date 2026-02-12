import * as path from "path";
import * as fs from "fs";

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
  const _updatedVars = { ...existingVars, ...updates };

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

import * as path from "path";
import * as fs from "fs";
import { platform } from "os";
import { execSync } from "child_process";
import chalk from "chalk";
import plist from "plist";
import type { ExpoAirConfig } from "./config.js";

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

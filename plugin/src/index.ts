import {
  ConfigPlugin,
  withInfoPlist,
  withDangerousMod,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

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

// Modify AppDelegate to use tunnel URL for main app bundle
const withAppDelegatePatch: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appDelegatePath = path.join(
        projectRoot,
        "ios",
        config.modRequest.projectName || "",
        "AppDelegate.swift"
      );

      if (!fs.existsSync(appDelegatePath)) {
        console.warn("[expo-air] AppDelegate.swift not found");
        return config;
      }

      let content = fs.readFileSync(appDelegatePath, "utf-8");

      // Check if already patched
      if (content.includes("ExpoAirBundleURL")) {
        return config;
      }

      // Find the bundleURL() method and patch it
      const bundleURLPattern =
        /override func bundleURL\(\) -> URL\? \{[\s\S]*?#if DEBUG[\s\S]*?return RCTBundleURLProvider[\s\S]*?#else[\s\S]*?#endif[\s\S]*?\}/;

      const patchedBundleURL = `override func bundleURL() -> URL? {
#if DEBUG
    // ExpoAirBundleURL: Check for tunnel URL from Info.plist
    if let expoAir = Bundle.main.object(forInfoDictionaryKey: "ExpoAir") as? [String: Any],
       let appMetroUrl = expoAir["appMetroUrl"] as? String,
       !appMetroUrl.isEmpty,
       let tunnelURL = URL(string: "\\(appMetroUrl)/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true") {
      print("[expo-air] Using tunnel URL for main app: \\(tunnelURL)")
      return tunnelURL
    }
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }`;

      if (bundleURLPattern.test(content)) {
        content = content.replace(bundleURLPattern, patchedBundleURL);
        fs.writeFileSync(appDelegatePath, content);
        console.log("[expo-air] Patched AppDelegate for tunnel support");
      }

      return config;
    },
  ]);
};

const withExpoAir: ConfigPlugin = (config) => {
  // First patch AppDelegate
  config = withAppDelegatePatch(config);

  // Then modify Info.plist
  return withInfoPlist(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;

    // Read base config from .expo-air.json (committed, UI settings)
    const configPath = path.join(projectRoot, ".expo-air.json");
    // Read local config from .expo-air.local.json (gitignored, URLs/secrets)
    const localConfigPath = path.join(projectRoot, ".expo-air.local.json");

    let expoAirConfig: ExpoAirConfig = {};

    // Load base config
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        expoAirConfig = JSON.parse(content);
      } catch (e) {
        console.warn("[expo-air] Failed to parse .expo-air.json:", e);
      }
    }

    // Merge local config (overrides base config)
    if (fs.existsSync(localConfigPath)) {
      try {
        const localContent = fs.readFileSync(localConfigPath, "utf-8");
        const localConfig = JSON.parse(localContent);
        // Merge: local values override base values
        expoAirConfig = {
          ...expoAirConfig,
          ...localConfig,
          ui: { ...expoAirConfig.ui, ...localConfig.ui },
        };
        console.log("[expo-air] Merged local config from .expo-air.local.json");
      } catch (e) {
        console.warn("[expo-air] Failed to parse .expo-air.local.json:", e);
      }
    }

    // Write to Info.plist under ExpoAir key
    // Note: Empty strings for URLs will trigger fallback logic in native code
    // SDK developers get localhost fallback, npm users get pre-built bundle
    config.modResults.ExpoAir = {
      autoShow: expoAirConfig.autoShow ?? true,
      bubbleSize: expoAirConfig.ui?.bubbleSize ?? 60,
      bubbleColor: expoAirConfig.ui?.bubbleColor ?? "#007AFF",
      serverUrl: expoAirConfig.serverUrl ?? "",
      widgetMetroUrl: expoAirConfig.widgetMetroUrl ?? "",
      appMetroUrl: expoAirConfig.appMetroUrl ?? "",
    };

    // Allow HTTP connections to bore.pub for tunnel support
    // This is needed because iOS ATS blocks non-HTTPS by default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modResults = config.modResults as any;
    const ats = modResults.NSAppTransportSecurity || {};
    const exceptionDomains = ats.NSExceptionDomains || {};

    // Add tunnel domain exceptions for various tunnel providers
    exceptionDomains["bore.pub"] = {
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    };
    exceptionDomains["loca.lt"] = {
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    };
    exceptionDomains["trycloudflare.com"] = {
      NSExceptionAllowsInsecureHTTPLoads: true,
      NSIncludesSubdomains: true,
    };

    ats.NSExceptionDomains = exceptionDomains;
    modResults.NSAppTransportSecurity = ats;

    return config;
  });
};

export default withExpoAir;

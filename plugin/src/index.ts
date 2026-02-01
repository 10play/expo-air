import {
  ConfigPlugin,
  withInfoPlist,
  withDangerousMod,
} from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

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
        console.warn("[expo-flow] AppDelegate.swift not found");
        return config;
      }

      let content = fs.readFileSync(appDelegatePath, "utf-8");

      // Check if already patched
      if (content.includes("ExpoFlowBundleURL")) {
        return config;
      }

      // Find the bundleURL() method and patch it
      const bundleURLPattern =
        /override func bundleURL\(\) -> URL\? \{[\s\S]*?#if DEBUG[\s\S]*?return RCTBundleURLProvider[\s\S]*?#else[\s\S]*?#endif[\s\S]*?\}/;

      const patchedBundleURL = `override func bundleURL() -> URL? {
#if DEBUG
    // ExpoFlowBundleURL: Check for tunnel URL from Info.plist
    if let expoFlow = Bundle.main.object(forInfoDictionaryKey: "ExpoFlow") as? [String: Any],
       let appMetroUrl = expoFlow["appMetroUrl"] as? String,
       !appMetroUrl.isEmpty,
       let tunnelURL = URL(string: "\\(appMetroUrl)/.expo/.virtual-metro-entry.bundle?platform=ios&dev=true") {
      print("[expo-flow] Using tunnel URL for main app: \\(tunnelURL)")
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
        console.log("[expo-flow] Patched AppDelegate for tunnel support");
      }

      return config;
    },
  ]);
};

const withExpoFlow: ConfigPlugin = (config) => {
  // First patch AppDelegate
  config = withAppDelegatePatch(config);

  // Then modify Info.plist
  return withInfoPlist(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;

    // Read base config from .expo-flow.json (committed, UI settings)
    const configPath = path.join(projectRoot, ".expo-flow.json");
    // Read local config from .expo-flow.local.json (gitignored, URLs/secrets)
    const localConfigPath = path.join(projectRoot, ".expo-flow.local.json");

    let expoFlowConfig: ExpoFlowConfig = {};

    // Load base config
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        expoFlowConfig = JSON.parse(content);
      } catch (e) {
        console.warn("[expo-flow] Failed to parse .expo-flow.json:", e);
      }
    }

    // Merge local config (overrides base config)
    if (fs.existsSync(localConfigPath)) {
      try {
        const localContent = fs.readFileSync(localConfigPath, "utf-8");
        const localConfig = JSON.parse(localContent);
        // Merge: local values override base values
        expoFlowConfig = {
          ...expoFlowConfig,
          ...localConfig,
          ui: { ...expoFlowConfig.ui, ...localConfig.ui },
        };
        console.log("[expo-flow] Merged local config from .expo-flow.local.json");
      } catch (e) {
        console.warn("[expo-flow] Failed to parse .expo-flow.local.json:", e);
      }
    }

    // Write to Info.plist under ExpoFlow key
    config.modResults.ExpoFlow = {
      autoShow: expoFlowConfig.autoShow ?? true,
      bubbleSize: expoFlowConfig.ui?.bubbleSize ?? 60,
      bubbleColor: expoFlowConfig.ui?.bubbleColor ?? "#007AFF",
      serverUrl: expoFlowConfig.serverUrl ?? "ws://localhost:3847",
      widgetMetroUrl: expoFlowConfig.widgetMetroUrl ?? "http://localhost:8082",
      appMetroUrl: expoFlowConfig.appMetroUrl ?? "",
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

export default withExpoFlow;

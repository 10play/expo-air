import {
  ConfigPlugin,
  withInfoPlist,
  withDangerousMod,
  AndroidConfig,
  withAndroidManifest,
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

      // Patch bridging header to expose RCTBridge to Swift.
      // The prebuilt React.framework module map doesn't include RCTBridge.h,
      // but the generated AppDelegate references RCTBridge in sourceURL(for:).
      const bridgingHeaderPath = path.join(
        projectRoot,
        "ios",
        config.modRequest.projectName || "",
        `${config.modRequest.projectName || ""}-Bridging-Header.h`
      );
      if (fs.existsSync(bridgingHeaderPath)) {
        let header = fs.readFileSync(bridgingHeaderPath, "utf-8");
        if (!header.includes("RCTBridge.h")) {
          header += `#import <React/RCTBridge.h>\n`;
          fs.writeFileSync(bridgingHeaderPath, header);
          console.log("[expo-air] Patched bridging header for RCTBridge");
        }
      }

      return config;
    },
  ]);
};

// Inject HMR auto-reconnect import into the app's JS entry point.
// Triggered on "ios" mod but modifies JS files (platform-agnostic).
// Also triggered on "android" to ensure it runs during android-only prebuild.
const injectHMRReconnect = async (config: any) => {
  const projectRoot = config.modRequest.projectRoot;
  const hmrImport = `import "@10play/expo-air/build/hmrReconnect";\n`;

  const candidates = [
    "app/_layout.tsx",
    "app/_layout.js",
    "App.tsx",
    "App.js",
    "index.tsx",
    "index.js",
  ];

  for (const candidate of candidates) {
    const entryPath = path.join(projectRoot, candidate);
    if (fs.existsSync(entryPath)) {
      let content = fs.readFileSync(entryPath, "utf-8");
      if (content.includes("@10play/expo-air/build/hmrReconnect")) {
        return config;
      }
      content = hmrImport + content;
      fs.writeFileSync(entryPath, content);
      console.log(`[expo-air] Injected HMR auto-reconnect into ${candidate}`);
      return config;
    }
  }

  console.warn("[expo-air] Could not find app entry point for HMR reconnect injection");
  return config;
};

const withHMRReconnect: ConfigPlugin = (config) => {
  // Run on iOS prebuild
  config = withDangerousMod(config, ["ios", injectHMRReconnect]);
  // Also run on Android prebuild (modifies JS, not native)
  config = withDangerousMod(config, ["android", injectHMRReconnect]);
  return config;
};

// Load expo-air config from .expo-air.json + .expo-air.local.json
function loadExpoAirConfig(projectRoot: string): ExpoAirConfig {
  let expoAirConfig: ExpoAirConfig = {};

  const configPath = path.join(projectRoot, ".expo-air.json");
  const localConfigPath = path.join(projectRoot, ".expo-air.local.json");

  if (fs.existsSync(configPath)) {
    try {
      expoAirConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch (e) {
      console.warn("[expo-air] Failed to parse .expo-air.json:", e);
    }
  }

  if (fs.existsSync(localConfigPath)) {
    try {
      const localConfig = JSON.parse(fs.readFileSync(localConfigPath, "utf-8"));
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

  return expoAirConfig;
}

// Add <meta-data> entries to AndroidManifest.xml under <application>
const withAndroidManifestConfig: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const expoAirConfig = loadExpoAirConfig(projectRoot);

    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults
    );

    if (!mainApplication["meta-data"]) {
      mainApplication["meta-data"] = [];
    }

    const metaData: Record<string, string> = {
      "expo.modules.expoair.AUTO_SHOW": String(expoAirConfig.autoShow ?? true),
      "expo.modules.expoair.BUBBLE_SIZE": String(expoAirConfig.ui?.bubbleSize ?? 60),
      "expo.modules.expoair.BUBBLE_COLOR": expoAirConfig.ui?.bubbleColor ?? "#000000",
      "expo.modules.expoair.SERVER_URL": expoAirConfig.serverUrl ?? "",
      "expo.modules.expoair.WIDGET_METRO_URL": expoAirConfig.widgetMetroUrl ?? "",
      "expo.modules.expoair.APP_METRO_URL": expoAirConfig.appMetroUrl ?? "",
    };

    for (const [name, value] of Object.entries(metaData)) {
      // Remove existing entry if present
      mainApplication["meta-data"] = mainApplication["meta-data"].filter(
        (item: any) => item.$?.["android:name"] !== name
      );
      // Add new entry
      mainApplication["meta-data"].push({
        $: {
          "android:name": name,
          "android:value": value,
        },
      });
    }

    return config;
  });
};

// Write network_security_config.xml for cleartext traffic to tunnel domains and emulator
const withNetworkSecurityConfig: ConfigPlugin = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const resXmlDir = path.join(projectRoot, "android", "app", "src", "main", "res", "xml");

      if (!fs.existsSync(resXmlDir)) {
        fs.mkdirSync(resXmlDir, { recursive: true });
      }

      const networkSecurityConfig = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">bore.pub</domain>
    <domain includeSubdomains="true">loca.lt</domain>
    <domain includeSubdomains="true">trycloudflare.com</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
    <domain includeSubdomains="true">localhost</domain>
  </domain-config>
</network-security-config>`;

      fs.writeFileSync(
        path.join(resXmlDir, "network_security_config.xml"),
        networkSecurityConfig
      );
      console.log("[expo-air] Wrote network_security_config.xml");

      return config;
    },
  ]);
};

// Add networkSecurityConfig attribute to AndroidManifest <application>
const withNetworkSecurityAttribute: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults
    );

    mainApplication.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";

    return config;
  });
};

const withExpoAir: ConfigPlugin = (config) => {
  // iOS: Patch AppDelegate for tunnel support
  config = withAppDelegatePatch(config);

  // Android: Add <meta-data> to AndroidManifest
  config = withAndroidManifestConfig(config);

  // Android: Network security config for cleartext traffic
  config = withNetworkSecurityConfig(config);
  config = withNetworkSecurityAttribute(config);

  // Both: Inject HMR auto-reconnect
  config = withHMRReconnect(config);

  // iOS: Modify Info.plist
  return withInfoPlist(config, (config) => {
    const projectRoot = config.modRequest.projectRoot;
    const expoAirConfig = loadExpoAirConfig(projectRoot);

    // Write to Info.plist under ExpoAir key
    config.modResults.ExpoAir = {
      autoShow: expoAirConfig.autoShow ?? true,
      bubbleSize: expoAirConfig.ui?.bubbleSize ?? 60,
      bubbleColor: expoAirConfig.ui?.bubbleColor ?? "#000000",
      serverUrl: expoAirConfig.serverUrl ?? "",
      widgetMetroUrl: expoAirConfig.widgetMetroUrl ?? "",
      appMetroUrl: expoAirConfig.appMetroUrl ?? "",
    };

    // Allow HTTP connections for tunnel support (iOS ATS)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modResults = config.modResults as any;
    const ats = modResults.NSAppTransportSecurity || {};
    const exceptionDomains = ats.NSExceptionDomains || {};

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

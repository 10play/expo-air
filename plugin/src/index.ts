import { ConfigPlugin, withInfoPlist } from "@expo/config-plugins";
import * as fs from "fs";
import * as path from "path";

interface ExpoFlowConfig {
  autoShow?: boolean;
  ui?: {
    bubbleSize?: number;
    bubbleColor?: string;
  };
}

const withExpoFlow: ConfigPlugin = (config) => {
  return withInfoPlist(config, (config) => {
    // Try to read .expo-flow.json from project root
    const projectRoot = config.modRequest.projectRoot;
    const configPath = path.join(projectRoot, ".expo-flow.json");

    let expoFlowConfig: ExpoFlowConfig = {};

    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, "utf-8");
        expoFlowConfig = JSON.parse(content);
      } catch (e) {
        console.warn("[expo-flow] Failed to parse .expo-flow.json:", e);
      }
    }

    // Write to Info.plist under ExpoFlow key
    config.modResults.ExpoFlow = {
      autoShow: expoFlowConfig.autoShow ?? true,
      bubbleSize: expoFlowConfig.ui?.bubbleSize ?? 60,
      bubbleColor: expoFlowConfig.ui?.bubbleColor ?? "#007AFF",
    };

    return config;
  });
};

export default withExpoFlow;

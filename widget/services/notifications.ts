/**
 * Push notification service for expo-air widget.
 * Uses native WidgetBridge for permission requests since the widget runs in an
 * isolated React Native runtime that can't access the main app's modules.
 *
 * Note: The widget is only shown in the host app's DEBUG mode (controlled by native code).
 */

import { NativeModules } from "react-native";

const { WidgetBridge } = NativeModules;

/**
 * Request push notification permissions and get push token via native bridge.
 * @returns Push token string or null if failed/denied
 */
export async function requestPushToken(): Promise<string | null> {
  try {
    if (!WidgetBridge?.requestPushToken) {
      console.log("[expo-air] WidgetBridge.requestPushToken not available");
      return null;
    }

    console.log("[expo-air] Requesting push token via native bridge");
    const token = await WidgetBridge.requestPushToken();

    if (token) {
      console.log("[expo-air] Got push token:", token);
      return token;
    } else {
      console.log("[expo-air] Push notification permission denied or token unavailable");
      return null;
    }
  } catch (error) {
    console.error("[expo-air] Failed to get push token:", error);
    return null;
  }
}

/**
 * Setup tap handler for expo-air notifications.
 * Note: Notification tap handling requires expo-notifications in the main app.
 * This is a no-op in the widget since we can't access expo-notifications.
 * @param onTap Callback when user taps an expo-air notification
 * @returns Cleanup function to remove listener
 */
export function setupTapHandler(
  onTap: (promptId?: string, success?: boolean) => void
): () => void {
  // Notification tap handling would require expo-notifications which isn't
  // available in the widget's isolated runtime. The main app handles this.
  console.log("[expo-air] setupTapHandler: tap handling managed by main app");
  return () => {};
}

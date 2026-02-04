/**
 * Push notification service for expo-air widget.
 * Dev-only: all functions return early if not in __DEV__ mode.
 * Does NOT override existing app notification handlers.
 * Fails silently if push notifications aren't configured or expo-notifications isn't installed.
 */

const EXPO_AIR_SOURCE = "expo-air";

// Lazy-loaded notifications module (may not be available)
let Notifications: typeof import("expo-notifications") | null = null;

async function getNotifications(): Promise<typeof import("expo-notifications") | null> {
  if (Notifications) return Notifications;
  try {
    Notifications = await import("expo-notifications");
    return Notifications;
  } catch {
    return null;
  }
}

/**
 * Request push notification permissions and get Expo push token.
 * Only runs in __DEV__ mode.
 * @returns Expo push token string or null if failed/denied
 */
export async function requestPushToken(): Promise<string | null> {
  if (!__DEV__) return null;

  try {
    const notif = await getNotifications();
    if (!notif) {
      console.log("[expo-air] expo-notifications not available");
      return null;
    }

    const { status: existingStatus } = await notif.getPermissionsAsync();

    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await notif.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[expo-air] Push notification permission denied");
      return null;
    }

    // Get Expo push token
    const tokenData = await notif.getExpoPushTokenAsync({
      projectId: undefined, // Uses EAS projectId from app.json
    });

    console.log("[expo-air] Push token:", tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error("[expo-air] Failed to get push token:", error);
    return null;
  }
}

/**
 * Setup tap handler for expo-air notifications.
 * Uses addNotificationResponseReceivedListener (additive, non-overriding).
 * Filters by data.source === "expo-air" to ignore other app notifications.
 * Only runs in __DEV__ mode.
 * @param onTap Callback when user taps an expo-air notification
 * @returns Cleanup function to remove listener
 */
export function setupTapHandler(
  onTap: (promptId?: string, success?: boolean) => void
): () => void {
  if (!__DEV__) return () => {};

  // Start async setup, return cleanup that handles pending setup
  let subscription: { remove: () => void } | null = null;
  let cancelled = false;

  (async () => {
    try {
      const notif = await getNotifications();
      if (!notif || cancelled) return;

      subscription = notif.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data as {
            source?: string;
            promptId?: string;
            success?: boolean;
          };

          // Only handle expo-air notifications
          if (data?.source !== EXPO_AIR_SOURCE) {
            return;
          }

          console.log("[expo-air] Notification tapped:", data);
          onTap(data.promptId, data.success);
        }
      );
    } catch (error) {
      // Fail silently if notifications aren't configured
      console.log("[expo-air] Notifications not available:", error);
    }
  })();

  return () => {
    cancelled = true;
    subscription?.remove();
  };
}

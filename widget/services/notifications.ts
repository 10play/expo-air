/**
 * Push notification service for expo-air widget.
 * Does NOT override existing app notification handlers.
 * Fails silently if push notifications aren't configured or expo-notifications isn't installed.
 *
 * Note: The widget is only shown in the host app's DEBUG mode (controlled by native code),
 * so we don't need __DEV__ checks here. The pre-built widget bundle is always a production
 * build (via expo export), so __DEV__ would always be false anyway.
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
 * @returns Expo push token string or null if failed/denied
 */
export async function requestPushToken(): Promise<string | null> {
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
 * @param onTap Callback when user taps an expo-air notification
 * @returns Cleanup function to remove listener
 */
export function setupTapHandler(
  onTap: (promptId?: string, success?: boolean) => void
): () => void {

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
